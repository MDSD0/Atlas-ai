import { useCallback } from "react";
import { useWorkspaceStore } from "@/modules/workspace";
import type { Tab } from "./useTabs";

type Result = {
  explorerRoot: string | null;
  inheritedCwdForNewTab: () => string | undefined;
};

/**
 * Workspace-first cwd hook.
 *
 * Rules:
 * - explorerRoot is always workspaceRoot. Terminal cwd never changes it.
 * - New terminals inherit activeFolder (the last folder the user clicked in the
 *   explorer), or workspaceRoot if no folder has been explicitly selected.
 * - Terminal cd is terminal-local; it does not update app state here.
 *
 * The `activeTab` and `home` parameters are kept so the call-site in App.tsx
 * does not need to change, but they are not used to drive explorerRoot.
 */
export function useWorkspaceCwd(
  _activeTab: Tab | undefined,
  _tabs: Tab[],
  _home: string | null,
  activeFolder?: string | null,
): Result {
  const workspaceRoot = useWorkspaceStore((s) => s.workspaceRoot);

  // New terminal tabs start at the explorer's active folder (last folder the
  // user navigated to), falling back to workspaceRoot.
  // If no workspace is open, they start with no cwd (shell picks home).
  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    if (activeFolder) return activeFolder;
    return workspaceRoot ?? undefined;
  }, [activeFolder, workspaceRoot]);

  return { explorerRoot: workspaceRoot, inheritedCwdForNewTab };
}
