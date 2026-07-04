use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use rmcp::{
    model::CallToolRequestParams,
    service::{RoleClient, RunningService, ServiceExt},
    transport::TokioChildProcess,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::State;
use tokio::process::Command;
use tokio::sync::{Mutex, Notify};
use tokio::time::timeout;

use crate::modules::workspace::{authorize_agent_existing_path, WorkspaceEnv, WorkspaceRegistry};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(45);
const CALL_TIMEOUT: Duration = Duration::from_secs(60);
const CLOSE_TIMEOUT: Duration = Duration::from_secs(1);
const MAX_SERVER_ID_BYTES: usize = 64;
const MAX_COMMAND_BYTES: usize = 512;
const MAX_ARGS: usize = 20;
const MAX_ARG_BYTES: usize = 512;
const MAX_TOOL_NAME_BYTES: usize = 128;
const MAX_INPUT_BYTES: usize = 32 * 1024;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;

type McpClient = RunningService<RoleClient, ()>;

struct CachedClient {
    signature: String,
    client: Mutex<Option<McpClient>>,
}

/// Removes a request's cancellation token when the in-flight call finishes,
/// however it finishes (success, error, timeout, or cancellation) — a Drop
/// guard covers every early-return path in `call_tool` uniformly.
struct CancelGuard<'a> {
    state: &'a McpState,
    request_id: String,
}

impl Drop for CancelGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut tokens) = self.state.cancel_tokens.lock() {
            tokens.remove(&self.request_id);
        }
    }
}

#[derive(Default)]
pub struct McpState {
    clients: Mutex<HashMap<String, Arc<CachedClient>>>,
    // Plain sync mutex, never held across an `.await` — a cancel request must
    // never block on the same lock an in-flight `call_tool` holds for its
    // entire duration (see `call_tool`'s `clients` guard below).
    cancel_tokens: std::sync::Mutex<HashMap<String, Arc<Notify>>>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStdioCallRequest {
    request_id: String,
    server_id: String,
    command: String,
    args: Vec<String>,
    tool_name: String,
    input: Map<String, Value>,
    #[serde(skip)]
    cwd: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStdioListToolsRequest {
    server_id: String,
    command: String,
    args: Vec<String>,
    #[serde(skip)]
    cwd: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStdioCallResponse {
    transport: &'static str,
    server_info: Value,
    reused_client: bool,
    output: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStdioListToolsResponse {
    transport: &'static str,
    server_info: Value,
    reused_client: bool,
    tools: Value,
}

impl McpState {
    async fn cached_client(
        &self,
        server_id: &str,
        command: &str,
        args: &[String],
        cwd: Option<&str>,
    ) -> (Arc<CachedClient>, Option<Arc<CachedClient>>, bool) {
        let signature = serde_json::to_string(&(command, args, cwd))
            .expect("MCP server signature serialization cannot fail");
        let mut clients = self.clients.lock().await;
        if let Some(existing) = clients.get(server_id) {
            if existing.signature == signature {
                return (existing.clone(), None, true);
            }
        }
        let cached = Arc::new(CachedClient {
            signature,
            client: Mutex::new(None),
        });
        let replaced = clients.insert(server_id.to_string(), cached.clone());
        (cached, replaced, false)
    }

    /// Registers a cancellation `Notify` for `request_id`, removed again on
    /// drop (covers every early-return path in `call_tool` uniformly).
    fn register_cancel_token(&self, request_id: String) -> (Arc<Notify>, CancelGuard<'_>) {
        let notify = Arc::new(Notify::new());
        self.cancel_tokens
            .lock()
            .expect("cancel_tokens poisoned")
            .insert(request_id.clone(), notify.clone());
        (
            notify,
            CancelGuard {
                state: self,
                request_id,
            },
        )
    }

    /// Wakes the in-flight call registered under `request_id`, if any.
    /// Returns whether a matching in-flight call was found — a plain sync
    /// lock, so this never blocks on the (possibly long-held) `clients` lock.
    fn cancel(&self, request_id: &str) -> bool {
        match self
            .cancel_tokens
            .lock()
            .expect("cancel_tokens poisoned")
            .get(request_id)
        {
            Some(notify) => {
                notify.notify_one();
                true
            }
            None => false,
        }
    }

    async fn call_tool(
        &self,
        request: McpStdioCallRequest,
    ) -> Result<McpStdioCallResponse, String> {
        validate_request(&request)?;
        let (notify, _cancel_guard) = self.register_cancel_token(request.request_id.clone());
        let (cached, replaced, mut reused_client) = self
            .cached_client(
                &request.server_id,
                &request.command,
                &request.args,
                request.cwd.as_deref(),
            )
            .await;
        if let Some(replaced) = replaced {
            close_cached(replaced).await;
        }

        let mut client_slot = cached.client.lock().await;
        if client_slot.as_ref().is_some_and(McpClient::is_closed) {
            client_slot.take();
            reused_client = false;
        }
        if client_slot.is_none() {
            match connect(&request.command, &request.args, request.cwd.as_deref()).await {
                Ok(client) => *client_slot = Some(client),
                Err(error) => {
                    drop(client_slot);
                    self.remove_if_current(&request.server_id, &cached).await;
                    return Err(error);
                }
            }
        }
        let client = client_slot.as_mut().expect("MCP client connected");
        let server_info = serde_json::to_value(client.peer_info())
            .map_err(|error| format!("failed to encode MCP server info: {error}"))?;
        let params = CallToolRequestParams::new(request.tool_name).with_arguments(request.input);
        let result = tokio::select! {
            res = client.call_tool(params) => match res {
                Ok(result) => result,
                Err(error) => {
                    drop(client_slot);
                    self.remove_if_current(&request.server_id, &cached).await;
                    close_cached(cached).await;
                    return Err(format!("MCP tool call failed: {error}"));
                }
            },
            _ = tokio::time::sleep(CALL_TIMEOUT) => {
                drop(client_slot);
                self.remove_if_current(&request.server_id, &cached).await;
                close_cached(cached).await;
                return Err("MCP tool call timed out".into());
            }
            _ = notify.notified() => {
                // Doesn't stop the external tool (already dispatched over
                // stdio) — closing the connection now instead of waiting out
                // CALL_TIMEOUT is the most this side can do; see mcp.rs
                // module docs / F-11 plan for the honest ceiling here.
                drop(client_slot);
                self.remove_if_current(&request.server_id, &cached).await;
                close_cached(cached).await;
                return Err("MCP tool call cancelled".into());
            }
        };
        drop(client_slot);
        Ok(McpStdioCallResponse {
            transport: "stdio_rmcp_1_7",
            server_info: bound_json(server_info)?,
            reused_client,
            output: bound_json(
                serde_json::to_value(result)
                    .map_err(|error| format!("failed to encode MCP tool result: {error}"))?,
            )?,
        })
    }

    async fn list_tools(
        &self,
        request: McpStdioListToolsRequest,
    ) -> Result<McpStdioListToolsResponse, String> {
        validate_server(&request.server_id, &request.command, &request.args)?;
        let (cached, replaced, mut reused_client) = self
            .cached_client(
                &request.server_id,
                &request.command,
                &request.args,
                request.cwd.as_deref(),
            )
            .await;
        if let Some(replaced) = replaced {
            close_cached(replaced).await;
        }

        let mut client_slot = cached.client.lock().await;
        if client_slot.as_ref().is_some_and(McpClient::is_closed) {
            client_slot.take();
            reused_client = false;
        }
        if client_slot.is_none() {
            match connect(&request.command, &request.args, request.cwd.as_deref()).await {
                Ok(client) => *client_slot = Some(client),
                Err(error) => {
                    drop(client_slot);
                    self.remove_if_current(&request.server_id, &cached).await;
                    return Err(error);
                }
            }
        }
        let client = client_slot.as_mut().expect("MCP client connected");
        let server_info = serde_json::to_value(client.peer_info())
            .map_err(|error| format!("failed to encode MCP server info: {error}"))?;
        let tools = match timeout(CALL_TIMEOUT, client.list_all_tools()).await {
            Ok(Ok(tools)) => tools,
            Ok(Err(error)) => {
                drop(client_slot);
                self.remove_if_current(&request.server_id, &cached).await;
                close_cached(cached).await;
                return Err(format!("MCP tool discovery failed: {error}"));
            }
            Err(_) => {
                drop(client_slot);
                self.remove_if_current(&request.server_id, &cached).await;
                close_cached(cached).await;
                return Err("MCP tool discovery timed out".into());
            }
        };
        drop(client_slot);
        Ok(McpStdioListToolsResponse {
            transport: "stdio_rmcp_1_7",
            server_info: bound_json(server_info)?,
            reused_client,
            tools: bound_json(
                serde_json::to_value(tools)
                    .map_err(|error| format!("failed to encode MCP tools: {error}"))?,
            )?,
        })
    }

    async fn remove_if_current(&self, server_id: &str, cached: &Arc<CachedClient>) {
        let mut clients = self.clients.lock().await;
        if clients
            .get(server_id)
            .is_some_and(|current| Arc::ptr_eq(current, cached))
        {
            clients.remove(server_id);
        }
    }

    async fn close(&self, server_id: Option<&str>) -> usize {
        let mut clients = self.clients.lock().await;
        let removed: Vec<Arc<CachedClient>> = if let Some(server_id) = server_id {
            clients.remove(server_id).into_iter().collect()
        } else {
            clients.drain().map(|(_, client)| client).collect()
        };
        let count = removed.len();
        drop(clients);
        for client in removed {
            close_cached(client).await;
        }
        count
    }
}

#[tauri::command]
pub async fn agent_mcp_stdio_call(
    mut request: McpStdioCallRequest,
    project_root: String,
    workspace: Option<WorkspaceEnv>,
    state: State<'_, McpState>,
    registry: State<'_, WorkspaceRegistry>,
) -> Result<McpStdioCallResponse, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let cwd =
        authorize_agent_existing_path(&registry, &project_root, &project_root, &workspace, false)?;
    request.cwd = Some(cwd.to_string_lossy().into_owned());
    state.call_tool(request).await
}

#[tauri::command]
pub async fn agent_mcp_stdio_list_tools(
    mut request: McpStdioListToolsRequest,
    project_root: String,
    workspace: Option<WorkspaceEnv>,
    state: State<'_, McpState>,
    registry: State<'_, WorkspaceRegistry>,
) -> Result<McpStdioListToolsResponse, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let cwd =
        authorize_agent_existing_path(&registry, &project_root, &project_root, &workspace, false)?;
    request.cwd = Some(cwd.to_string_lossy().into_owned());
    state.list_tools(request).await
}

#[tauri::command]
pub async fn agent_mcp_stdio_close(
    server_id: Option<String>,
    state: State<'_, McpState>,
) -> Result<usize, String> {
    Ok(state.close(server_id.as_deref()).await)
}

/// Best-effort: wakes an in-flight `call_tool` so it tears down its
/// connection immediately instead of waiting out `CALL_TIMEOUT`. Cannot stop
/// the external MCP server's own execution of an already-dispatched request
/// (stdio JSON-RPC has no reliable cancellation) — see the F-11 plan.
#[tauri::command]
pub fn agent_mcp_stdio_cancel(
    request_id: String,
    state: State<'_, McpState>,
) -> Result<bool, String> {
    Ok(state.cancel(&request_id))
}

async fn connect(
    command_name: &str,
    args: &[String],
    cwd: Option<&str>,
) -> Result<McpClient, String> {
    let mut command = mcp_server_command(command_name, args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    crate::modules::proc::hide_console(command.as_std_mut());
    let transport = TokioChildProcess::new(command)
        .map_err(|error| format!("failed to spawn MCP stdio server: {error}"))?;
    timeout(CONNECT_TIMEOUT, ().serve(transport))
        .await
        .map_err(|_| "MCP initialize timed out".to_string())?
        .map_err(|error| format!("MCP initialize failed: {error}"))
}

fn mcp_server_command(command_name: &str, args: &[String]) -> Command {
    #[cfg(windows)]
    {
        let lower = command_name.to_ascii_lowercase();
        let is_shim = ["npm", "npx", "pnpm", "yarn"]
            .iter()
            .any(|name| lower == *name)
            || lower.ends_with(".cmd")
            || lower.ends_with(".bat");
        if is_shim {
            let mut command = Command::new("cmd.exe");
            command.args(["/D", "/S", "/C", command_name]).args(args);
            return command;
        }
    }
    let mut command = Command::new(command_name);
    command.args(args);
    command
}

async fn close_cached(cached: Arc<CachedClient>) {
    if let Some(mut client) = cached.client.lock().await.take() {
        let _ = client.close_with_timeout(CLOSE_TIMEOUT).await;
    }
}

fn validate_request(request: &McpStdioCallRequest) -> Result<(), String> {
    validate_server(&request.server_id, &request.command, &request.args)?;
    bounded_text(&request.tool_name, "MCP tool name", MAX_TOOL_NAME_BYTES)?;
    let input = serde_json::to_string(&request.input)
        .map_err(|error| format!("failed to encode MCP tool input: {error}"))?;
    if input.len() > MAX_INPUT_BYTES {
        return Err(format!("MCP tool input exceeds {MAX_INPUT_BYTES} bytes"));
    }
    if contains_possible_secret(&input) {
        return Err("MCP tool input contains possible secret material".into());
    }
    Ok(())
}

fn validate_server(server_id: &str, command: &str, args: &[String]) -> Result<(), String> {
    bounded_text(server_id, "MCP server id", MAX_SERVER_ID_BYTES)?;
    bounded_text(command, "MCP command", MAX_COMMAND_BYTES)?;
    if args.len() > MAX_ARGS {
        return Err(format!("MCP args exceed {MAX_ARGS} items"));
    }
    for (index, arg) in args.iter().enumerate() {
        bounded_text(arg, &format!("MCP arg {}", index + 1), MAX_ARG_BYTES)?;
    }
    Ok(())
}

fn bounded_text<'a>(value: &'a str, field: &str, max_bytes: usize) -> Result<&'a str, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{field} is required"));
    }
    if trimmed.len() > max_bytes {
        return Err(format!("{field} exceeds {max_bytes} bytes"));
    }
    if trimmed.chars().any(char::is_control) {
        return Err(format!("{field} contains control characters"));
    }
    if contains_possible_secret(trimmed) {
        return Err(format!("{field} contains possible secret material"));
    }
    Ok(trimmed)
}

fn contains_possible_secret(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "sk-proj-",
        "sk-ant-",
        "ghp_",
        "gho_",
        "ghu_",
        "ghs_",
        "ghr_",
        "github_pat_",
        "xoxb-",
        "xoxp-",
        "bearer ",
    ]
    .iter()
    .any(|prefix| lower.contains(prefix))
        || [
            "api_key=",
            "apikey=",
            "secret=",
            "secret_key=",
            "access_token=",
            "auth_token=",
            "password=",
            "passwd=",
            "private_key=",
            "client_secret=",
        ]
        .iter()
        .any(|assignment| lower.contains(assignment))
}

fn bound_json(value: Value) -> Result<Value, String> {
    let encoded = serde_json::to_string(&value)
        .map_err(|error| format!("failed to encode MCP payload: {error}"))?;
    if encoded.len() <= MAX_OUTPUT_BYTES {
        return Ok(value);
    }
    Ok(json!({
        "truncated": true,
        "originalBytes": encoded.len(),
        "preview": truncate_utf8_bytes(&encoded, MAX_OUTPUT_BYTES),
    }))
}

fn truncate_utf8_bytes(value: &str, max_bytes: usize) -> String {
    let mut end = value.len().min(max_bytes);
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_string()
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    fn fixture_request() -> McpStdioCallRequest {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri parent")
            .join("tests/fixtures/mcp-stdio/fixture-server.mjs");
        McpStdioCallRequest {
            request_id: "test-request".into(),
            server_id: "fixture".into(),
            command: "node".into(),
            args: vec![fixture.to_string_lossy().into_owned()],
            tool_name: "echo".into(),
            input: serde_json::from_value(json!({ "message": "hello" })).expect("object"),
            cwd: None,
        }
    }

    fn fixture_list_request() -> McpStdioListToolsRequest {
        let call = fixture_request();
        McpStdioListToolsRequest {
            server_id: call.server_id,
            command: call.command,
            args: call.args,
            cwd: None,
        }
    }

    #[cfg(windows)]
    #[test]
    fn package_manager_shims_launch_through_cmd_on_windows() {
        let command = mcp_server_command("npx", &["-y".into(), "@playwright/mcp@0.0.77".into()]);
        let command = command.as_std();
        assert_eq!(command.get_program().to_string_lossy(), "cmd.exe");
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            args,
            ["/D", "/S", "/C", "npx", "-y", "@playwright/mcp@0.0.77"]
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn discovers_tools_and_reuses_the_client_for_calls() {
        let state = McpState::default();

        let discovered = state
            .list_tools(fixture_list_request())
            .await
            .expect("list tools");
        let names: Vec<&str> = discovered
            .tools
            .as_array()
            .expect("tool array")
            .iter()
            .filter_map(|tool| tool["name"].as_str())
            .collect();
        assert!(names.contains(&"echo"));
        assert!(names.contains(&"sleep"));
        assert!(!discovered.reused_client);

        let called = state.call_tool(fixture_request()).await.expect("call tool");
        assert!(called.reused_client);
        assert_eq!(state.close(Some("fixture")).await, 1);
    }

    #[tokio::test(flavor = "current_thread")]
    #[ignore = "downloads/starts the pinned official Playwright MCP package; run for host browser qualification"]
    async fn official_playwright_mcp_discovers_and_navigates() {
        let state = McpState::default();
        let workspace = tempfile::tempdir().expect("browser fixture workspace");
        let cwd = workspace.path().to_string_lossy().into_owned();
        let output_dir = workspace.path().join(".atlas/browser/test");
        let args = vec![
            "-y".into(),
            "@playwright/mcp@0.0.77".into(),
            "--isolated".into(),
            "--headless".into(),
            "--console-level".into(),
            "warning".into(),
            "--output-mode".into(),
            "stdout".into(),
            "--output-dir".into(),
            output_dir.to_string_lossy().into_owned(),
            "--browser".into(),
            "msedge".into(),
        ];
        let discovered = state
            .list_tools(McpStdioListToolsRequest {
                server_id: "playwright".into(),
                command: "npx".into(),
                args: args.clone(),
                cwd: Some(cwd.clone()),
            })
            .await
            .expect("discover official Playwright MCP tools");
        let names: Vec<&str> = discovered
            .tools
            .as_array()
            .expect("tool array")
            .iter()
            .filter_map(|tool| tool["name"].as_str())
            .collect();
        assert!(names.contains(&"browser_navigate"), "tools: {names:?}");
        assert!(names.contains(&"browser_snapshot"), "tools: {names:?}");

        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind fixture HTTP");
        let address = listener.local_addr().expect("fixture address");
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                use std::io::{Read, Write};
                let mut request = [0_u8; 2048];
                let _ = stream.read(&mut request);
                let body = "<!doctype html><title>Atlas browser fixture</title><button>Verified behavior</button>";
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
            }
        });
        let navigated = state
            .call_tool(McpStdioCallRequest {
                request_id: "playwright-navigation".into(),
                server_id: "playwright".into(),
                command: "npx".into(),
                args,
                tool_name: "browser_navigate".into(),
                input: serde_json::from_value(json!({
                    "url": format!("http://{address}")
                }))
                .expect("navigation input"),
                cwd: Some(cwd),
            })
            .await
            .expect("navigate with official Playwright MCP");
        let output = serde_json::to_string(&navigated.output).expect("encode navigation output");
        assert!(output.contains("Atlas browser fixture"), "output: {output}");
        let snapshot = std::fs::read_dir(&output_dir)
            .expect("browser output directory")
            .filter_map(Result::ok)
            .find(|entry| entry.path().extension().is_some_and(|ext| ext == "yml"))
            .expect("accessibility snapshot");
        let snapshot = std::fs::read_to_string(snapshot.path()).expect("read snapshot");
        assert!(
            snapshot.contains("Verified behavior"),
            "snapshot: {snapshot}"
        );
        assert_eq!(state.close(Some("playwright")).await, 1);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn real_stdio_fixture_initializes_calls_reuses_and_closes() {
        let state = McpState::default();

        let first = state
            .call_tool(fixture_request())
            .await
            .expect("first call");
        let second = state
            .call_tool(fixture_request())
            .await
            .expect("second call");

        assert_eq!(first.transport, "stdio_rmcp_1_7");
        assert_eq!(first.output["structuredContent"]["calls"], 1);
        assert!(!first.reused_client);
        assert_eq!(second.output["structuredContent"]["calls"], 2);
        assert!(second.reused_client);
        assert_eq!(state.close(Some("fixture")).await, 1);
        assert_eq!(state.close(Some("fixture")).await, 0);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn different_servers_run_concurrently() {
        let state = Arc::new(McpState::default());
        let mut first = fixture_request();
        first.request_id = "parallel-a".into();
        first.server_id = "fixture-a".into();
        first.tool_name = "sleep".into();
        first.input = serde_json::from_value(json!({ "ms": 1200 })).expect("object");
        let mut second = fixture_request();
        second.request_id = "parallel-b".into();
        second.server_id = "fixture-b".into();
        second.tool_name = "sleep".into();
        second.input = serde_json::from_value(json!({ "ms": 1200 })).expect("object");

        let started = std::time::Instant::now();
        let (first_result, second_result) =
            tokio::join!(state.call_tool(first), state.call_tool(second),);
        first_result.expect("first parallel call");
        second_result.expect("second parallel call");
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "different MCP servers were serialized"
        );
        assert_eq!(state.close(None).await, 2);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn validates_before_spawning() {
        let state = McpState::default();
        let mut request = fixture_request();
        request.input =
            serde_json::from_value(json!({ "token": "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" }))
                .expect("object");

        let error = state.call_tool(request).await.expect_err("secret refused");

        assert!(error.contains("possible secret"));
        assert_eq!(state.close(None).await, 0);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn cancellation_tears_down_the_connection_before_the_call_completes() {
        let state = std::sync::Arc::new(McpState::default());
        let mut request = fixture_request();
        request.request_id = "cancel-me".into();
        request.tool_name = "sleep".into();
        request.input = serde_json::from_value(json!({ "ms": 5000 })).expect("object");

        let state_for_call = state.clone();
        let handle = tokio::spawn(async move { state_for_call.call_tool(request).await });

        // Poll until the in-flight call has registered its cancellation
        // token, then cancel it — well before the fixture's 5s sleep would
        // otherwise reply.
        let mut cancelled = false;
        for _ in 0..200 {
            if state.cancel("cancel-me") {
                cancelled = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert!(cancelled, "expected to find and cancel the in-flight call");

        let started = std::time::Instant::now();
        let result = handle.await.expect("task join");
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "must not wait out the fixture's 5s sleep or CALL_TIMEOUT"
        );
        let error = result.expect_err("cancelled call must return an error");
        assert!(error.contains("cancelled"), "got: {error}");

        // The connection was torn down as part of cancellation, not left
        // open for the rest of the timeout window.
        assert_eq!(state.close(Some("fixture")).await, 0);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn cancel_after_completion_is_a_harmless_no_op() {
        let state = McpState::default();
        let mut request = fixture_request();
        request.request_id = "already-done".into();

        state.call_tool(request).await.expect("call completes");

        // The token is removed by CancelGuard once the call finishes — a
        // cancel arriving after that must not find (or affect) anything.
        assert!(!state.cancel("already-done"));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn cancel_for_an_unknown_request_id_returns_false() {
        let state = McpState::default();
        assert!(!state.cancel("never-existed"));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn double_cancel_is_safe_and_only_the_first_has_any_effect() {
        let state = std::sync::Arc::new(McpState::default());
        let mut request = fixture_request();
        request.request_id = "cancel-twice".into();
        request.tool_name = "sleep".into();
        request.input = serde_json::from_value(json!({ "ms": 5000 })).expect("object");

        let state_for_call = state.clone();
        let handle = tokio::spawn(async move { state_for_call.call_tool(request).await });

        let mut cancelled_first = false;
        for _ in 0..200 {
            if state.cancel("cancel-twice") {
                cancelled_first = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert!(
            cancelled_first,
            "first cancel should find the in-flight call"
        );

        // A second cancel for the same id, fired immediately after, must not
        // panic or double-notify in a way that breaks anything — Notify's
        // own semantics make this safe, but assert the observable behavior:
        // the call still resolves to exactly one "cancelled" error.
        let second_cancel_result = state.cancel("cancel-twice");

        let result = handle.await.expect("task join");
        let error = result.expect_err("cancelled call must return an error");
        assert!(error.contains("cancelled"), "got: {error}");
        // Whether the second cancel call itself reports true or false is an
        // implementation detail of the race (token may already be removed
        // by CancelGuard by the time it runs) — what matters is no panic and
        // a single, well-formed error from the call itself, both already
        // asserted above.
        let _ = second_cancel_result;
    }
}
