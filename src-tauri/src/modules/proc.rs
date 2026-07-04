use std::process::Command;

#[cfg(windows)]
pub fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
#[inline]
pub fn hide_console(_cmd: &mut Command) {}

// ──────────────────────────────────────────────────────────────────────────
// Descendant-tree kill. `SharedChild::kill()` (and `std::process::Child::kill`)
// only terminates the immediate process — if that process is a shell that
// itself forked a dev server, the server survives as an orphan. These
// helpers make sure a kill takes the whole tree with it:
//   - Unix: put the child in its own new process group at spawn time, then
//     `killpg` that group instead of signaling just the one pid.
//   - Windows: assign the child to a Job Object with KILL_ON_JOB_CLOSE (the
//     same mechanism already proven for the PTY's shell tree in
//     `pty::job::PtyJob`); closing/dropping the Job Object kills every
//     process it contains.
// ──────────────────────────────────────────────────────────────────────────

#[cfg(unix)]
pub fn new_process_group(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    // pgid 0 means "make this child the leader of a brand new group" (its
    // own pid becomes the pgid), isolating it from Atlas's own group so a
    // later `killpg` can't ever hit the app itself.
    cmd.process_group(0);
}

#[cfg(not(unix))]
#[inline]
pub fn new_process_group(_cmd: &mut Command) {}

#[cfg(unix)]
pub fn kill_process_group(pid: u32) {
    unsafe {
        libc::killpg(pid as libc::pid_t, libc::SIGKILL);
    }
}

#[cfg(not(unix))]
#[inline]
pub fn kill_process_group(_pid: u32) {}

#[cfg(windows)]
pub type JobGuard = super::pty::job::PtyJob;

#[cfg(not(windows))]
pub struct JobGuard;

/// Best-effort: assigns `pid` to a fresh Job Object with KILL_ON_JOB_CLOSE.
/// Returns `None` (a plain-kill fallback, same as before this existed) if Job
/// creation fails or on non-Windows platforms, where `kill_process_group`
/// covers the same need.
#[cfg(windows)]
pub fn try_create_job(pid: u32) -> Option<JobGuard> {
    match JobGuard::create_for(pid) {
        Ok(job) => Some(job),
        Err(e) => {
            log::warn!("failed to create job object for pid {pid}: {e}");
            None
        }
    }
}

#[cfg(not(windows))]
#[inline]
pub fn try_create_job(_pid: u32) -> Option<JobGuard> {
    None
}
