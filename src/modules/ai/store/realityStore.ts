import { create } from "zustand";
import { agentNative, type RepoContextResponse } from "../lib/native";

// Frontend view of the native CodeReality projection. The panel reads this;
// it refreshes on demand (and when the bound workspace changes). The native
// side owns indexing, ignore policy, tree-sitter symbols, and the token budget;
// this store only caches the latest snapshot for display.

export type RealityStatus = "idle" | "loading" | "ready" | "unavailable";

type RealityState = {
  status: RealityStatus;
  root: string | null;
  snapshot: RepoContextResponse | null;
  error: string | null;
  refresh: (workspaceRoot: string | null) => Promise<void>;
  reset: () => void;
};

// A neutral task keeps the projection broad: the panel wants repository-wide
// inventory, not a task subgraph. The native budget still bounds the result.
const INVENTORY_TASK = "repository inventory overview";
const INVENTORY_MAX_TOKENS = 2000;

export const useRealityStore = create<RealityState>((set, get) => ({
  status: "idle",
  root: null,
  snapshot: null,
  error: null,

  refresh: async (workspaceRoot) => {
    if (!workspaceRoot) {
      set({ status: "idle", root: null, snapshot: null, error: null });
      return;
    }
    set({ status: "loading", root: workspaceRoot, error: null });
    try {
      const snapshot = await agentNative.repoContext(
        INVENTORY_TASK,
        workspaceRoot,
        INVENTORY_MAX_TOKENS,
      );
      // Guard against a stale response arriving after the workspace changed.
      if (get().root !== workspaceRoot) return;
      set({ status: "ready", snapshot, error: null });
    } catch (e) {
      if (get().root !== workspaceRoot) return;
      set({ status: "unavailable", snapshot: null, error: String(e) });
    }
  },

  reset: () => set({ status: "idle", root: null, snapshot: null, error: null }),
}));
