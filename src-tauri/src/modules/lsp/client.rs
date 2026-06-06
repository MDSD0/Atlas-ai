use std::{
    collections::HashMap,
    io::{self, BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::mpsc::{self, Receiver, RecvTimeoutError},
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::modules::proc::hide_console;

const INITIALIZE_TIMEOUT: Duration = Duration::from_secs(10);
const DIAGNOSTICS_TIMEOUT: Duration = Duration::from_secs(3);
const SEMANTIC_TIMEOUT: Duration = Duration::from_secs(3);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_millis(500);
const SEMANTIC_QUERY_BYTES: usize = 1_024;
const SEMANTIC_RESULT_BYTES: usize = 64 * 1_024;
const SEMANTIC_RESULT_ITEMS: usize = 200;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LspPosition {
    pub line: u64,
    pub character: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LspRange {
    pub start: LspPosition,
    pub end: LspPosition,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LspDiagnostic {
    pub range: LspRange,
    pub severity: Option<u64>,
    pub code: Option<Value>,
    pub source: Option<String>,
    pub message: String,
}

#[derive(Debug)]
pub struct DiagnosticSnapshot {
    pub diagnostics: Vec<LspDiagnostic>,
    pub fresh: bool,
    pub waited_ms: u128,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LspSemanticOperation {
    Definition,
    References,
    DocumentSymbols,
    WorkspaceSymbols,
    Hover,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LspSemanticRequest {
    pub operation: LspSemanticOperation,
    pub line: Option<u64>,
    pub character: Option<u64>,
    pub query: Option<String>,
}

#[derive(Debug)]
pub struct SemanticSnapshot {
    pub result: Value,
    pub truncated: bool,
    pub waited_ms: u128,
}

#[derive(Debug)]
struct OpenDocument {
    version: u64,
    text: String,
}

pub struct LspClient {
    child: Option<Child>,
    stdin: Box<dyn Write + Send>,
    messages: Receiver<Value>,
    next_id: u64,
    root_uri: String,
    documents: HashMap<String, OpenDocument>,
    diagnostics: HashMap<String, Vec<LspDiagnostic>>,
}

impl LspClient {
    pub fn spawn(executable: &Path, args: &[&str], root: &Path) -> Result<Self, String> {
        let mut command = language_server_command(executable, args);
        command
            .current_dir(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        hide_console(&mut command);
        let mut child = command
            .spawn()
            .map_err(|error| format!("failed to spawn language server: {error}"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "language server stdin was not piped".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "language server stdout was not piped".to_string())?;
        Self::connect(stdin, stdout, root, Some(child))
    }

    fn connect(
        stdin: impl Write + Send + 'static,
        stdout: impl Read + Send + 'static,
        root: &Path,
        child: Option<Child>,
    ) -> Result<Self, String> {
        let root_uri = file_uri(root)?;
        let messages = spawn_reader(stdout);
        let mut client = Self {
            child,
            stdin: Box::new(stdin),
            messages,
            next_id: 1,
            root_uri,
            documents: HashMap::new(),
            diagnostics: HashMap::new(),
        };
        client.initialize()?;
        Ok(client)
    }

    pub fn diagnostics(
        &mut self,
        file: &Path,
        language_id: &str,
    ) -> Result<DiagnosticSnapshot, String> {
        let uri = file_uri(file)?;
        let text = std::fs::read_to_string(file)
            .map_err(|error| format!("failed to read semantic target: {error}"))?;
        let changed = self.sync_document(&uri, language_id, text)?;
        if !changed {
            return Ok(DiagnosticSnapshot {
                diagnostics: self.diagnostics.get(&uri).cloned().unwrap_or_default(),
                fresh: false,
                waited_ms: 0,
            });
        }

        let started = Instant::now();
        let fresh = self.wait_for_diagnostics(&uri, DIAGNOSTICS_TIMEOUT)?;
        Ok(DiagnosticSnapshot {
            diagnostics: self.diagnostics.get(&uri).cloned().unwrap_or_default(),
            fresh,
            waited_ms: started.elapsed().as_millis(),
        })
    }

    pub fn semantic(
        &mut self,
        file: &Path,
        language_id: &str,
        request: &LspSemanticRequest,
    ) -> Result<SemanticSnapshot, String> {
        let uri = file_uri(file)?;
        let text = std::fs::read_to_string(file)
            .map_err(|error| format!("failed to read semantic target: {error}"))?;
        self.sync_document(&uri, language_id, text)?;
        let params = semantic_params(&uri, request)?;
        let started = Instant::now();
        let id = self.send_request(semantic_method(&request.operation), params)?;
        let response = self.wait_for_response(id, SEMANTIC_TIMEOUT)?;
        if let Some(error) = response.get("error") {
            return Err(format!("language server semantic request failed: {error}"));
        }
        let (result, truncated) =
            bound_semantic_result(response.get("result").cloned().unwrap_or(Value::Null))?;
        Ok(SemanticSnapshot {
            result,
            truncated,
            waited_ms: started.elapsed().as_millis(),
        })
    }

    fn initialize(&mut self) -> Result<(), String> {
        let id = self.send_request(
            "initialize",
            json!({
                "processId": std::process::id(),
                "rootUri": self.root_uri,
                "workspaceFolders": [{
                    "name": "workspace",
                    "uri": self.root_uri,
                }],
                "capabilities": {
                    "textDocument": {
                        "synchronization": {
                            "didOpen": true,
                            "didChange": true,
                        },
                        "publishDiagnostics": {},
                        "definition": {},
                        "references": {},
                        "documentSymbol": {
                            "hierarchicalDocumentSymbolSupport": true,
                        },
                        "hover": {},
                    },
                    "workspace": {
                        "configuration": true,
                        "symbol": {},
                    },
                },
            }),
        )?;
        let response = self.wait_for_response(id, INITIALIZE_TIMEOUT)?;
        if let Some(error) = response.get("error") {
            return Err(format!("language server initialize failed: {error}"));
        }
        self.send_notification("initialized", json!({}))
    }

    fn sync_document(
        &mut self,
        uri: &str,
        language_id: &str,
        text: String,
    ) -> Result<bool, String> {
        if let Some(document) = self.documents.get_mut(uri) {
            if document.text == text {
                return Ok(false);
            }
            let previous_end = end_position(&document.text);
            document.version += 1;
            document.text = text.clone();
            let version = document.version;
            self.send_notification(
                "textDocument/didChange",
                json!({
                    "textDocument": { "uri": uri, "version": version },
                    "contentChanges": [{
                        "range": {
                            "start": { "line": 0, "character": 0 },
                            "end": previous_end,
                        },
                        "text": text,
                    }],
                }),
            )?;
            return Ok(true);
        }

        self.send_notification(
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id,
                    "version": 1,
                    "text": text.clone(),
                },
            }),
        )?;
        self.documents
            .insert(uri.to_string(), OpenDocument { version: 1, text });
        Ok(true)
    }

    fn wait_for_diagnostics(&mut self, uri: &str, timeout: Duration) -> Result<bool, String> {
        let deadline = Instant::now() + timeout;
        loop {
            let Some(message) = self.receive_until(deadline)? else {
                return Ok(false);
            };
            if self.process_message(message)?.as_deref() == Some(uri) {
                return Ok(true);
            }
        }
    }

    fn wait_for_response(&mut self, id: u64, timeout: Duration) -> Result<Value, String> {
        let deadline = Instant::now() + timeout;
        loop {
            let Some(message) = self.receive_until(deadline)? else {
                return Err("language server response timed out".into());
            };
            if message.get("id").and_then(Value::as_u64) == Some(id)
                && message.get("method").is_none()
            {
                return Ok(message);
            }
            self.process_message(message)?;
        }
    }

    fn receive_until(&self, deadline: Instant) -> Result<Option<Value>, String> {
        let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
            return Ok(None);
        };
        match self.messages.recv_timeout(remaining) {
            Ok(message) => Ok(Some(message)),
            Err(RecvTimeoutError::Timeout) => Ok(None),
            Err(RecvTimeoutError::Disconnected) => {
                Err("language server output stream closed".into())
            }
        }
    }

    fn process_message(&mut self, message: Value) -> Result<Option<String>, String> {
        if message.get("method").and_then(Value::as_str) == Some("textDocument/publishDiagnostics")
        {
            let params: PublishDiagnosticsParams =
                serde_json::from_value(message["params"].clone())
                    .map_err(|error| format!("invalid publishDiagnostics payload: {error}"))?;
            self.diagnostics
                .insert(params.uri.clone(), params.diagnostics);
            return Ok(Some(params.uri));
        }

        if let (Some(id), Some(method)) = (
            message.get("id").cloned(),
            message.get("method").and_then(Value::as_str),
        ) {
            let result = match method {
                "workspace/configuration" => {
                    let count = message["params"]["items"]
                        .as_array()
                        .map(Vec::len)
                        .unwrap_or(0);
                    Value::Array(vec![Value::Null; count])
                }
                "workspace/workspaceFolders" => json!([{
                    "name": "workspace",
                    "uri": self.root_uri,
                }]),
                _ => Value::Null,
            };
            self.send(json!({ "jsonrpc": "2.0", "id": id, "result": result }))?;
        }
        Ok(None)
    }

    fn send_request(&mut self, method: &str, params: Value) -> Result<u64, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }))?;
        Ok(id)
    }

    fn send_notification(&mut self, method: &str, params: Value) -> Result<(), String> {
        self.send(json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }))
    }

    fn send(&mut self, message: Value) -> Result<(), String> {
        write_message(&mut self.stdin, &message)
            .map_err(|error| format!("failed to write language server message: {error}"))
    }

    fn shutdown(&mut self) {
        if let Ok(id) = self.send_request("shutdown", Value::Null) {
            let _ = self.wait_for_response(id, SHUTDOWN_TIMEOUT);
        }
        let _ = self.send_notification("exit", Value::Null);
        let Some(child) = self.child.as_mut() else {
            return;
        };
        if child.try_wait().ok().flatten().is_none() {
            let _ = child.kill();
        }
        let _ = child.wait();
    }
}

impl Drop for LspClient {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn language_server_command(executable: &Path, args: &[&str]) -> Command {
    #[cfg(windows)]
    {
        if is_windows_command_shim(executable) {
            let mut command = Command::new("cmd.exe");
            command.args(["/D", "/S", "/C"]).arg(executable).args(args);
            return command;
        }
    }

    let mut command = Command::new(executable);
    command.args(args);
    command
}

#[cfg(windows)]
fn is_windows_command_shim(executable: &Path) -> bool {
    executable
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat")
        })
}

fn semantic_method(operation: &LspSemanticOperation) -> &'static str {
    match operation {
        LspSemanticOperation::Definition => "textDocument/definition",
        LspSemanticOperation::References => "textDocument/references",
        LspSemanticOperation::DocumentSymbols => "textDocument/documentSymbol",
        LspSemanticOperation::WorkspaceSymbols => "workspace/symbol",
        LspSemanticOperation::Hover => "textDocument/hover",
    }
}

fn semantic_params(uri: &str, request: &LspSemanticRequest) -> Result<Value, String> {
    let text_document = json!({ "uri": uri });
    match request.operation {
        LspSemanticOperation::Definition | LspSemanticOperation::Hover => Ok(json!({
            "textDocument": text_document,
            "position": required_position(request)?,
        })),
        LspSemanticOperation::References => Ok(json!({
            "textDocument": text_document,
            "position": required_position(request)?,
            "context": { "includeDeclaration": true },
        })),
        LspSemanticOperation::DocumentSymbols => Ok(json!({
            "textDocument": text_document,
        })),
        LspSemanticOperation::WorkspaceSymbols => {
            let query = request.query.as_deref().unwrap_or("").trim();
            if query.len() > SEMANTIC_QUERY_BYTES {
                return Err("language server workspace-symbol query exceeds byte limit".into());
            }
            Ok(json!({ "query": query }))
        }
    }
}

fn required_position(request: &LspSemanticRequest) -> Result<Value, String> {
    Ok(json!({
        "line": request
            .line
            .ok_or_else(|| "language server request requires a line".to_string())?,
        "character": request
            .character
            .ok_or_else(|| "language server request requires a character".to_string())?,
    }))
}

fn bound_semantic_result(mut result: Value) -> Result<(Value, bool), String> {
    let mut truncated = false;
    if let Value::Array(items) = &mut result {
        truncated = items.len() > SEMANTIC_RESULT_ITEMS;
        items.truncate(SEMANTIC_RESULT_ITEMS);
    }
    if serde_json::to_vec(&result)
        .map_err(|error| format!("failed to encode language server result: {error}"))?
        .len()
        <= SEMANTIC_RESULT_BYTES
    {
        return Ok((result, truncated));
    }
    let Value::Array(items) = &mut result else {
        return Err("language server result exceeded byte limit".into());
    };
    while !items.is_empty()
        && serde_json::to_vec(items)
            .map_err(|error| format!("failed to encode language server result: {error}"))?
            .len()
            > SEMANTIC_RESULT_BYTES
    {
        truncated = true;
        items.pop();
    }
    Ok((result, truncated))
}

#[derive(Deserialize)]
struct PublishDiagnosticsParams {
    uri: String,
    diagnostics: Vec<LspDiagnostic>,
}

fn file_uri(path: &Path) -> Result<String, String> {
    url::Url::from_file_path(path)
        .map(String::from)
        .map_err(|_| format!("cannot convert path to file URI: {}", path.display()))
}

fn end_position(text: &str) -> LspPosition {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut lines = normalized.split('\n');
    let mut line: usize = 0;
    let mut last = "";
    for value in lines.by_ref() {
        last = value;
        line += 1;
    }
    LspPosition {
        line: line.saturating_sub(1) as u64,
        character: last.encode_utf16().count() as u64,
    }
}

fn spawn_reader(stdout: impl Read + Send + 'static) -> Receiver<Value> {
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        while let Ok(Some(message)) = read_message(&mut reader) {
            if sender.send(message).is_err() {
                break;
            }
        }
    });
    receiver
}

fn read_message(reader: &mut impl BufRead) -> io::Result<Option<Value>> {
    let mut content_length = None;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header)? == 0 {
            return Ok(None);
        }
        let header = header.trim_end_matches(['\r', '\n']);
        if header.is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            if name.eq_ignore_ascii_case("Content-Length") {
                content_length = Some(
                    value
                        .trim()
                        .parse::<usize>()
                        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?,
                );
            }
        }
    }
    let length = content_length
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing Content-Length"))?;
    let mut body = vec![0; length];
    reader.read_exact(&mut body)?;
    serde_json::from_slice(&body)
        .map(Some)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn write_message(writer: &mut impl Write, message: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(message)?;
    write!(writer, "Content-Length: {}\r\n\r\n", body.len())?;
    writer.write_all(&body)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    #[test]
    fn json_rpc_frame_round_trips() {
        let message = json!({ "jsonrpc": "2.0", "method": "initialized", "params": {} });
        let mut bytes = Vec::new();
        write_message(&mut bytes, &message).expect("write frame");
        let parsed = read_message(&mut Cursor::new(bytes))
            .expect("read frame")
            .expect("message");

        assert_eq!(parsed, message);
    }

    #[test]
    fn end_position_tracks_last_line() {
        assert_eq!(
            end_position("one\ntwo"),
            LspPosition {
                line: 1,
                character: 3,
            }
        );
        assert_eq!(end_position("one\n😀").character, 2);
    }

    #[test]
    fn semantic_position_requests_require_line_and_character() {
        let missing = LspSemanticRequest {
            operation: LspSemanticOperation::Definition,
            line: None,
            character: Some(0),
            query: None,
        };
        assert_eq!(
            semantic_params("file:///sample.ts", &missing).expect_err("missing line"),
            "language server request requires a line"
        );

        let references = LspSemanticRequest {
            operation: LspSemanticOperation::References,
            line: Some(4),
            character: Some(2),
            query: None,
        };
        let params = semantic_params("file:///sample.ts", &references).expect("params");
        assert_eq!(params["position"], json!({ "line": 4, "character": 2 }));
        assert_eq!(params["context"]["includeDeclaration"], true);
    }

    #[cfg(windows)]
    #[test]
    fn command_shims_are_launched_through_cmd_on_windows() {
        let command = language_server_command(
            Path::new(r"C:\Users\name\AppData\Roaming\npm\typescript-language-server.cmd"),
            &["--stdio"],
        );
        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert_eq!(command.get_program().to_string_lossy(), "cmd.exe");
        assert_eq!(args[0..3], ["/D", "/S", "/C"]);
        assert!(args[3].ends_with("typescript-language-server.cmd"));
        assert_eq!(args[4], "--stdio");
    }

    #[cfg(not(windows))]
    #[test]
    fn native_servers_are_launched_directly() {
        let command = language_server_command(Path::new("/usr/bin/rust-analyzer"), &[]);

        assert_eq!(command.get_program(), Path::new("/usr/bin/rust-analyzer"));
        assert_eq!(command.get_args().count(), 0);
    }

    #[test]
    fn semantic_result_arrays_are_bounded() {
        let result = Value::Array(
            (0..1_000)
                .map(|index| json!({ "name": format!("symbol-{index}") }))
                .collect(),
        );
        let (bounded, truncated) = bound_semantic_result(result).expect("bound result");

        assert!(truncated);
        assert!(bounded.as_array().expect("array").len() <= SEMANTIC_RESULT_ITEMS);
        assert!(serde_json::to_vec(&bounded).expect("serialize").len() <= SEMANTIC_RESULT_BYTES);
    }

    #[cfg(unix)]
    #[test]
    fn fake_server_observes_lifecycle_and_publishes_diagnostic() {
        use std::{
            os::unix::net::UnixStream,
            sync::{Arc, Mutex},
        };

        let root = tempfile::tempdir().expect("root");
        let file = root.path().join("sample.ts");
        std::fs::write(&file, "const value = 1;\n").expect("write TypeScript");
        let uri = file_uri(&file).expect("file URI");
        let events = Arc::new(Mutex::new(Vec::new()));
        let (client_stream, mut server_stream) = UnixStream::pair().expect("socket pair");
        let server_reader = server_stream.try_clone().expect("server reader");
        let server_events = Arc::clone(&events);
        let server = thread::spawn(move || {
            let mut reader = BufReader::new(server_reader);
            let initialize = read_message(&mut reader)
                .expect("read initialize")
                .expect("initialize message");
            server_events.lock().expect("events").push("initialize");
            write_message(
                &mut server_stream,
                &json!({
                    "jsonrpc": "2.0",
                    "id": initialize["id"],
                    "result": { "capabilities": { "textDocumentSync": 2 } },
                }),
            )
            .expect("write initialize response");
            let initialized = read_message(&mut reader)
                .expect("read initialized")
                .expect("initialized message");
            assert_eq!(initialized["method"], "initialized");
            server_events.lock().expect("events").push("initialized");
            let did_open = read_message(&mut reader)
                .expect("read didOpen")
                .expect("didOpen message");
            assert_eq!(did_open["method"], "textDocument/didOpen");
            server_events.lock().expect("events").push("didOpen");
            write_message(
                &mut server_stream,
                &json!({
                    "jsonrpc": "2.0",
                    "method": "textDocument/publishDiagnostics",
                    "params": {
                        "uri": uri,
                        "diagnostics": [{
                            "range": {
                                "start": { "line": 0, "character": 0 },
                                "end": { "line": 0, "character": 5 },
                            },
                            "severity": 2,
                            "source": "fake",
                            "message": "sample warning",
                        }],
                    },
                }),
            )
            .expect("write diagnostics");
            let shutdown = read_message(&mut reader)
                .expect("read shutdown")
                .expect("shutdown message");
            assert_eq!(shutdown["method"], "shutdown");
            server_events.lock().expect("events").push("shutdown");
            write_message(
                &mut server_stream,
                &json!({
                    "jsonrpc": "2.0",
                    "id": shutdown["id"],
                    "result": null,
                }),
            )
            .expect("write shutdown response");
            let exit = read_message(&mut reader)
                .expect("read exit")
                .expect("exit message");
            assert_eq!(exit["method"], "exit");
            server_events.lock().expect("events").push("exit");
        });
        let client_writer = client_stream.try_clone().expect("client writer");
        let mut client =
            LspClient::connect(client_writer, client_stream, root.path(), None).expect("connect");
        let snapshot = client
            .diagnostics(&file, "typescript")
            .expect("collect diagnostics");

        assert!(snapshot.fresh);
        assert_eq!(snapshot.diagnostics.len(), 1);
        assert_eq!(snapshot.diagnostics[0].message, "sample warning");
        drop(client);
        server.join().expect("server thread");
        assert_eq!(
            *events.lock().expect("events"),
            vec!["initialize", "initialized", "didOpen", "shutdown", "exit"]
        );
    }

    #[cfg(unix)]
    #[test]
    fn fake_server_observes_document_open_before_definition_request() {
        use std::os::unix::net::UnixStream;

        let root = tempfile::tempdir().expect("root");
        let file = root.path().join("sample.rs");
        std::fs::write(&file, "fn target() {}\nfn main() { target(); }\n").expect("write Rust");
        let uri = file_uri(&file).expect("file URI");
        let (client_stream, mut server_stream) = UnixStream::pair().expect("socket pair");
        let server_reader = server_stream.try_clone().expect("server reader");
        let expected_uri = uri.clone();
        let server = thread::spawn(move || {
            let mut reader = BufReader::new(server_reader);
            let initialize = read_message(&mut reader)
                .expect("read initialize")
                .expect("initialize message");
            write_message(
                &mut server_stream,
                &json!({
                    "jsonrpc": "2.0",
                    "id": initialize["id"],
                    "result": { "capabilities": { "definitionProvider": true } },
                }),
            )
            .expect("write initialize response");
            assert_eq!(
                read_message(&mut reader)
                    .expect("read initialized")
                    .expect("initialized message")["method"],
                "initialized"
            );
            assert_eq!(
                read_message(&mut reader)
                    .expect("read didOpen")
                    .expect("didOpen message")["method"],
                "textDocument/didOpen"
            );
            let definition = read_message(&mut reader)
                .expect("read definition")
                .expect("definition message");
            assert_eq!(definition["method"], "textDocument/definition");
            assert_eq!(
                definition["params"]["position"],
                json!({ "line": 1, "character": 12 })
            );
            write_message(
                &mut server_stream,
                &json!({
                    "jsonrpc": "2.0",
                    "id": definition["id"],
                    "result": [{
                        "uri": expected_uri,
                        "range": {
                            "start": { "line": 0, "character": 3 },
                            "end": { "line": 0, "character": 9 },
                        },
                    }],
                }),
            )
            .expect("write definition response");
            let shutdown = read_message(&mut reader)
                .expect("read shutdown")
                .expect("shutdown message");
            assert_eq!(shutdown["method"], "shutdown");
            write_message(
                &mut server_stream,
                &json!({
                    "jsonrpc": "2.0",
                    "id": shutdown["id"],
                    "result": null,
                }),
            )
            .expect("write shutdown response");
            assert_eq!(
                read_message(&mut reader)
                    .expect("read exit")
                    .expect("exit message")["method"],
                "exit"
            );
        });
        let client_writer = client_stream.try_clone().expect("client writer");
        let mut client =
            LspClient::connect(client_writer, client_stream, root.path(), None).expect("connect");
        let snapshot = client
            .semantic(
                &file,
                "rust",
                &LspSemanticRequest {
                    operation: LspSemanticOperation::Definition,
                    line: Some(1),
                    character: Some(12),
                    query: None,
                },
            )
            .expect("definition");

        assert_eq!(snapshot.result[0]["uri"], uri);
        assert!(!snapshot.truncated);
        drop(client);
        server.join().expect("server thread");
    }

    #[test]
    #[ignore = "run explicitly when clangd is installed for host semantic qualification"]
    fn installed_clangd_document_symbols_smoke() {
        let Some(executable) = std::env::var_os("PATH").as_deref().and_then(|path| {
            std::env::split_paths(path)
                .map(|directory| directory.join("clangd"))
                .find(|candidate| candidate.is_file())
        }) else {
            return;
        };
        let root = tempfile::tempdir().expect("root");
        let file = root.path().join("sample.cpp");
        std::fs::write(&file, "int target() { return 42; }\n").expect("write C++");
        let mut client = LspClient::spawn(&executable, &[], root.path()).expect("spawn clangd");
        let snapshot = client
            .semantic(
                &file,
                "cpp",
                &LspSemanticRequest {
                    operation: LspSemanticOperation::DocumentSymbols,
                    line: None,
                    character: None,
                    query: None,
                },
            )
            .expect("request document symbols");

        assert!(!snapshot.truncated);
        assert!(snapshot
            .result
            .as_array()
            .is_some_and(|items| !items.is_empty()));
    }
}
