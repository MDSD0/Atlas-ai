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
const SHUTDOWN_TIMEOUT: Duration = Duration::from_millis(500);

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
        let mut command = Command::new(executable);
        command
            .args(args)
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
                    "workspace": {
                        "configuration": true,
                    },
                    "textDocument": {
                        "synchronization": {
                            "didOpen": true,
                            "didChange": true,
                        },
                        "publishDiagnostics": {},
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
}
