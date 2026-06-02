use std::collections::HashMap;
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
use tokio::sync::Mutex;
use tokio::time::timeout;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const CALL_TIMEOUT: Duration = Duration::from_secs(5);
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
    client: McpClient,
}

#[derive(Default)]
pub struct McpState {
    clients: Mutex<HashMap<String, CachedClient>>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStdioCallRequest {
    server_id: String,
    command: String,
    args: Vec<String>,
    tool_name: String,
    input: Map<String, Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStdioCallResponse {
    transport: &'static str,
    server_info: Value,
    reused_client: bool,
    output: Value,
}

impl McpState {
    async fn call_tool(
        &self,
        request: McpStdioCallRequest,
    ) -> Result<McpStdioCallResponse, String> {
        validate_request(&request)?;
        let signature = serde_json::to_string(&(&request.command, &request.args))
            .map_err(|error| format!("failed to encode MCP server signature: {error}"))?;
        let mut clients = self.clients.lock().await;
        let reused_client = clients
            .get(&request.server_id)
            .is_some_and(|cached| cached.signature == signature && !cached.client.is_closed());
        if !reused_client {
            close_cached(clients.remove(&request.server_id)).await;
            clients.insert(
                request.server_id.clone(),
                CachedClient {
                    signature,
                    client: connect(&request).await?,
                },
            );
        }
        let cached = clients
            .get_mut(&request.server_id)
            .expect("MCP client inserted");
        let server_info = serde_json::to_value(cached.client.peer_info())
            .map_err(|error| format!("failed to encode MCP server info: {error}"))?;
        let params = CallToolRequestParams::new(request.tool_name).with_arguments(request.input);
        let result = match timeout(CALL_TIMEOUT, cached.client.call_tool(params)).await {
            Ok(Ok(result)) => result,
            Ok(Err(error)) => {
                close_cached(clients.remove(&request.server_id)).await;
                return Err(format!("MCP tool call failed: {error}"));
            }
            Err(_) => {
                close_cached(clients.remove(&request.server_id)).await;
                return Err("MCP tool call timed out".into());
            }
        };
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

    async fn close(&self, server_id: Option<&str>) -> usize {
        let mut clients = self.clients.lock().await;
        let removed: Vec<CachedClient> = if let Some(server_id) = server_id {
            clients.remove(server_id).into_iter().collect()
        } else {
            clients.drain().map(|(_, client)| client).collect()
        };
        let count = removed.len();
        for client in removed {
            close_cached(Some(client)).await;
        }
        count
    }
}

#[tauri::command]
pub async fn agent_mcp_stdio_call(
    request: McpStdioCallRequest,
    state: State<'_, McpState>,
) -> Result<McpStdioCallResponse, String> {
    state.call_tool(request).await
}

#[tauri::command]
pub async fn agent_mcp_stdio_close(
    server_id: Option<String>,
    state: State<'_, McpState>,
) -> Result<usize, String> {
    Ok(state.close(server_id.as_deref()).await)
}

async fn connect(request: &McpStdioCallRequest) -> Result<McpClient, String> {
    let mut command = Command::new(&request.command);
    command.args(&request.args);
    crate::modules::proc::hide_console(command.as_std_mut());
    let transport = TokioChildProcess::new(command)
        .map_err(|error| format!("failed to spawn MCP stdio server: {error}"))?;
    timeout(CONNECT_TIMEOUT, ().serve(transport))
        .await
        .map_err(|_| "MCP initialize timed out".to_string())?
        .map_err(|error| format!("MCP initialize failed: {error}"))
}

async fn close_cached(cached: Option<CachedClient>) {
    if let Some(mut cached) = cached {
        let _ = cached.client.close_with_timeout(CLOSE_TIMEOUT).await;
    }
}

fn validate_request(request: &McpStdioCallRequest) -> Result<(), String> {
    bounded_text(&request.server_id, "MCP server id", MAX_SERVER_ID_BYTES)?;
    bounded_text(&request.command, "MCP command", MAX_COMMAND_BYTES)?;
    bounded_text(&request.tool_name, "MCP tool name", MAX_TOOL_NAME_BYTES)?;
    if request.args.len() > MAX_ARGS {
        return Err(format!("MCP args exceed {MAX_ARGS} items"));
    }
    for (index, arg) in request.args.iter().enumerate() {
        bounded_text(arg, &format!("MCP arg {}", index + 1), MAX_ARG_BYTES)?;
    }
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
            server_id: "fixture".into(),
            command: "node".into(),
            args: vec![fixture.to_string_lossy().into_owned()],
            tool_name: "echo".into(),
            input: serde_json::from_value(json!({ "message": "hello" })).expect("object"),
        }
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
}
