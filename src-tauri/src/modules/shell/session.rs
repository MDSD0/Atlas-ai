use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;

use super::persistent::{wrap_persistent, PersistentShell, ReadOutcome};
use crate::modules::workspace::{resolve_path, WorkspaceEnv};

pub struct ShellSession {
    pub cwd: Mutex<String>,
    pub workspace: WorkspaceEnv,
    pub pristine: AtomicBool,
    #[allow(dead_code)]
    pub started_at_ms: u64,
    sentinel: String,
    /// The real long-lived child shell. `None` until first use; also reset
    /// to `None` after a timeout or an unexpected exit (e.g. the command ran
    /// `exit`, or the shell crashed) so the next call transparently spawns a
    /// fresh one rather than leaving the session stuck. Held for the whole
    /// duration of `run()`, which both serializes commands (a real shell can
    /// only run one at a time) and protects the spawn-or-reuse decision.
    proc: Mutex<Option<PersistentShell>>,
}

#[derive(Serialize)]
pub struct SessionRunOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub truncated: bool,
    pub cwd_after: String,
}

// Sentinel is randomized per session so untrusted command stdout can't spoof a
// cwd update by emitting the marker literal.
static SENTINEL_COUNTER: AtomicU64 = AtomicU64::new(0);

fn generate_sentinel() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let counter = SENTINEL_COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id() as u64;
    let mix = nanos ^ counter.rotate_left(17) ^ pid.rotate_left(31);
    format!("__ATLAS_CWD_{:016x}_{:016x}__", mix, counter)
}

impl ShellSession {
    pub fn new(initial_cwd: String, workspace: WorkspaceEnv) -> Self {
        let started_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Self {
            cwd: Mutex::new(initial_cwd),
            workspace,
            pristine: AtomicBool::new(true),
            started_at_ms,
            sentinel: generate_sentinel(),
            proc: Mutex::new(None),
        }
    }

    pub fn current_cwd(&self) -> String {
        self.cwd.lock().unwrap().clone()
    }

    pub fn run(
        &self,
        command: String,
        cwd_hint: Option<String>,
        workspace_hint: Option<WorkspaceEnv>,
        timeout: Duration,
    ) -> Result<SessionRunOutput, String> {
        let trimmed = command.trim().to_string();
        if trimmed.is_empty() {
            return Err("empty command".into());
        }
        if self.pristine.load(Ordering::Acquire) {
            if let Some(hint) = cwd_hint.filter(|s| !s.is_empty()) {
                let effective_workspace = workspace_hint.as_ref().unwrap_or(&self.workspace);
                let p = resolve_path(&hint, effective_workspace);
                if p.is_dir() {
                    *self.cwd.lock().unwrap() = hint;
                }
            }
        }
        let effective_workspace = workspace_hint.unwrap_or_else(|| self.workspace.clone());
        let wrapped = wrap_persistent(&trimmed, &effective_workspace, &self.sentinel);

        // Held for the whole call: this is both the spawn-or-reuse decision
        // and the serialization a single real shell process requires (only
        // one command can be in flight on its stdin at a time).
        let mut proc_slot = self.proc.lock().unwrap();
        let needs_spawn = match proc_slot.as_ref() {
            Some(p) => !p.is_alive(),
            None => true,
        };
        if needs_spawn {
            let cwd = self.current_cwd();
            *proc_slot = Some(PersistentShell::spawn(&effective_workspace, &cwd)?);
        }
        let proc = proc_slot.as_mut().expect("just ensured Some");

        if let Err(e) = proc.write_command(&wrapped) {
            // Stdin write failed — the shell is dead even though our EOF
            // detection hasn't caught up yet. Drop it now so the *next* call
            // spawns fresh instead of repeating this error.
            *proc_slot = None;
            return Err(format!("persistent shell write failed: {e}"));
        }

        match proc.read_until_sentinel(&self.sentinel, timeout) {
            ReadOutcome::Completed {
                stdout,
                stderr,
                exit_code,
                cwd_after,
                truncated,
            } => {
                self.pristine.store(false, Ordering::Release);
                if let Some(new_cwd) = cwd_after {
                    let p = resolve_path(&new_cwd, &self.workspace);
                    if p.is_dir() {
                        *self.cwd.lock().unwrap() = new_cwd;
                    }
                }
                let resolved_cwd = self.current_cwd().replace('\\', "/");
                Ok(SessionRunOutput {
                    stdout,
                    stderr,
                    exit_code: Some(exit_code),
                    timed_out: false,
                    truncated,
                    cwd_after: resolved_cwd,
                })
            }
            ReadOutcome::TimedOut {
                partial_stdout,
                partial_stderr,
                truncated,
            } => {
                // A hung foreground command can't be safely interrupted
                // in-place through a plain pipe (no PTY, no real Ctrl+C
                // semantics) — kill the whole shell and let the next call
                // transparently respawn. Only this in-flight command's
                // env-var/cwd state (if it changed anything before hanging)
                // is lost; earlier commands' state was already captured.
                *proc_slot = None;
                self.pristine.store(false, Ordering::Release);
                Ok(SessionRunOutput {
                    stdout: partial_stdout,
                    stderr: partial_stderr,
                    exit_code: None,
                    timed_out: true,
                    truncated,
                    cwd_after: self.current_cwd().replace('\\', "/"),
                })
            }
            ReadOutcome::ProcessExited {
                partial_stdout,
                partial_stderr,
                truncated,
            } => {
                // The command itself ran `exit`, or the shell crashed. Same
                // recovery as a timeout: drop it, next call gets a fresh one.
                *proc_slot = None;
                self.pristine.store(false, Ordering::Release);
                Ok(SessionRunOutput {
                    stdout: partial_stdout,
                    stderr: partial_stderr,
                    exit_code: None,
                    timed_out: false,
                    truncated,
                    cwd_after: self.current_cwd().replace('\\', "/"),
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sentinels_are_unique_per_session() {
        let a = ShellSession::new("/tmp".into(), WorkspaceEnv::Local);
        let b = ShellSession::new("/tmp".into(), WorkspaceEnv::Local);
        assert_ne!(a.sentinel, b.sentinel);
        assert!(a.sentinel.starts_with("__ATLAS_CWD_"));
        assert!(a.sentinel.ends_with("__"));
        assert!(a.sentinel.len() > 20);
    }

    #[test]
    fn new_session_is_pristine_with_no_process_yet() {
        let s = ShellSession::new("/tmp".into(), WorkspaceEnv::Local);
        assert!(s.pristine.load(Ordering::Acquire));
        assert!(s.proc.lock().unwrap().is_none());
    }
}
