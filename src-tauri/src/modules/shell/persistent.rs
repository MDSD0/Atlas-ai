// A genuinely persistent shell process: one long-lived child per
// `ShellSession`, commands written to its stdin and read back off stdout /
// stderr via a sentinel-framed protocol, instead of spawning a fresh
// one-shot process per command (see `mod.rs`'s `run_blocking` for that older
// path, still used by `shell_run_command` and `bash_background`).
//
// Because commands are written into a shell that keeps running, `export`,
// `cd`, aliases, functions, and shell options set by one command are visible
// to the next command in the same session — the thing "persistent agent
// shell" originally claimed but didn't do.

use std::io::{Read, Write};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use shared_child::SharedChild;

use super::MAX_OUTPUT_BYTES;
use crate::modules::proc::JobGuard;
use crate::modules::workspace::WorkspaceEnv;

/// A growable byte buffer a reader thread appends to, with a condvar so a
/// waiting caller can block (with a deadline) until new bytes arrive instead
/// of busy-polling.
struct StreamBuf {
    data: Mutex<Vec<u8>>,
    truncated: AtomicBool,
    cv: Condvar,
}

const MARKER_TAIL_BYTES: usize = 64 * 1024;

impl StreamBuf {
    fn new() -> Self {
        Self {
            data: Mutex::new(Vec::new()),
            truncated: AtomicBool::new(false),
            cv: Condvar::new(),
        }
    }

    fn push(&self, bytes: &[u8]) {
        let mut d = self.data.lock().unwrap();
        let cap = MAX_OUTPUT_BYTES + MARKER_TAIL_BYTES;
        if d.len() + bytes.len() <= cap {
            d.extend_from_slice(bytes);
        } else {
            self.truncated.store(true, Ordering::Release);
            let mut tail = d[d.len().min(MAX_OUTPUT_BYTES)..].to_vec();
            let prefix_needed = MAX_OUTPUT_BYTES.saturating_sub(d.len());
            let prefix_take = prefix_needed.min(bytes.len());
            d.extend_from_slice(&bytes[..prefix_take]);
            tail.extend_from_slice(&bytes[prefix_take..]);
            if tail.len() > MARKER_TAIL_BYTES {
                tail.drain(0..tail.len() - MARKER_TAIL_BYTES);
            }
            d.truncate(MAX_OUTPUT_BYTES);
            d.extend_from_slice(&tail);
        }
        self.cv.notify_all();
    }
}

pub struct PersistentShell {
    child: Arc<SharedChild>,
    stdin: Mutex<Box<dyn Write + Send>>,
    stdout: Arc<StreamBuf>,
    stderr: Arc<StreamBuf>,
    stdout_cursor: usize,
    stderr_cursor: usize,
    alive: Arc<AtomicBool>,
    /// Covers the whole descendant tree a command run through this shell may
    /// have spawned (e.g. a hung foreground command) — see `proc::JobGuard`.
    job: Option<JobGuard>,
}

pub enum ReadOutcome {
    Completed {
        stdout: String,
        stderr: String,
        exit_code: i32,
        cwd_after: Option<String>,
        truncated: bool,
    },
    TimedOut {
        partial_stdout: String,
        partial_stderr: String,
        truncated: bool,
    },
    /// The shell process ended before both markers appeared — the command
    /// itself ran `exit`, or the shell crashed. The session auto-recovers by
    /// spawning a fresh process on the next call; only this in-flight
    /// command's environment changes (if any) are lost.
    ProcessExited {
        partial_stdout: String,
        partial_stderr: String,
        truncated: bool,
    },
}

fn reader_thread(
    mut pipe: impl Read + Send + 'static,
    buf: Arc<StreamBuf>,
    alive: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        let mut chunk = [0u8; 8192];
        loop {
            match pipe.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => buf.push(&chunk[..n]),
                Err(_) => break,
            }
        }
        // EOF on either stream means the process is gone (or about to be) —
        // wake up anyone waiting so they don't block for the full timeout.
        alive.store(false, Ordering::Release);
        buf.cv.notify_all();
    });
}

impl PersistentShell {
    pub fn spawn(workspace: &WorkspaceEnv, initial_cwd: &str) -> Result<Self, String> {
        let mut cmd = build_persistent_command(workspace, initial_cwd)?;
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        crate::modules::proc::hide_console(&mut cmd);
        crate::modules::proc::new_process_group(&mut cmd);

        let child = Arc::new(SharedChild::spawn(&mut cmd).map_err(|e| e.to_string())?);
        let job = crate::modules::proc::try_create_job(child.id());
        let alive = Arc::new(AtomicBool::new(true));
        let kill_on_fail = || {
            let _ = child.kill();
        };
        let stdin = child.take_stdin().ok_or_else(|| {
            kill_on_fail();
            "no stdin pipe".to_string()
        })?;
        let stdout_pipe = child.take_stdout().ok_or_else(|| {
            kill_on_fail();
            "no stdout pipe".to_string()
        })?;
        let stderr_pipe = child.take_stderr().ok_or_else(|| {
            kill_on_fail();
            "no stderr pipe".to_string()
        })?;

        let stdout = Arc::new(StreamBuf::new());
        let stderr = Arc::new(StreamBuf::new());
        reader_thread(stdout_pipe, stdout.clone(), alive.clone());
        reader_thread(stderr_pipe, stderr.clone(), alive.clone());

        Ok(Self {
            child,
            stdin: Mutex::new(Box::new(stdin)),
            stdout,
            stderr,
            stdout_cursor: 0,
            stderr_cursor: 0,
            alive,
            job,
        })
    }

    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Acquire)
    }

    pub fn write_command(&self, wrapped: &str) -> std::io::Result<()> {
        let mut stdin = self.stdin.lock().unwrap();
        stdin.write_all(wrapped.as_bytes())?;
        stdin.flush()
    }

    /// Waits for both the stdout marker (`{sentinel}|{rc}|{cwd}`) and the
    /// bare stderr marker (`{sentinel}`), extracting each stream's output
    /// since the last call and advancing the cursors past what was consumed.
    /// Compacts both buffers on a successful read so memory doesn't grow
    /// across a long-lived session.
    pub fn read_until_sentinel(&mut self, sentinel: &str, timeout: Duration) -> ReadOutcome {
        let deadline = Instant::now() + timeout;

        let stdout_marker = match wait_for_marker(
            &self.stdout,
            self.stdout_cursor,
            sentinel,
            deadline,
            &self.alive,
        ) {
            Some(m) => m,
            None => {
                let (partial_stdout, stdout_truncated) =
                    drain_lossy(&self.stdout, &mut self.stdout_cursor);
                let (partial_stderr, stderr_truncated) =
                    drain_lossy(&self.stderr, &mut self.stderr_cursor);
                let truncated = stdout_truncated || stderr_truncated;
                return if self.is_alive() {
                    ReadOutcome::TimedOut {
                        partial_stdout,
                        partial_stderr,
                        truncated,
                    }
                } else {
                    ReadOutcome::ProcessExited {
                        partial_stdout,
                        partial_stderr,
                        truncated,
                    }
                };
            }
        };

        let stderr_marker = match wait_for_marker_bare(
            &self.stderr,
            self.stderr_cursor,
            sentinel,
            deadline,
            &self.alive,
        ) {
            Some(idx) => idx,
            None => {
                // stdout completed but stderr's marker never showed — still
                // report what we have rather than discarding the stdout side.
                let (partial_stdout, stdout_truncated) = extract_and_advance_capped(
                    &self.stdout,
                    &mut self.stdout_cursor,
                    stdout_marker.content_end,
                );
                let partial_stdout = partial_stdout.trim_end_matches('\n').to_string();
                self.stdout_cursor = stdout_marker
                    .marker_end
                    .min(self.stdout.data.lock().unwrap().len());
                let (partial_stderr, stderr_truncated) =
                    drain_lossy(&self.stderr, &mut self.stderr_cursor);
                let truncated = stdout_truncated || stderr_truncated;
                return if self.is_alive() {
                    ReadOutcome::TimedOut {
                        partial_stdout,
                        partial_stderr,
                        truncated,
                    }
                } else {
                    ReadOutcome::ProcessExited {
                        partial_stdout,
                        partial_stderr,
                        truncated,
                    }
                };
            }
        };

        let (mut stdout_text, stdout_truncated) = extract_and_advance_capped(
            &self.stdout,
            &mut self.stdout_cursor,
            stdout_marker.content_end,
        );
        if !stdout_truncated {
            // Strip the wrapper's injected leading newline before the
            // marker, along with the command's own trailing newline(s) —
            // matches the prior one-shot design's normalization.
            stdout_text = stdout_text.trim_end_matches('\n').to_string();
        }
        let (stderr_text, stderr_truncated) =
            extract_and_advance_capped(&self.stderr, &mut self.stderr_cursor, stderr_marker);
        // Consume past the trailing sentinel text itself on both streams.
        advance_past(
            &self.stdout,
            &mut self.stdout_cursor,
            stdout_marker.marker_end,
        );
        // +1 to also consume the trailing newline our stderr marker always emits.
        advance_past(
            &self.stderr,
            &mut self.stderr_cursor,
            stderr_marker + sentinel.len() + 1,
        );

        ReadOutcome::Completed {
            stdout: stdout_text,
            stderr: stderr_text,
            exit_code: stdout_marker.exit_code,
            cwd_after: stdout_marker.cwd,
            truncated: stdout_truncated || stderr_truncated,
        }
    }
}

impl Drop for PersistentShell {
    fn drop(&mut self) {
        // Drop the Job Object first (Windows: fires KILL_ON_JOB_CLOSE for
        // the whole descendant tree), then the process-group signal (Unix),
        // then fall back to killing just the immediate process either way.
        self.job.take();
        crate::modules::proc::kill_process_group(self.child.id());
        let _ = self.child.kill();
    }
}

struct StdoutMarker {
    /// Byte offset (relative to buffer start) where the command's own output ends.
    content_end: usize,
    /// Byte offset just past the full marker line (including trailing newline).
    marker_end: usize,
    exit_code: i32,
    cwd: Option<String>,
}

/// Blocks (via the buffer's condvar) until `sentinel` appears in `buf` at or
/// after `from`, the deadline passes, or the process dies. Parses the
/// `{sentinel}|{rc}|{cwd}` line found on the stdout stream.
fn wait_for_marker(
    buf: &StreamBuf,
    from: usize,
    sentinel: &str,
    deadline: Instant,
    alive: &AtomicBool,
) -> Option<StdoutMarker> {
    loop {
        let guard = buf.data.lock().unwrap();
        if let Some(found) = find_marker_line(&guard, from, sentinel) {
            return Some(found);
        }
        if !alive.load(Ordering::Acquire) {
            return None;
        }
        let now = Instant::now();
        if now >= deadline {
            return None;
        }
        let (_g, _timeout) = buf.cv.wait_timeout(guard, deadline - now).unwrap();
    }
}

/// Same wait as `wait_for_marker` but for the bare stderr sentinel (no
/// fields), returning the byte offset where the sentinel text starts.
fn wait_for_marker_bare(
    buf: &StreamBuf,
    from: usize,
    sentinel: &str,
    deadline: Instant,
    alive: &AtomicBool,
) -> Option<usize> {
    loop {
        let guard = buf.data.lock().unwrap();
        if let Some(idx) = find_bytes(&guard, from, sentinel.as_bytes()) {
            return Some(idx);
        }
        if !alive.load(Ordering::Acquire) {
            return None;
        }
        let now = Instant::now();
        if now >= deadline {
            return None;
        }
        let (_g, _timeout) = buf.cv.wait_timeout(guard, deadline - now).unwrap();
    }
}

fn find_bytes(haystack: &[u8], from: usize, needle: &[u8]) -> Option<usize> {
    if from >= haystack.len() || needle.is_empty() {
        return None;
    }
    haystack[from..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|p| p + from)
}

/// Finds `{sentinel}|{rc}|{cwd}\n` at or after `from` and parses it. The
/// content before the sentinel on this line boundary is the command's own
/// trailing output; `content_end` intentionally trims the single `\n` our
/// wrapper always emits right before the marker.
fn find_marker_line(haystack: &[u8], from: usize, sentinel: &str) -> Option<StdoutMarker> {
    let idx = find_bytes(haystack, from, sentinel.as_bytes())?;
    let after = &haystack[idx + sentinel.len()..];
    let line_end = after
        .iter()
        .position(|&b| b == b'\n')
        .unwrap_or(after.len());
    let line = String::from_utf8_lossy(&after[..line_end]);
    // Expected form: "|{rc}|{cwd}"
    let mut parts = line.splitn(3, '|');
    let _empty = parts.next();
    let rc: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(-1);
    let cwd = parts
        .next()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    Some(StdoutMarker {
        // Raw offset up to the sentinel. The wrapper always emits a leading
        // `\n` right before the sentinel (so the marker starts its own
        // line even if the command's output doesn't end in one) — trimmed
        // out, along with any of the command's own trailing newlines, when
        // the caller extracts this text (matches the prior one-shot design).
        content_end: idx,
        marker_end: idx + sentinel.len() + line_end + 1, // +1 for the newline itself
        exit_code: rc,
        cwd,
    })
}

/// Walks `end` back to the nearest UTF-8 character boundary at or before it,
/// so truncating mid-buffer never splits a multi-byte character (which
/// `from_utf8_lossy` wouldn't panic on, but would silently replace with a
/// `\u{FFFD}` — garbling otherwise-valid trailing text for no reason).
fn last_char_boundary(bytes: &[u8], mut end: usize) -> usize {
    while end > 0 && end < bytes.len() && (bytes[end] & 0xC0) == 0x80 {
        end -= 1;
    }
    end
}

fn extract_and_advance_capped(buf: &StreamBuf, cursor: &mut usize, end: usize) -> (String, bool) {
    let guard = buf.data.lock().unwrap();
    let end = end.min(guard.len());
    let start = *cursor;
    let len = end.saturating_sub(start);
    let truncated = len > MAX_OUTPUT_BYTES || buf.truncated.load(Ordering::Acquire);
    let capped_end = if truncated {
        last_char_boundary(&guard, start + MAX_OUTPUT_BYTES)
    } else {
        end
    };
    let text = String::from_utf8_lossy(&guard[start..capped_end]).into_owned();
    *cursor = end;
    (text, truncated)
}

fn advance_past(buf: &StreamBuf, cursor: &mut usize, end: usize) {
    let mut guard = buf.data.lock().unwrap();
    let end = end.min(guard.len());
    if end > *cursor {
        *cursor = end;
    }
    // Compact: drop already-consumed bytes so a long session's buffer
    // doesn't grow without bound. Cursor is rebased to 0 for both accessors
    // sharing this buffer's coordinate space (stdout/stderr are separate
    // buffers, each with their own cursor, so this is safe per-buffer).
    if *cursor > 0 {
        guard.drain(0..*cursor);
        *cursor = 0;
        if guard.is_empty() {
            buf.truncated.store(false, Ordering::Release);
        }
    }
}

fn drain_lossy(buf: &StreamBuf, cursor: &mut usize) -> (String, bool) {
    let guard = buf.data.lock().unwrap();
    let end = (*cursor + MAX_OUTPUT_BYTES).min(guard.len());
    let end = last_char_boundary(&guard, end);
    let text = String::from_utf8_lossy(&guard[*cursor..end]).into_owned();
    let truncated = end < guard.len() || buf.truncated.load(Ordering::Acquire);
    *cursor = guard.len();
    (text, truncated)
}

// ---------------------------------------------------------------------------
// Command framing: wrap the user's command so the shell, after running it,
// prints a marker on stdout (exit code + cwd) and a bare marker on stderr —
// with no `exit`, so the shell keeps running for the next command.
// ---------------------------------------------------------------------------

pub fn wrap_persistent(command: &str, workspace: &WorkspaceEnv, sentinel: &str) -> String {
    if workspace.is_wsl() {
        return wrap_posix_persistent(command, sentinel);
    }
    #[cfg(unix)]
    {
        wrap_posix_persistent(command, sentinel)
    }
    #[cfg(windows)]
    {
        let shell = crate::modules::pty::shell_init::windows_shell_path();
        let is_cmd = shell
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("cmd.exe"));
        if is_cmd {
            wrap_cmd_persistent(command, sentinel)
        } else {
            wrap_windows_persistent(command, sentinel)
        }
    }
}

fn wrap_posix_persistent(command: &str, sentinel: &str) -> String {
    format!(
        "{command}\n__atlas_rc=$?\nprintf '\\n%s|%s|%s\\n' '{sentinel}' \"$__atlas_rc\" \"$(pwd)\" 1>&1\nprintf '%s\\n' '{sentinel}' 1>&2\n",
    )
}

#[cfg(windows)]
fn wrap_windows_persistent(command: &str, sentinel: &str) -> String {
    // $LASTEXITCODE is sticky in PowerShell: it's only set by external
    // commands and otherwise carries over unchanged from whatever last set
    // it — including a prior call in this same persistent session. Reset it
    // first so we can tell "this command didn't touch it" (falls back to $?)
    // apart from "this command's exit code is genuinely whatever it was
    // last time" (a stale read).
    format!(
        "$LASTEXITCODE = $null\n{command}\n$__atlas_rc = if ($null -ne $LASTEXITCODE) {{ $LASTEXITCODE }} elseif ($?) {{ 0 }} else {{ 1 }}\n\"`n{sentinel}|$__atlas_rc|$($PWD.Path)\"\n[Console]::Error.WriteLine('{sentinel}')\n",
    )
}

#[cfg(windows)]
fn wrap_cmd_persistent(command: &str, sentinel: &str) -> String {
    format!(
        "{command}\nset \"__atlas_rc=%ERRORLEVEL%\"\necho.\necho {sentinel}^|%__atlas_rc%^|%CD%\necho {sentinel} 1>&2\n",
    )
}

// ---------------------------------------------------------------------------
// Process spawn: a bare shell reading commands from stdin (no `-c`).
// ---------------------------------------------------------------------------

fn build_persistent_command(
    workspace: &WorkspaceEnv,
    initial_cwd: &str,
) -> Result<std::process::Command, String> {
    #[cfg(windows)]
    if let WorkspaceEnv::Wsl { distro } = workspace {
        crate::modules::workspace::validate_wsl_distro_name(distro)?;
        let mut cmd = std::process::Command::new("wsl.exe");
        cmd.arg("-d").arg(distro);
        if !initial_cwd.is_empty() {
            cmd.arg("--cd").arg(initial_cwd);
        }
        return Ok(cmd);
    }
    #[cfg(unix)]
    {
        let _ = workspace;
        let mut cmd = std::process::Command::new("/bin/sh");
        if !initial_cwd.is_empty() {
            cmd.current_dir(initial_cwd);
        }
        Ok(cmd)
    }
    #[cfg(windows)]
    {
        let shell = crate::modules::pty::shell_init::windows_shell_path();
        let is_cmd = shell
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case("cmd.exe"))
            .unwrap_or(false);
        let mut cmd = std::process::Command::new(&shell);
        if is_cmd {
            cmd.arg("/Q").arg("/K").arg("rem persistent");
        } else {
            // Plain piped stdin with no args makes PowerShell behave like an
            // interactive host, echoing "PS C:\...>" prompts and the input
            // lines themselves into stdout — that pollutes every command's
            // output and breaks marker parsing. `-NonInteractive -Command -`
            // reads commands from stdin without that echo.
            cmd.arg("-NoProfile")
                .arg("-NoLogo")
                .arg("-NonInteractive")
                .arg("-Command")
                .arg("-");
        }
        if !initial_cwd.is_empty() {
            cmd.current_dir(initial_cwd);
        }
        Ok(cmd)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_posix_has_no_exit_and_dual_markers() {
        let wrapped = wrap_posix_persistent("echo hi", "SENT123");
        assert!(
            !wrapped.contains("\nexit "),
            "persistent wrapper must not exit the shell"
        );
        assert!(wrapped.contains("1>&1"));
        assert!(wrapped.contains("1>&2"));
        assert_eq!(wrapped.matches("SENT123").count(), 2);
    }

    #[cfg(windows)]
    #[test]
    fn cmd_wrapper_uses_cmd_syntax_and_dual_markers() {
        let wrapped = wrap_cmd_persistent("echo hi", "SENT123");
        assert!(wrapped.contains("%ERRORLEVEL%"));
        assert!(wrapped.contains("%CD%"));
        assert!(!wrapped.contains("$LASTEXITCODE"));
        assert_eq!(wrapped.matches("SENT123").count(), 2);
    }

    #[test]
    fn find_marker_line_parses_rc_and_cwd() {
        let haystack = b"hello world\nSENT|0|/repo/src\nignored tail";
        let m = find_marker_line(haystack, 0, "SENT").expect("marker found");
        assert_eq!(m.exit_code, 0);
        assert_eq!(m.cwd.as_deref(), Some("/repo/src"));
        assert_eq!(&haystack[..m.content_end], b"hello world\n");
        assert_eq!(
            String::from_utf8_lossy(&haystack[..m.content_end]).trim_end_matches('\n'),
            "hello world"
        );
    }

    #[test]
    fn last_char_boundary_walks_back_out_of_a_multibyte_sequence() {
        // '€' (U+20AC) encodes to 0xE2 0x82 0xAC — a 3-byte sequence.
        let bytes = "a€b".as_bytes(); // [0x61, 0xE2, 0x82, 0xAC, 0x62]
        assert_eq!(last_char_boundary(bytes, 0), 0); // start of 'a'
        assert_eq!(last_char_boundary(bytes, 1), 1); // start of '€'
        assert_eq!(last_char_boundary(bytes, 2), 1); // mid-'€' -> back to start of '€'
        assert_eq!(last_char_boundary(bytes, 3), 1); // mid-'€' -> back to start of '€'
        assert_eq!(last_char_boundary(bytes, 4), 4); // start of 'b'
        assert_eq!(last_char_boundary(bytes, 5), 5); // end of buffer
    }

    #[test]
    fn extract_and_advance_capped_does_not_split_a_multibyte_utf8_char_at_the_cap() {
        // Build a buffer where MAX_OUTPUT_BYTES lands inside a 3-byte '€'.
        let mut bytes = vec![b'a'; MAX_OUTPUT_BYTES - 1];
        bytes.extend_from_slice("€".as_bytes());
        bytes.extend_from_slice(b"tail");
        let buf = StreamBuf::new();
        buf.push(&bytes);
        let mut cursor = 0usize;
        let (text, truncated) = extract_and_advance_capped(&buf, &mut cursor, bytes.len());
        assert!(truncated);
        assert!(
            !text.contains('\u{FFFD}'),
            "must not contain a UTF-8 replacement character from a split multi-byte char"
        );
        assert!(
            text.ends_with('a'),
            "must cut cleanly before the multi-byte char, got tail: {:?}",
            &text[text.len().saturating_sub(5)..]
        );
    }

    #[test]
    fn find_marker_line_parses_nonzero_rc() {
        let haystack = b"SENT|17|/tmp\n";
        let m = find_marker_line(haystack, 0, "SENT").expect("marker found");
        assert_eq!(m.exit_code, 17);
    }

    #[test]
    fn find_marker_line_ignores_foreign_sentinel() {
        let haystack = b"output containing OTHER|0|/evil\n";
        assert!(find_marker_line(haystack, 0, "SENT").is_none());
    }

    #[test]
    fn find_bytes_respects_from_offset() {
        let haystack = b"SENT SENT SENT";
        let first = find_bytes(haystack, 0, b"SENT").unwrap();
        let second = find_bytes(haystack, first + 4, b"SENT").unwrap();
        assert_eq!(first, 0);
        assert_eq!(second, 5);
    }

    #[test]
    fn stream_buf_push_and_wait_wakes_immediately() {
        let buf = Arc::new(StreamBuf::new());
        buf.push(b"hello SENT|0|/x\n");
        let alive = AtomicBool::new(true);
        let m = wait_for_marker(
            &buf,
            0,
            "SENT",
            Instant::now() + Duration::from_millis(200),
            &alive,
        );
        assert!(m.is_some());
    }

    #[test]
    fn stream_buf_caps_noisy_output_but_preserves_prefix_and_marker_tail() {
        let buf = StreamBuf::new();
        let noisy = vec![b'a'; MAX_OUTPUT_BYTES + MARKER_TAIL_BYTES * 3];
        buf.push(&noisy);
        buf.push(b"\nSENT|0|/repo\n");

        let guard = buf.data.lock().unwrap();
        assert!(guard.len() <= MAX_OUTPUT_BYTES + MARKER_TAIL_BYTES);
        assert!(guard[..MAX_OUTPUT_BYTES].iter().all(|byte| *byte == b'a'));
        drop(guard);
        assert!(buf.truncated.load(Ordering::Acquire));

        let alive = AtomicBool::new(true);
        let marker = wait_for_marker(
            &buf,
            0,
            "SENT",
            Instant::now() + Duration::from_millis(200),
            &alive,
        );
        assert!(
            marker.is_some(),
            "marker must survive rolling-tail compaction"
        );
    }

    #[test]
    fn timeout_drain_never_returns_more_than_the_output_cap() {
        let buf = StreamBuf::new();
        buf.push(&vec![b'x'; MAX_OUTPUT_BYTES + MARKER_TAIL_BYTES * 2]);
        let mut cursor = 0;
        let (text, truncated) = drain_lossy(&buf, &mut cursor);
        assert!(truncated);
        assert!(text.len() <= MAX_OUTPUT_BYTES);
    }

    #[test]
    fn wait_for_marker_times_out_when_absent() {
        let buf = StreamBuf::new();
        buf.push(b"no marker here\n");
        let alive = AtomicBool::new(true);
        let start = Instant::now();
        let m = wait_for_marker(&buf, 0, "SENT", start + Duration::from_millis(50), &alive);
        assert!(m.is_none());
        assert!(start.elapsed() >= Duration::from_millis(45));
    }

    #[test]
    fn wait_for_marker_returns_none_when_process_dies() {
        let buf = StreamBuf::new();
        let alive = AtomicBool::new(false);
        let m = wait_for_marker(
            &buf,
            0,
            "SENT",
            Instant::now() + Duration::from_secs(5),
            &alive,
        );
        assert!(
            m.is_none(),
            "dead process must not block for the full timeout"
        );
    }
}

/// Live integration tests that actually spawn a real persistent PowerShell
/// process and drive it end to end — this is the platform this environment
/// can genuinely execute and verify. The POSIX/WSL spawn branches are
/// implemented symmetrically (same wrapper/framing logic, reusing the exact
/// same `PersistentShell`/`read_until_sentinel` machinery this test proves
/// correct) but are not live-spawned here.
#[cfg(all(windows, test))]
mod windows_integration_tests {
    use super::*;

    fn sentinel() -> String {
        format!(
            "__ATLAS_TEST_{}_{}__",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        )
    }

    fn run(shell: &mut PersistentShell, sentinel: &str, command: &str) -> ReadOutcome {
        run_with_timeout(shell, sentinel, command, Duration::from_secs(20))
    }

    fn run_with_timeout(
        shell: &mut PersistentShell,
        sentinel: &str,
        command: &str,
        timeout: Duration,
    ) -> ReadOutcome {
        let wrapped = wrap_persistent(command, &WorkspaceEnv::Local, sentinel);
        shell.write_command(&wrapped).expect("write_command");
        shell.read_until_sentinel(sentinel, timeout)
    }

    #[test]
    fn env_vars_and_cwd_persist_across_calls_and_exit_codes_are_captured() {
        let start_dir = std::env::temp_dir();
        let start_dir_str = start_dir.to_string_lossy().to_string();
        let mut shell = PersistentShell::spawn(&WorkspaceEnv::Local, &start_dir_str)
            .expect("spawn persistent shell");
        let sent = sentinel();

        // Nonzero exit code capture: `cmd /c exit 3` runs as an external
        // process, so it sets $LASTEXITCODE without killing our persistent
        // PowerShell host (unlike a bare top-level `exit`, which would).
        match run(&mut shell, &sent, "cmd /c exit 3") {
            ReadOutcome::Completed { exit_code, .. } => assert_eq!(exit_code, 3),
            other => panic!(
                "expected Completed with exit_code=3, got {}",
                describe(&other)
            ),
        }

        // Env var set in one call...
        match run(
            &mut shell,
            &sent,
            "$env:ATLAS_TEST_VAR = 'hello-from-atlas'",
        ) {
            ReadOutcome::Completed { exit_code, .. } => assert_eq!(exit_code, 0),
            other => panic!("expected Completed, got {}", describe(&other)),
        }
        // ...must be visible in a SEPARATE subsequent call. This is the
        // entire point of F-06: the old one-shot-per-command design could
        // never pass this.
        match run(&mut shell, &sent, "Write-Output $env:ATLAS_TEST_VAR") {
            ReadOutcome::Completed {
                stdout, exit_code, ..
            } => {
                assert_eq!(exit_code, 0);
                assert!(
                    stdout.contains("hello-from-atlas"),
                    "got stdout: {stdout:?}"
                );
            }
            other => panic!("expected Completed, got {}", describe(&other)),
        }

        // cwd persistence: cd into a subdirectory, confirm cwd_after reports
        // it, then confirm a later command still sees it as the cwd.
        let sub = start_dir.join("atlas_persistent_shell_test");
        std::fs::create_dir_all(&sub).expect("create test subdir");
        let sub_str = sub.to_string_lossy().to_string();
        match run(&mut shell, &sent, &format!("Set-Location '{sub_str}'")) {
            ReadOutcome::Completed {
                cwd_after,
                exit_code,
                ..
            } => {
                assert_eq!(exit_code, 0);
                let cwd = cwd_after.expect("cwd_after present");
                assert!(
                    cwd.to_lowercase().contains("atlas_persistent_shell_test"),
                    "got cwd: {cwd}"
                );
            }
            other => panic!("expected Completed, got {}", describe(&other)),
        }
        match run(&mut shell, &sent, "Write-Output (Get-Location).Path") {
            ReadOutcome::Completed { stdout, .. } => {
                assert!(
                    stdout
                        .to_lowercase()
                        .contains("atlas_persistent_shell_test"),
                    "cwd did not persist into next call, got stdout: {stdout:?}"
                );
            }
            other => panic!("expected Completed, got {}", describe(&other)),
        }

        let _ = std::fs::remove_dir_all(&sub);
    }

    #[test]
    fn a_hung_command_times_out_without_blocking_forever_and_the_slot_is_recoverable() {
        let start_dir = std::env::temp_dir().to_string_lossy().to_string();
        let mut shell = PersistentShell::spawn(&WorkspaceEnv::Local, &start_dir)
            .expect("spawn persistent shell");
        let sent = sentinel();

        let started = Instant::now();
        match run_with_timeout(
            &mut shell,
            &sent,
            "Start-Sleep -Seconds 30",
            Duration::from_secs(2),
        ) {
            ReadOutcome::TimedOut { .. } => {}
            other => panic!("expected TimedOut, got {}", describe(&other)),
        }
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "must return promptly at the requested timeout, not wait for the hung command"
        );

        // `ShellSession::run` is responsible for killing + respawning after
        // a timeout (see session.rs) — this test only proves the primitive
        // itself doesn't wedge and that a fresh shell works immediately
        // afterward, which is what that recovery relies on.
        drop(shell);
        let mut fresh = PersistentShell::spawn(&WorkspaceEnv::Local, &start_dir)
            .expect("respawn after timeout");
        match run(&mut fresh, &sent, "Write-Output 'still-alive'") {
            ReadOutcome::Completed {
                stdout, exit_code, ..
            } => {
                assert_eq!(exit_code, 0);
                assert!(stdout.contains("still-alive"));
            }
            other => panic!("expected Completed, got {}", describe(&other)),
        }
    }

    #[test]
    fn a_command_that_exits_the_host_is_reported_as_process_exited() {
        let start_dir = std::env::temp_dir().to_string_lossy().to_string();
        let mut shell = PersistentShell::spawn(&WorkspaceEnv::Local, &start_dir)
            .expect("spawn persistent shell");
        let sent = sentinel();

        // A bare top-level `exit` terminates the PowerShell host itself.
        match run(&mut shell, &sent, "exit 1") {
            ReadOutcome::ProcessExited { .. } => {}
            other => panic!("expected ProcessExited, got {}", describe(&other)),
        }
    }

    fn describe(outcome: &ReadOutcome) -> &'static str {
        match outcome {
            ReadOutcome::Completed { .. } => "Completed",
            ReadOutcome::TimedOut { .. } => "TimedOut",
            ReadOutcome::ProcessExited { .. } => "ProcessExited",
        }
    }
}
