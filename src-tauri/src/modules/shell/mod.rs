pub mod background;
pub mod persistent;
pub mod ringbuffer;
pub mod session;

use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, RwLock};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use shared_child::SharedChild;

#[cfg(windows)]
use crate::modules::workspace::validate_wsl_distro_name;
use crate::modules::workspace::{authorize_spawn_cwd, WorkspaceEnv, WorkspaceRegistry};

use background::{BackgroundLogResponse, BackgroundProc, BackgroundProcInfo};
use session::{SessionRunOutput, ShellSession};

const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_TIMEOUT_SECS: u64 = 300;
pub(crate) const MAX_OUTPUT_BYTES: usize = 256 * 1024;

#[derive(Serialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub truncated: bool,
}

/// Runs a one-shot command via the user's login shell. Output is capped and
/// the process is force-killed on timeout. We deliberately do NOT pipe into
/// the user's interactive PTY — that would fight their input. AI tool calls
/// are presented in chat as their own structured result.
#[tauri::command]
pub async fn shell_run_command(
    command: String,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<CommandOutput, String> {
    let trimmed = command.trim().to_string();
    if trimmed.is_empty() {
        return Err("empty command".into());
    }

    let workspace = WorkspaceEnv::from_option(workspace);
    authorize_spawn_cwd(&registry, cwd.as_deref(), &workspace)?;
    let cwd_path = cwd
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let dur = Duration::from_secs(
        timeout_secs
            .unwrap_or(DEFAULT_TIMEOUT_SECS)
            .clamp(1, MAX_TIMEOUT_SECS),
    );

    // Runs on Tauri's dedicated blocking thread pool via spawn_blocking, not
    // one of the async runtime's own worker threads — awaiting the join
    // handle doesn't block a worker the way a synchronous mpsc recv() would.
    // Same pattern as git/commands.rs's `blocking` helper.
    tauri::async_runtime::spawn_blocking(move || run_blocking(trimmed, cwd_path, workspace, dur))
        .await
        .map_err(|e| e.to_string())?
}

fn run_blocking(
    command: String,
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    dur: Duration,
) -> Result<CommandOutput, String> {
    let mut cmd = build_oneshot_command(&command, &workspace, cwd.as_deref())?;
    if let (WorkspaceEnv::Local, Some(dir)) = (&workspace, cwd) {
        cmd.current_dir(dir);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::modules::proc::hide_console(&mut cmd);
    crate::modules::proc::new_process_group(&mut cmd);

    let child = Arc::new(SharedChild::spawn(&mut cmd).map_err(|e| {
        log::warn!("shell_run_command spawn failed: {e}");
        e.to_string()
    })?);
    let job = crate::modules::proc::try_create_job(child.id());
    let mut stdout_pipe = child.take_stdout().ok_or_else(|| {
        let _ = child.kill();
        "no stdout pipe".to_string()
    })?;
    let mut stderr_pipe = child.take_stderr().ok_or_else(|| {
        let _ = child.kill();
        "no stderr pipe".to_string()
    })?;

    let stdout_handle = thread::spawn(move || drain(&mut stdout_pipe));
    let stderr_handle = thread::spawn(move || drain(&mut stderr_pipe));

    let (tx, rx) = mpsc::channel();
    let waiter = Arc::clone(&child);
    thread::spawn(move || {
        let _ = tx.send(waiter.wait());
    });

    let (exit_code, timed_out) = match rx.recv_timeout(dur) {
        Ok(Ok(status)) => (status.code(), false),
        Ok(Err(e)) => return Err(e.to_string()),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            // A timed-out foreground command may have spawned descendants
            // (a shell running a dev server, say) — take the whole tree with
            // it, not just the shell itself.
            #[cfg(windows)]
            drop(job);
            #[cfg(not(windows))]
            let _ = job;
            crate::modules::proc::kill_process_group(child.id());
            let _ = child.kill();
            let _ = child.wait();
            (None, true)
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            return Err("shell wait thread disconnected".into());
        }
    };

    let (stdout_bytes, stdout_truncated) = stdout_handle.join().unwrap_or((Vec::new(), false));
    let (stderr_bytes, stderr_truncated) = stderr_handle.join().unwrap_or((Vec::new(), false));

    Ok(CommandOutput {
        stdout: String::from_utf8_lossy(&stdout_bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr_bytes).into_owned(),
        exit_code,
        timed_out,
        truncated: stdout_truncated || stderr_truncated,
    })
}

// ──────────────────────────────────────────────────────────────────────────
// Persistent agent shell state + background process state.
// ──────────────────────────────────────────────────────────────────────────

pub struct ShellState {
    sessions: RwLock<HashMap<u32, Arc<ShellSession>>>,
    bg: RwLock<HashMap<u32, Arc<BackgroundProc>>>,
    next_session_id: AtomicU32,
    next_bg_id: AtomicU32,
}

impl Default for ShellState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            bg: RwLock::new(HashMap::new()),
            next_session_id: AtomicU32::new(1),
            next_bg_id: AtomicU32::new(1),
        }
    }
}

#[tauri::command]
pub fn shell_session_open(
    state: tauri::State<ShellState>,
    registry: tauri::State<WorkspaceRegistry>,
    cwd: Option<String>,
    workspace: Option<WorkspaceEnv>,
) -> Result<u32, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    authorize_spawn_cwd(&registry, cwd.as_deref(), &workspace)?;
    let initial = match cwd.as_deref().filter(|s| !s.is_empty()) {
        Some(c) => c.to_string(),
        None => {
            if let WorkspaceEnv::Wsl { distro } = &workspace {
                crate::modules::workspace::wsl_home(distro.clone())?
            } else {
                crate::modules::fs::to_canon(dirs::home_dir().unwrap_or_else(|| PathBuf::from("/")))
            }
        }
    };
    let session = Arc::new(ShellSession::new(initial, workspace));
    let id = state.next_session_id.fetch_add(1, Ordering::Relaxed);
    state.sessions.write().unwrap().insert(id, session);
    Ok(id)
}

#[tauri::command]
pub async fn shell_session_run(
    state: tauri::State<'_, ShellState>,
    registry: tauri::State<'_, WorkspaceRegistry>,
    id: u32,
    command: String,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
    workspace: Option<WorkspaceEnv>,
) -> Result<SessionRunOutput, String> {
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| "no shell session".to_string())?;
    let effective_workspace = workspace
        .clone()
        .unwrap_or_else(|| session.workspace.clone());
    authorize_spawn_cwd(&registry, cwd.as_deref(), &effective_workspace)?;
    let dur = Duration::from_secs(
        timeout_secs
            .unwrap_or(DEFAULT_TIMEOUT_SECS)
            .clamp(1, MAX_TIMEOUT_SECS),
    );
    // See shell_run_command above: spawn_blocking + await instead of a
    // synchronous mpsc recv(), which would otherwise stall a Tauri async
    // runtime worker thread for up to MAX_TIMEOUT_SECS.
    tauri::async_runtime::spawn_blocking(move || session.run(command, cwd, workspace, dur))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn shell_session_close(state: tauri::State<ShellState>, id: u32) -> Result<(), String> {
    state.sessions.write().unwrap().remove(&id);
    Ok(())
}

// A killed job is removed immediately (the caller explicitly said they're
// done with it). A job that exits on its own is kept around for a grace
// window so `shell_bg_logs`/`shell_bg_list` can still report its final
// output/exit code, then pruned — mirrors the TTL+cap pattern already used
// for `WorkspaceRegistry`'s canonical-path cache.
const MAX_BG_JOBS: usize = 64;
const BG_EXITED_GRACE_MS: u64 = 5 * 60 * 1000;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Drops naturally-exited entries older than the grace window, then — if
/// still over the cap — drops the oldest-finished entries (never a still
/// running job) until back at the cap.
fn prune_bg(bg: &mut HashMap<u32, Arc<BackgroundProc>>) {
    let now = now_ms();
    bg.retain(|_, p| {
        let finished = p.finished_at_ms.load(Ordering::Acquire);
        finished == 0 || now.saturating_sub(finished) < BG_EXITED_GRACE_MS
    });
    if bg.len() > MAX_BG_JOBS {
        let mut finished: Vec<(u32, u64)> = bg
            .iter()
            .filter_map(|(id, p)| {
                let f = p.finished_at_ms.load(Ordering::Acquire);
                (f > 0).then_some((*id, f))
            })
            .collect();
        finished.sort_by_key(|(_, f)| *f);
        for (id, _) in finished {
            if bg.len() <= MAX_BG_JOBS {
                break;
            }
            bg.remove(&id);
        }
    }
}

#[tauri::command]
pub fn shell_bg_spawn(
    state: tauri::State<ShellState>,
    registry: tauri::State<WorkspaceRegistry>,
    command: String,
    cwd: Option<String>,
    workspace: Option<WorkspaceEnv>,
) -> Result<u32, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    authorize_spawn_cwd(&registry, cwd.as_deref(), &workspace)?;
    let proc = background::spawn(command, cwd, workspace)?;
    let id = state.next_bg_id.fetch_add(1, Ordering::Relaxed);
    let mut bg = state.bg.write().unwrap();
    prune_bg(&mut bg);
    if bg.len() >= MAX_BG_JOBS {
        return Err(format!(
            "too many background jobs ({MAX_BG_JOBS} running/recently-exited) — kill some with bash_kill before starting more"
        ));
    }
    bg.insert(id, proc);
    Ok(id)
}

#[tauri::command]
pub fn shell_bg_logs(
    state: tauri::State<ShellState>,
    handle: u32,
    since_offset: Option<u64>,
) -> Result<BackgroundLogResponse, String> {
    let proc = state
        .bg
        .read()
        .unwrap()
        .get(&handle)
        .cloned()
        .ok_or_else(|| "no background handle".to_string())?;
    Ok(proc.read_logs(since_offset.unwrap_or(0)))
}

#[tauri::command]
pub fn shell_bg_kill(state: tauri::State<ShellState>, handle: u32) -> Result<(), String> {
    // Removed immediately, not just killed: an explicit kill means the
    // caller is done with this handle, unlike a natural exit (where logs
    // may still be worth reading — see `prune_bg`'s grace window).
    if let Some(proc) = state.bg.write().unwrap().remove(&handle) {
        proc.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn shell_bg_remove(state: tauri::State<ShellState>, handle: u32) -> Result<(), String> {
    if let Some(proc) = state.bg.write().unwrap().remove(&handle) {
        if !proc.exited.load(Ordering::Acquire) {
            proc.kill();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn shell_bg_list(state: tauri::State<ShellState>) -> Result<Vec<BackgroundProcInfo>, String> {
    let mut map = state.bg.write().unwrap();
    prune_bg(&mut map);
    let mut out = Vec::with_capacity(map.len());
    for (id, p) in map.iter() {
        out.push(p.info(*id));
    }
    out.sort_by_key(|i| i.handle);
    Ok(out)
}

pub(crate) fn build_oneshot_command(
    command: &str,
    #[cfg_attr(not(windows), allow(unused_variables))] workspace: &WorkspaceEnv,
    #[cfg_attr(not(windows), allow(unused_variables))] cwd: Option<&str>,
) -> Result<Command, String> {
    #[cfg(windows)]
    if let WorkspaceEnv::Wsl { distro } = workspace {
        validate_wsl_distro_name(distro)?;
        let mut cmd = Command::new("wsl.exe");
        cmd.arg("-d").arg(distro);
        if let Some(cwd) = cwd.filter(|s| !s.is_empty()) {
            cmd.arg("--cd").arg(cwd);
        }
        cmd.arg("--exec").arg("sh").arg("-lc").arg(command);
        return Ok(cmd);
    }
    #[cfg(unix)]
    {
        let mut cmd = Command::new("/bin/sh");
        cmd.arg("-c").arg(command);
        Ok(cmd)
    }
    #[cfg(windows)]
    {
        let shell = crate::modules::pty::shell_init::windows_shell_path();
        let mut cmd = Command::new(&shell);
        let is_cmd = shell
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case("cmd.exe"))
            .unwrap_or(false);
        if is_cmd {
            cmd.arg("/C").arg(command);
        } else {
            cmd.arg("-NoProfile").arg("-Command").arg(command);
        }
        Ok(cmd)
    }
}

fn drain<R: Read>(reader: &mut R) -> (Vec<u8>, bool) {
    let mut out = Vec::new();
    let mut buf = [0u8; 8192];
    let mut truncated = false;
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if out.len() >= MAX_OUTPUT_BYTES {
                    truncated = true;
                    continue;
                }
                let take = (MAX_OUTPUT_BYTES - out.len()).min(n);
                out.extend_from_slice(&buf[..take]);
                if take < n {
                    truncated = true;
                }
            }
            Err(_) => break,
        }
    }
    (out, truncated)
}

#[cfg(test)]
mod bg_prune_tests {
    use super::*;

    // Real, near-instantly-exiting process. Fine for single-entry tests
    // where we deliberately overwrite `finished_at_ms` right after spawn and
    // assert before anything else touches it.
    fn spawn_trivial() -> Arc<BackgroundProc> {
        background::spawn("exit 0".to_string(), None, WorkspaceEnv::Local).expect("spawn trivial")
    }

    // A real process that stays alive for the duration of the test, so its
    // waiter thread never fires and can't race with a test manually poking
    // `finished_at_ms` — needed for the many-entries cap tests, where a
    // handful of `spawn_trivial()` calls would otherwise have already
    // exited (and had their real timestamp recorded) by the time the whole
    // loop finishes spawning 65+ of them.
    fn spawn_long_running() -> Arc<BackgroundProc> {
        background::spawn("sleep 120".to_string(), None, WorkspaceEnv::Local)
            .expect("spawn long-running")
    }

    #[test]
    fn removes_long_finished_entries_past_grace_window() {
        let mut bg = HashMap::new();
        let proc = spawn_trivial();
        proc.finished_at_ms.store(1, Ordering::Release); // ms=1 epoch: ancient
        bg.insert(1u32, proc);
        prune_bg(&mut bg);
        assert!(bg.is_empty(), "long-finished entry must be pruned");
    }

    #[test]
    fn keeps_recently_finished_entries_within_grace_window() {
        let mut bg = HashMap::new();
        let proc = spawn_trivial();
        proc.finished_at_ms.store(now_ms(), Ordering::Release);
        bg.insert(1u32, proc);
        prune_bg(&mut bg);
        assert_eq!(
            bg.len(),
            1,
            "recently-finished entry must survive the grace window"
        );
    }

    #[test]
    fn keeps_still_running_entries_regardless_of_age() {
        let mut bg = HashMap::new();
        let proc = spawn_long_running();
        // finished_at_ms left at 0 == "still running" in this model, no
        // matter how long ago it was spawned.
        bg.insert(1u32, proc.clone());
        prune_bg(&mut bg);
        assert_eq!(
            bg.len(),
            1,
            "a running (or unresolved) job must never be pruned by age"
        );
        proc.kill();
    }

    #[test]
    fn never_evicts_a_running_job_to_enforce_the_cap() {
        let mut bg = HashMap::new();
        for i in 0..(MAX_BG_JOBS as u32 + 5) {
            bg.insert(i, spawn_long_running()); // finished_at_ms == 0 for all, stays 0
        }
        prune_bg(&mut bg);
        assert_eq!(
            bg.len(),
            MAX_BG_JOBS + 5,
            "cap eviction must only ever remove finished entries, never running ones"
        );
        for p in bg.values() {
            p.kill();
        }
    }

    #[test]
    fn evicts_oldest_finished_entry_first_when_over_cap() {
        let mut bg = HashMap::new();
        let base = now_ms();
        let total = MAX_BG_JOBS as u32 + 5;
        for i in 0..total {
            // Stays alive for the whole test — only our manual store below
            // ever sets finished_at_ms, no race with a real exit.
            let proc = spawn_long_running();
            // All within the grace window, but staggered so id 0 is oldest.
            proc.finished_at_ms
                .store(base - u64::from(total - i), Ordering::Release);
            bg.insert(i, proc);
        }
        prune_bg(&mut bg);
        assert_eq!(bg.len(), MAX_BG_JOBS);
        assert!(
            !bg.contains_key(&0),
            "oldest-finished entry should be evicted first"
        );
        assert!(
            bg.contains_key(&(total - 1)),
            "most-recently-finished entry should survive"
        );
        for p in bg.values() {
            p.kill();
        }
    }
}
