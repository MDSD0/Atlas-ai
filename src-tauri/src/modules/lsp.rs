mod client;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;
use tauri::State;

use crate::modules::workspace::{authorize_agent_existing_path, WorkspaceEnv, WorkspaceRegistry};
use client::{DiagnosticSnapshot, LspClient, LspDiagnostic};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LspProviderStatus {
    Available,
    Unavailable,
    Connected,
    Broken,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct LspProviderInfo {
    pub id: &'static str,
    pub language: &'static str,
    pub status: LspProviderStatus,
    /// Whether Atlas actually delivers diagnostics for this provider today. A
    /// provider can be installed (`status: available`) yet deferred, so the UI
    /// must not present a detected-but-deferred server as a live feature.
    pub diagnostics_enabled: bool,
    pub executable: &'static str,
    pub resolved_path: Option<String>,
    pub detail: String,
}

struct Provider {
    id: &'static str,
    language: &'static str,
    executable: &'static str,
    args: &'static [&'static str],
    extensions: &'static [&'static str],
    diagnostics_enabled: bool,
}

const PROVIDERS: &[Provider] = &[
    Provider {
        id: "typescript",
        language: "typescript",
        executable: "typescript-language-server",
        args: &["--stdio"],
        extensions: &["js", "jsx", "mjs", "cjs", "ts", "mts", "cts", "tsx"],
        diagnostics_enabled: true,
    },
    Provider {
        id: "pyright",
        language: "python",
        executable: "pyright-langserver",
        args: &["--stdio"],
        extensions: &["py"],
        diagnostics_enabled: false,
    },
    Provider {
        id: "rust-analyzer",
        language: "rust",
        executable: "rust-analyzer",
        args: &[],
        extensions: &["rs"],
        diagnostics_enabled: false,
    },
];

#[derive(Default)]
pub struct LspState {
    clients: Mutex<HashMap<String, LspClient>>,
    broken: Mutex<HashMap<String, String>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LspDiagnosticStatus {
    Fresh,
    Cached,
    Pending,
    Unavailable,
    Broken,
}

#[derive(Clone, Debug, Serialize)]
pub struct LspDiagnosticsResponse {
    pub provider: &'static str,
    pub status: LspDiagnosticStatus,
    pub file: String,
    pub diagnostics: Vec<LspDiagnostic>,
    pub waited_ms: u128,
    pub detail: String,
}

#[tauri::command]
pub fn agent_lsp_status(
    root: String,
    project_root: String,
    file: Option<String>,
    workspace: Option<WorkspaceEnv>,
    state: State<'_, LspState>,
    registry: State<'_, WorkspaceRegistry>,
) -> Result<Vec<LspProviderInfo>, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root = authorize_agent_existing_path(&registry, &root, &project_root, &workspace)?;
    if !root.is_dir() {
        return Err("LSP root is not a directory".into());
    }
    let extension = match file {
        Some(file) => {
            let file = authorize_agent_existing_path(&registry, &file, &project_root, &workspace)?;
            file.extension()
                .and_then(|extension| extension.to_str())
                .map(str::to_ascii_lowercase)
        }
        None => None,
    };
    Ok(provider_statuses(
        extension.as_deref(),
        std::env::var_os("PATH").as_deref(),
        Some(&root),
        Some(&state),
    ))
}

#[tauri::command]
pub fn agent_lsp_diagnostics(
    root: String,
    project_root: String,
    file: String,
    workspace: Option<WorkspaceEnv>,
    state: State<'_, LspState>,
    registry: State<'_, WorkspaceRegistry>,
) -> Result<LspDiagnosticsResponse, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root = authorize_agent_existing_path(&registry, &root, &project_root, &workspace)?;
    if !root.is_dir() {
        return Err("LSP root is not a directory".into());
    }
    let file = authorize_agent_existing_path(&registry, &file, &project_root, &workspace)?;
    if !file.is_file() {
        return Err("semantic target is not a file".into());
    }
    let provider = provider_for_file(&file)
        .ok_or_else(|| "no semantic provider is registered for this file extension".to_string())?;
    if !provider.diagnostics_enabled {
        return Ok(response(
            provider,
            &file,
            LspDiagnosticStatus::Unavailable,
            Vec::new(),
            0,
            "diagnostics are deferred for this provider; repository tools remain available",
        ));
    }
    let key = client_key(&root, provider);
    if let Some(detail) = state
        .broken
        .lock()
        .map_err(|_| "LSP broken-state lock poisoned")?
        .get(&key)
        .cloned()
    {
        return Ok(response(
            provider,
            &file,
            LspDiagnosticStatus::Broken,
            Vec::new(),
            0,
            detail,
        ));
    }
    let executable = match find_executable(provider.executable, std::env::var_os("PATH").as_deref())
    {
        Some(executable) => executable,
        None => {
            return Ok(response(
                provider,
                &file,
                LspDiagnosticStatus::Unavailable,
                Vec::new(),
                0,
                "not installed or not on PATH; repository tools remain available",
            ));
        }
    };
    let mut clients = state
        .clients
        .lock()
        .map_err(|_| "LSP client lock poisoned")?;
    if !clients.contains_key(&key) {
        match LspClient::spawn(&executable, provider.args, &root) {
            Ok(client) => {
                clients.insert(key.clone(), client);
            }
            Err(detail) => {
                state
                    .broken
                    .lock()
                    .map_err(|_| "LSP broken-state lock poisoned")?
                    .insert(key, detail.clone());
                return Ok(response(
                    provider,
                    &file,
                    LspDiagnosticStatus::Broken,
                    Vec::new(),
                    0,
                    detail,
                ));
            }
        }
    }
    let snapshot = clients
        .get_mut(&key)
        .expect("LSP client inserted above")
        .diagnostics(&file, language_id(&file));
    match snapshot {
        Ok(snapshot) => Ok(snapshot_response(provider, &file, snapshot)),
        Err(detail) => {
            clients.remove(&key);
            state
                .broken
                .lock()
                .map_err(|_| "LSP broken-state lock poisoned")?
                .insert(key, detail.clone());
            Ok(response(
                provider,
                &file,
                LspDiagnosticStatus::Broken,
                Vec::new(),
                0,
                detail,
            ))
        }
    }
}

fn provider_statuses(
    extension: Option<&str>,
    path: Option<&std::ffi::OsStr>,
    root: Option<&Path>,
    state: Option<&LspState>,
) -> Vec<LspProviderInfo> {
    PROVIDERS
        .iter()
        .filter(|provider| {
            extension.is_none_or(|extension| provider.extensions.contains(&extension))
        })
        .map(|provider| {
            let resolved = find_executable(provider.executable, path);
            let key = root.map(|root| client_key(root, provider));
            let broken = key.as_ref().and_then(|key| {
                state.and_then(|state| {
                    state
                        .broken
                        .lock()
                        .ok()
                        .and_then(|broken| broken.get(key).cloned())
                })
            });
            let connected = key.as_ref().is_some_and(|key| {
                state.is_some_and(|state| {
                    state
                        .clients
                        .lock()
                        .is_ok_and(|clients| clients.contains_key(key))
                })
            });
            LspProviderInfo {
                id: provider.id,
                language: provider.language,
                status: if broken.is_some() {
                    LspProviderStatus::Broken
                } else if connected {
                    LspProviderStatus::Connected
                } else if resolved.is_some() {
                    LspProviderStatus::Available
                } else {
                    LspProviderStatus::Unavailable
                },
                diagnostics_enabled: provider.diagnostics_enabled,
                executable: provider.executable,
                resolved_path: resolved.as_deref().map(crate::modules::fs::to_canon),
                detail: if let Some(detail) = broken {
                    detail
                } else if connected {
                    "connected; semantic requests use the lazy project client".into()
                } else if resolved.is_some() {
                    "available; starts lazily on the first semantic request".into()
                } else {
                    "not installed or not on PATH; repository tools remain available".into()
                },
            }
        })
        .collect()
}

fn provider_for_file(file: &Path) -> Option<&'static Provider> {
    let extension = file.extension()?.to_str()?.to_ascii_lowercase();
    PROVIDERS
        .iter()
        .find(|provider| provider.extensions.contains(&extension.as_str()))
}

fn client_key(root: &Path, provider: &Provider) -> String {
    format!("{}:{}", crate::modules::fs::to_canon(root), provider.id)
}

fn language_id(file: &Path) -> &'static str {
    match file.extension().and_then(|extension| extension.to_str()) {
        Some("js" | "jsx" | "mjs" | "cjs") => "javascript",
        Some("tsx") => "typescriptreact",
        _ => "typescript",
    }
}

fn snapshot_response(
    provider: &'static Provider,
    file: &Path,
    snapshot: DiagnosticSnapshot,
) -> LspDiagnosticsResponse {
    let status = if snapshot.fresh {
        LspDiagnosticStatus::Fresh
    } else if snapshot.diagnostics.is_empty() {
        LspDiagnosticStatus::Pending
    } else {
        LspDiagnosticStatus::Cached
    };
    let detail: String = match status {
        LspDiagnosticStatus::Fresh => "fresh publishDiagnostics response".into(),
        LspDiagnosticStatus::Cached => {
            "file content unchanged; returning cached diagnostics".into()
        }
        LspDiagnosticStatus::Pending => {
            "no publishDiagnostics response arrived inside the bounded wait".into()
        }
        _ => unreachable!("snapshot response uses connected states only"),
    };
    response(
        provider,
        file,
        status,
        snapshot.diagnostics,
        snapshot.waited_ms,
        detail,
    )
}

fn response(
    provider: &'static Provider,
    file: &Path,
    status: LspDiagnosticStatus,
    diagnostics: Vec<LspDiagnostic>,
    waited_ms: u128,
    detail: impl Into<String>,
) -> LspDiagnosticsResponse {
    LspDiagnosticsResponse {
        provider: provider.id,
        status,
        file: crate::modules::fs::to_canon(file),
        diagnostics,
        waited_ms,
        detail: detail.into(),
    }
}

fn find_executable(executable: &str, path: Option<&std::ffi::OsStr>) -> Option<PathBuf> {
    let path = path?;
    std::env::split_paths(path)
        .flat_map(|directory| executable_candidates(&directory, executable))
        .find(|candidate| is_executable(candidate))
}

fn executable_candidates(directory: &Path, executable: &str) -> Vec<PathBuf> {
    let base = directory.join(executable);
    #[cfg(windows)]
    {
        let mut candidates = vec![base.clone()];
        let extensions = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
        candidates.extend(
            extensions
                .split(';')
                .filter(|extension| !extension.is_empty())
                .map(|extension| directory.join(format!("{executable}{extension}"))),
        );
        candidates
    }
    #[cfg(not(windows))]
    {
        vec![base]
    }
}

#[cfg(unix)]
fn is_executable(candidate: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    std::fs::metadata(candidate)
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(candidate: &Path) -> bool {
    candidate.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_routing_keeps_semantics_optional() {
        let empty = tempfile::tempdir().expect("tempdir");
        let infos = provider_statuses(Some("ts"), Some(empty.path().as_os_str()), None, None);

        assert_eq!(infos.len(), 1);
        assert_eq!(infos[0].id, "typescript");
        assert_eq!(infos[0].status, LspProviderStatus::Unavailable);
        assert!(infos[0]
            .detail
            .contains("repository tools remain available"));
    }

    #[test]
    fn executable_discovery_reports_available_provider() {
        let bin = tempfile::tempdir().expect("tempdir");
        let marker = bin.path().join("rust-analyzer");
        std::fs::write(&marker, "").expect("write executable marker");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&marker, std::fs::Permissions::from_mode(0o755))
                .expect("mark executable");
        }
        let infos = provider_statuses(Some("rs"), Some(bin.path().as_os_str()), None, None);

        assert_eq!(infos.len(), 1);
        assert_eq!(infos[0].id, "rust-analyzer");
        assert_eq!(infos[0].status, LspProviderStatus::Available);
        assert!(infos[0].resolved_path.is_some());
    }

    #[cfg(unix)]
    #[test]
    fn plain_path_file_is_not_reported_as_executable() {
        let bin = tempfile::tempdir().expect("tempdir");
        std::fs::write(bin.path().join("pyright-langserver"), "").expect("write plain marker");
        let infos = provider_statuses(Some("py"), Some(bin.path().as_os_str()), None, None);

        assert_eq!(infos.len(), 1);
        assert_eq!(infos[0].status, LspProviderStatus::Unavailable);
    }

    #[test]
    fn provider_status_does_not_start_a_lazy_client() {
        let root = tempfile::tempdir().expect("root");
        let bin = tempfile::tempdir().expect("bin");
        let marker = bin.path().join("typescript-language-server");
        std::fs::write(&marker, "").expect("write executable marker");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&marker, std::fs::Permissions::from_mode(0o755))
                .expect("mark executable");
        }
        let state = LspState::default();
        let infos = provider_statuses(
            Some("ts"),
            Some(bin.path().as_os_str()),
            Some(root.path()),
            Some(&state),
        );

        assert_eq!(infos[0].status, LspProviderStatus::Available);
        assert!(state.clients.lock().expect("clients").is_empty());
    }

    #[test]
    fn broken_provider_state_is_visible() {
        let root = tempfile::tempdir().expect("root");
        let state = LspState::default();
        let key = client_key(root.path(), &PROVIDERS[0]);
        state
            .broken
            .lock()
            .expect("broken state")
            .insert(key, "initialize failed".into());
        let infos = provider_statuses(Some("ts"), None, Some(root.path()), Some(&state));

        assert_eq!(infos[0].status, LspProviderStatus::Broken);
        assert_eq!(infos[0].detail, "initialize failed");
    }
}
