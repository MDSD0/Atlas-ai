mod index;
mod projection;
mod ranking;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, State};

use crate::modules::fs::watch::{watch_reality_root, FsWatchState};
use crate::modules::workspace::{authorize_agent_existing_path, WorkspaceEnv, WorkspaceRegistry};
use index::{build_snapshot, RealitySnapshot};
pub use projection::RealityContextResponse;

const DEFAULT_MAX_TOKENS: usize = 1200;
const MIN_MAX_TOKENS: usize = 128;
const HARD_MAX_TOKENS: usize = 4000;
pub(super) const MAX_CACHE_AGE_MS: u64 = 4000;
const _: () = assert!(MAX_CACHE_AGE_MS < 5000);

#[derive(Default)]
pub struct RealityState {
    snapshots: Mutex<HashMap<PathBuf, RealitySnapshot>>,
}

impl RealityState {
    fn context(
        &self,
        root: PathBuf,
        task: &str,
        max_tokens: usize,
    ) -> Result<RealityContextResponse, String> {
        let cache_hit = {
            let mut snapshots = self.snapshots.lock().expect("reality state poisoned");
            let cache_hit = snapshots
                .get(&root)
                .is_some_and(|snapshot| snapshot_is_fresh(snapshot, now_ms()));
            if !cache_hit {
                snapshots.remove(&root);
            }
            cache_hit
        };
        if !cache_hit {
            let snapshot = build_snapshot(&root)?;
            self.snapshots
                .lock()
                .expect("reality state poisoned")
                .entry(root.clone())
                .or_insert(snapshot);
        }
        let snapshots = self.snapshots.lock().expect("reality state poisoned");
        Ok(projection::project(
            snapshots.get(&root).expect("snapshot inserted"),
            task,
            max_tokens,
            cache_hit,
        ))
    }

    pub fn invalidate_paths(&self, paths: &[String]) -> usize {
        let mut snapshots = self.snapshots.lock().expect("reality state poisoned");
        let before = snapshots.len();
        snapshots.retain(|root, _| {
            !paths
                .iter()
                .any(|changed| Path::new(changed).starts_with(root))
        });
        before - snapshots.len()
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn agent_reality_context(
    task: String,
    root: String,
    project_root: String,
    max_tokens: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    app: AppHandle,
    registry: State<'_, WorkspaceRegistry>,
    watch_state: State<'_, FsWatchState>,
    state: State<'_, RealityState>,
) -> Result<RealityContextResponse, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root = authorize_agent_existing_path(&registry, &root, &project_root, &workspace, false)?;
    if !root.is_dir() {
        return Err("repository context root is not a directory".into());
    }
    if task.trim().is_empty() {
        return Err("repository context task is empty".into());
    }
    let watch_status = match watch_reality_root(&watch_state, &app, &root) {
        Ok(()) => "watching".to_string(),
        Err(error) => format!("degraded: {error}"),
    };
    let max_tokens = max_tokens
        .unwrap_or(DEFAULT_MAX_TOKENS)
        .clamp(MIN_MAX_TOKENS, HARD_MAX_TOKENS);
    let mut response = state.context(root, task.trim(), max_tokens)?;
    response.watch_status = watch_status;
    Ok(response)
}

fn snapshot_is_fresh(snapshot: &RealitySnapshot, now_ms: u64) -> bool {
    now_ms.saturating_sub(snapshot.indexed_at_ms) < MAX_CACHE_AGE_MS
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalidation_drops_only_affected_cached_root() {
        let a = tempfile::tempdir().expect("tempdir a");
        let b = tempfile::tempdir().expect("tempdir b");
        std::fs::write(a.path().join("a.ts"), "export function a() {}\n").expect("write a");
        std::fs::write(b.path().join("b.ts"), "export function b() {}\n").expect("write b");
        let state = RealityState::default();

        state
            .context(a.path().to_path_buf(), "a", DEFAULT_MAX_TOKENS)
            .expect("context a");
        state
            .context(b.path().to_path_buf(), "b", DEFAULT_MAX_TOKENS)
            .expect("context b");
        assert_eq!(state.snapshots.lock().expect("lock").len(), 2);

        let invalidated = state.invalidate_paths(&[a.path().join("a.ts").to_string_lossy().into()]);

        assert_eq!(invalidated, 1);
        let snapshots = state.snapshots.lock().expect("lock");
        assert!(!snapshots.contains_key(a.path()));
        assert!(snapshots.contains_key(b.path()));
    }

    #[test]
    fn repeated_context_uses_lazy_cache_until_invalidated() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("app.ts"), "export function app() {}\n").expect("write app");
        let state = RealityState::default();

        let first = state
            .context(dir.path().to_path_buf(), "app", DEFAULT_MAX_TOKENS)
            .expect("first context");
        let second = state
            .context(dir.path().to_path_buf(), "app", DEFAULT_MAX_TOKENS)
            .expect("second context");
        state.invalidate_paths(&[dir.path().join("app.ts").to_string_lossy().into()]);
        let third = state
            .context(dir.path().to_path_buf(), "app", DEFAULT_MAX_TOKENS)
            .expect("third context");

        assert!(!first.cache_hit);
        assert!(second.cache_hit);
        assert!(!third.cache_hit);
    }

    #[test]
    fn lazy_cache_expires_inside_five_second_freshness_bound() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("app.ts"), "export function app() {}\n").expect("write app");
        let state = RealityState::default();

        state
            .context(dir.path().to_path_buf(), "app", DEFAULT_MAX_TOKENS)
            .expect("first context");
        state
            .snapshots
            .lock()
            .expect("lock")
            .get_mut(dir.path())
            .expect("snapshot")
            .indexed_at_ms = now_ms().saturating_sub(MAX_CACHE_AGE_MS);
        let refreshed = state
            .context(dir.path().to_path_buf(), "app", DEFAULT_MAX_TOKENS)
            .expect("refreshed context");

        assert!(!refreshed.cache_hit);
    }
}
