import { useChatStore } from "@/modules/ai/store/chatStore";
import { useWorkspaceStore } from "./workspaceStore";
import { openFolderDialog } from "./openFolderDialog";

// Single project/session binding flow shared by the composer project chip,
// the explorer "Open project" affordance, and the welcome screen. Every entry
// point ends in the same state: a session whose binding matches the workspace.

export type ProjectChoice = {
  /** Selected logical workspace root, or null for an unbound project. */
  workspaceRoot: string | null;
  /** Display name (basename, or "Unbound"). */
  name: string;
};

/** Distinct bound projects across all sessions, most-recent first. */
export function listKnownProjects(): ProjectChoice[] {
  const sessions = useChatStore.getState().sessions;
  const seen = new Set<string>();
  const out: ProjectChoice[] = [];
  for (const s of sessions) {
    const root = s.workspaceRoot ?? null;
    if (!root || seen.has(root)) continue;
    seen.add(root);
    out.push({ workspaceRoot: root, name: s.projectName ?? root });
  }
  return out;
}

/** Bind a folder (authorize, may throw) then start a fresh project-bound session. */
export async function openProjectFromPath(path: string): Promise<void> {
  await useWorkspaceStore.getState().setWorkspaceRoot(path);
  useChatStore.getState().newSession();
}

/**
 * Finder picker -> bind -> fresh project-bound session.
 * Returns true if a folder was chosen, false if cancelled. May throw if the
 * chosen folder fails native authorization.
 */
export async function openProjectFromDialog(): Promise<boolean> {
  const path = await openFolderDialog();
  if (!path) return false;
  await openProjectFromPath(path);
  return true;
}

/** Clear the workspace and start a fresh unbound session. */
export function startUnboundSession(): void {
  useWorkspaceStore.getState().clearWorkspace();
  useChatStore.getState().newSession();
}

/**
 * Switch to the most recent session already bound to `workspaceRoot`, or bind
 * and open a fresh one if none exists. switchSession restores the workspace.
 */
export async function switchToProject(workspaceRoot: string): Promise<void> {
  const existing = useChatStore
    .getState()
    .sessions.find((s) => s.workspaceRoot === workspaceRoot);
  if (existing) {
    useChatStore.getState().switchSession(existing.id);
    return;
  }
  await openProjectFromPath(workspaceRoot);
}
