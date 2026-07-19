import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace/env";
import { agentNative, native } from "../lib/native";
import { withFileMutationQueue } from "../tools/fileMutationQueue";

/**
 * Per-turn workspace checkpoints ("return arrow" restore).
 *
 * Every agent turn records the pre-image of each file the agent mutates
 * (first write per turn wins). Restoring to a past user message rewrites
 * those files back to their state before that turn ran and deletes files
 * the agent created, in one user-initiated action.
 *
 * Scope: file mutations made through Atlas tools (edit/multi_edit/write_file
 * and plan-mode applies). Shell-side mutations are not tracked.
 *
 * Storage: in-memory per session, mirrored (debounced, bounded) to
 * `.atlas/checkpoints/<sessionId>.json` inside the bound workspace so
 * restore still works after an app restart.
 */

export type FileSnapshot = {
  path: string;
  /** Pre-image content, or null when the file did not exist before the turn. */
  original: string | null;
};

export type CheckpointTurn = {
  messageId: string;
  at: number;
  files: FileSnapshot[];
};

type SessionCheckpoints = {
  workspaceRoot: string | null;
  turns: CheckpointTurn[];
};

/** Skip pre-images larger than this — restore for such files is not offered. */
const MAX_FILE_BYTES = 1024 * 1024;
/** Prune oldest turns beyond these bounds. */
const MAX_TURNS = 40;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 500;

const bySession = new Map<string, SessionCheckpoints>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** In-flight or completed disk hydration per session. Awaiting the stored
 * promise (not just membership) is what makes ensureCheckpointsLoaded safe
 * against the begin-turn fire-and-forget hydration racing a restore click. */
const hydrations = new Map<string, Promise<void>>();

function checkpointFilePath(workspaceRoot: string, sessionId: string): string {
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  return `${root}/.atlas/checkpoints/${sessionId}.json`;
}

function totalBytes(s: SessionCheckpoints): number {
  let n = 0;
  for (const t of s.turns) {
    for (const f of t.files) n += f.path.length + (f.original?.length ?? 0);
  }
  return n;
}

function pruneBounds(s: SessionCheckpoints): void {
  while (s.turns.length > MAX_TURNS) s.turns.shift();
  while (s.turns.length > 1 && totalBytes(s) > MAX_TOTAL_BYTES) s.turns.shift();
}

function schedulePersist(sessionId: string): void {
  const s = bySession.get(sessionId);
  if (!s || !s.workspaceRoot) return;
  const existing = persistTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  persistTimers.set(
    sessionId,
    setTimeout(() => {
      persistTimers.delete(sessionId);
      void persistNow(sessionId);
    }, PERSIST_DEBOUNCE_MS),
  );
}

async function persistNow(sessionId: string): Promise<void> {
  const s = bySession.get(sessionId);
  if (!s || !s.workspaceRoot) return;
  const root = s.workspaceRoot;
  const dir = `${root.replace(/\/$/, "")}/.atlas/checkpoints`;
  try {
    await agentNative.createDir(dir, root).catch(() => {});
    await agentNative.writeFile(
      checkpointFilePath(root, sessionId),
      JSON.stringify({ workspaceRoot: root, turns: s.turns }),
      root,
    );
  } catch {
    // Checkpoint persistence is best-effort; in-memory restore still works.
  }
}

function hydrateFromDisk(
  sessionId: string,
  workspaceRoot: string,
): Promise<void> {
  const existing = hydrations.get(sessionId);
  if (existing) return existing;
  const run = hydrateFromDiskNow(sessionId, workspaceRoot);
  hydrations.set(sessionId, run);
  return run;
}

async function hydrateFromDiskNow(
  sessionId: string,
  workspaceRoot: string,
): Promise<void> {
  try {
    const r = await agentNative.readFile(
      checkpointFilePath(workspaceRoot, sessionId),
      workspaceRoot,
    );
    if (r.kind !== "text") return;
    const parsed = JSON.parse(r.content) as SessionCheckpoints;
    if (!Array.isArray(parsed.turns)) return;
    const mem = bySession.get(sessionId);
    if (!mem || mem.turns.length === 0) {
      bySession.set(sessionId, {
        workspaceRoot,
        turns: parsed.turns.filter(
          (t) => typeof t.messageId === "string" && Array.isArray(t.files),
        ),
      });
      return;
    }
    // Disk holds older turns from a previous app run; in-memory turns are
    // newer. Keep disk turns that ended before the first in-memory turn.
    const firstMemAt = mem.turns[0]?.at ?? 0;
    const older = parsed.turns.filter(
      (t) =>
        typeof t.messageId === "string" &&
        Array.isArray(t.files) &&
        t.at < firstMemAt &&
        !mem.turns.some((m) => m.messageId === t.messageId),
    );
    mem.turns = [...older, ...mem.turns];
    pruneBounds(mem);
  } catch {
    // No disk checkpoints — fine.
  }
}

/**
 * Mark the start of an agent turn anchored to the triggering user message.
 * Re-running the same message (auto-resume, approval continuation) reuses the
 * existing turn so first-write-wins pre-images are preserved.
 */
export function beginCheckpointTurn(
  sessionId: string,
  messageId: string | null,
  workspaceRoot: string | null,
): void {
  if (!messageId) return;
  let s = bySession.get(sessionId);
  if (!s) {
    s = { workspaceRoot, turns: [] };
    bySession.set(sessionId, s);
  }
  s.workspaceRoot = workspaceRoot ?? s.workspaceRoot;
  if (workspaceRoot) void hydrateFromDisk(sessionId, workspaceRoot);
  const last = s.turns[s.turns.length - 1];
  if (last?.messageId === messageId) return;
  if (s.turns.some((t) => t.messageId === messageId)) return;
  s.turns.push({ messageId, at: Date.now(), files: [] });
  pruneBounds(s);
  schedulePersist(sessionId);
}

/**
 * Record the pre-image of a file the agent is about to mutate. First capture
 * per (turn, path) wins. `original === null` means the file did not exist.
 * No-op when the session has no active checkpoint turn (scoped agents).
 */
export function captureFileSnapshot(
  sessionId: string | null | undefined,
  path: string,
  original: string | null,
): void {
  if (!sessionId) return;
  const s = bySession.get(sessionId);
  const turn = s?.turns[s.turns.length - 1];
  if (!s || !turn) return;
  if (original !== null && original.length > MAX_FILE_BYTES) return;
  if (turn.files.some((f) => f.path === path)) return;
  turn.files.push({ path, original });
  pruneBounds(s);
  schedulePersist(sessionId);
}

/** True when a restore target exists for this user message. */
export function hasCheckpoint(sessionId: string, messageId: string): boolean {
  const s = bySession.get(sessionId);
  return !!s?.turns.some((t) => t.messageId === messageId);
}

/** True when a checkpoint turn is open for this session — callers use this to
 * skip expensive pre-image reads whose snapshot would be discarded. */
export function hasActiveCheckpointTurn(
  sessionId: string | null | undefined,
): boolean {
  if (!sessionId) return false;
  return (bySession.get(sessionId)?.turns.length ?? 0) > 0;
}

/** Ensure on-disk checkpoints for this session are loaded (app restart). */
export async function ensureCheckpointsLoaded(
  sessionId: string,
  workspaceRoot: string | null,
): Promise<void> {
  if (!workspaceRoot) return;
  await hydrateFromDisk(sessionId, workspaceRoot);
  const s = bySession.get(sessionId);
  if (s) s.workspaceRoot = workspaceRoot;
}

export type RestorePlan = {
  /** path -> content to write back, or null to delete (file was created). */
  files: Map<string, string | null>;
  turnCount: number;
};

/**
 * Compute the workspace restore plan for "return to before `messageId`":
 * union of pre-images from that turn through the latest, oldest wins per path.
 */
export function computeRestorePlan(
  sessionId: string,
  messageId: string,
): RestorePlan | null {
  const s = bySession.get(sessionId);
  if (!s) return null;
  const idx = s.turns.findIndex((t) => t.messageId === messageId);
  if (idx === -1) return null;
  const files = new Map<string, string | null>();
  for (let i = idx; i < s.turns.length; i++) {
    for (const f of s.turns[i].files) {
      if (!files.has(f.path)) files.set(f.path, f.original);
    }
  }
  return { files, turnCount: s.turns.length - idx };
}

export type RestoreResult = {
  restored: string[];
  deleted: string[];
  failed: Array<{ path: string; error: string }>;
};

/**
 * Apply a restore plan to the workspace and drop the consumed turns.
 * User-initiated: writes go through the workspace-authorized native API.
 */
export async function restoreToMessage(
  sessionId: string,
  messageId: string,
): Promise<RestoreResult | null> {
  const plan = computeRestorePlan(sessionId, messageId);
  const s = bySession.get(sessionId);
  if (!plan || !s) return null;
  const result: RestoreResult = { restored: [], deleted: [], failed: [] };
  for (const [path, original] of plan.files) {
    try {
      // Same-file serialization is a merge-blocker (ATLAS.md): route every
      // restore write/delete through the same per-path mutation queue the
      // agent's own tools use, so a straggling agent write can't interleave.
      await withFileMutationQueue(path, async () => {
        if (original === null) {
          await invoke<void>("fs_delete", {
            path,
            workspace: currentWorkspaceEnv(),
          });
        } else {
          await native.writeFile(path, original);
        }
      });
      (original === null ? result.deleted : result.restored).push(path);
    } catch (e) {
      result.failed.push({ path, error: String(e) });
    }
  }
  const idx = s.turns.findIndex((t) => t.messageId === messageId);
  if (idx !== -1) s.turns.splice(idx);
  schedulePersist(sessionId);
  return result;
}

/** Remove all checkpoint state for a session (called on session delete). */
export function deleteCheckpoints(sessionId: string): void {
  const s = bySession.get(sessionId);
  const timer = persistTimers.get(sessionId);
  if (timer) clearTimeout(timer);
  persistTimers.delete(sessionId);
  bySession.delete(sessionId);
  hydrations.delete(sessionId);
  if (s?.workspaceRoot) {
    void invoke<void>("fs_delete", {
      path: checkpointFilePath(s.workspaceRoot, sessionId),
      workspace: currentWorkspaceEnv(),
    }).catch(() => {});
  }
}

/** Test-only: reset module state. */
export function __resetCheckpointsForTest(): void {
  for (const t of persistTimers.values()) clearTimeout(t);
  persistTimers.clear();
  bySession.clear();
  hydrations.clear();
}
