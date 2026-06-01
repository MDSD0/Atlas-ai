import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { native } from "@/modules/ai/lib/native";


const RECENTS_STORE_PATH = "atlas-settings.json";
const KEY_RECENT_WORKSPACES = "recentWorkspaces";
const MAX_RECENTS = 10;

const prefsStore = new LazyStore(RECENTS_STORE_PATH, {
  defaults: {},
  autoSave: 200,
});

export type RecentWorkspace = {
  path: string;
  name: string;
  addedAt: number;
};

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export function workspaceBindingErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type WorkspaceState = {
  projectId: string | null;
  projectName: string;
  workspaceRoot: string | null;
  recentWorkspaces: RecentWorkspace[];

  setWorkspaceRoot: (path: string) => Promise<void>;
  clearWorkspace: () => void;
  addRecent: (path: string) => void;
  removeRecent: (path: string) => void;
  loadRecents: () => Promise<void>;
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  projectId: null,
  projectName: "Unbound",
  workspaceRoot: null,
  recentWorkspaces: [],

  setWorkspaceRoot: async (path: string) => {
    try {
      await native.workspaceAuthorizeAgentProject(path);
    } catch (error) {
      throw new Error(
        `Unable to open workspace "${path}": ${workspaceBindingErrorMessage(error)}`,
      );
    }
    set({ projectId: path, projectName: basename(path), workspaceRoot: path });
    get().addRecent(path);
  },

  clearWorkspace: () => {
    set({ projectId: null, projectName: "Unbound", workspaceRoot: null });
  },

  addRecent: (path: string) => {
    const name = basename(path);
    const existing = get().recentWorkspaces.filter((r) => r.path !== path);
    const next: RecentWorkspace[] = [
      { path, name, addedAt: Date.now() },
      ...existing,
    ].slice(0, MAX_RECENTS);
    set({ recentWorkspaces: next });
    void prefsStore.set(KEY_RECENT_WORKSPACES, next);
    void prefsStore.save();
  },

  removeRecent: (path: string) => {
    const next = get().recentWorkspaces.filter((r) => r.path !== path);
    set({ recentWorkspaces: next });
    void prefsStore.set(KEY_RECENT_WORKSPACES, next);
    void prefsStore.save();
  },

  loadRecents: async () => {
    try {
      const stored = await prefsStore.get<RecentWorkspace[]>(
        KEY_RECENT_WORKSPACES,
      );
      if (Array.isArray(stored)) {
        set({ recentWorkspaces: stored.slice(0, MAX_RECENTS) });
      }
    } catch {
      // Storage may be unavailable on first run.
    }
  },
}));
