use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::modules::workspace::{authorize_agent_existing_path, WorkspaceEnv, WorkspaceRegistry};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LspProviderStatus {
    Available,
    Unavailable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct LspProviderInfo {
    pub id: &'static str,
    pub language: &'static str,
    pub status: LspProviderStatus,
    pub executable: &'static str,
    pub resolved_path: Option<String>,
    pub detail: String,
}

struct Provider {
    id: &'static str,
    language: &'static str,
    executable: &'static str,
    extensions: &'static [&'static str],
}

const PROVIDERS: &[Provider] = &[
    Provider {
        id: "typescript",
        language: "typescript",
        executable: "typescript-language-server",
        extensions: &["js", "jsx", "mjs", "cjs", "ts", "mts", "cts", "tsx"],
    },
    Provider {
        id: "pyright",
        language: "python",
        executable: "pyright-langserver",
        extensions: &["py"],
    },
    Provider {
        id: "rust-analyzer",
        language: "rust",
        executable: "rust-analyzer",
        extensions: &["rs"],
    },
];

#[tauri::command]
pub fn agent_lsp_status(
    root: String,
    project_root: String,
    file: Option<String>,
    workspace: Option<WorkspaceEnv>,
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
    ))
}

fn provider_statuses(
    extension: Option<&str>,
    path: Option<&std::ffi::OsStr>,
) -> Vec<LspProviderInfo> {
    PROVIDERS
        .iter()
        .filter(|provider| {
            extension.is_none_or(|extension| provider.extensions.contains(&extension))
        })
        .map(|provider| {
            let resolved = find_executable(provider.executable, path);
            LspProviderInfo {
                id: provider.id,
                language: provider.language,
                status: if resolved.is_some() {
                    LspProviderStatus::Available
                } else {
                    LspProviderStatus::Unavailable
                },
                executable: provider.executable,
                resolved_path: resolved.as_deref().map(crate::modules::fs::to_canon),
                detail: if resolved.is_some() {
                    "available; starts lazily on the first semantic request".into()
                } else {
                    "not installed or not on PATH; repository tools remain available".into()
                },
            }
        })
        .collect()
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
        let infos = provider_statuses(Some("ts"), Some(empty.path().as_os_str()));

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
        let infos = provider_statuses(Some("rs"), Some(bin.path().as_os_str()));

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
        let infos = provider_statuses(Some("py"), Some(bin.path().as_os_str()));

        assert_eq!(infos.len(), 1);
        assert_eq!(infos[0].status, LspProviderStatus::Unavailable);
    }
}
