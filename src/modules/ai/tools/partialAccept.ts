/**
 * Partial-acceptance handoff between the AI diff review pane and the file
 * mutation tools.
 *
 * When the user accepts a pending diff after rejecting or hand-editing some
 * hunks, the pane stores the merged result here and approves the tool call.
 * The tool's execute() then writes the user's merged content instead of the
 * model's original proposal, and tells the model the user amended it.
 *
 * One slot per session: Atlas surfaces one file-mutation approval at a time.
 */

type PartialOverride = { content: string; at: number };

/** sessionId -> normalized path -> pending override. Keyed per path so two
 * simultaneously-pending file approvals (parallel tool calls) can each carry
 * an amended version without clobbering one another. */
const bySession = new Map<string, Map<string, PartialOverride>>();

/** An override not consumed within this window is stale (the approved tool
 * call errored or was superseded) and must not apply to a later write. */
const OVERRIDE_TTL_MS = 2 * 60 * 1000;

function normalize(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

export function setPartialOverride(
  sessionId: string | null | undefined,
  path: string,
  content: string,
): void {
  if (!sessionId) return;
  let paths = bySession.get(sessionId);
  if (!paths) {
    paths = new Map();
    bySession.set(sessionId, paths);
  }
  paths.set(normalize(path), { content, at: Date.now() });
}

/**
 * Consume the pending override for this path, if any. Overrides for other
 * paths are left untouched; expired ones are dropped.
 */
export function consumePartialOverride(
  sessionId: string | null | undefined,
  path: string,
): string | null {
  if (!sessionId) return null;
  const paths = bySession.get(sessionId);
  if (!paths) return null;
  const key = normalize(path);
  const slot = paths.get(key);
  if (!slot) return null;
  paths.delete(key);
  if (paths.size === 0) bySession.delete(sessionId);
  if (Date.now() - slot.at > OVERRIDE_TTL_MS) return null;
  return slot.content;
}

/** Appended to tool results when the user's merged version was written. */
export const USER_AMENDED_NOTE =
  "The user reviewed this change and accepted a modified version (some hunks rejected or edited). The file on disk now contains the user's merged version, not your original proposal. Re-read the file before making further edits to it.";
