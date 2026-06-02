import { create } from "zustand";
import type { PackedContextSnapshot } from "@/modules/ai/contextLedger/contracts";

type ContextLedgerState = {
  latestByProject: Record<string, PackedContextSnapshot>;
  capture: (snapshot: PackedContextSnapshot) => void;
  clearProject: (projectId: string) => void;
};

export const useContextLedgerStore = create<ContextLedgerState>((set) => ({
  latestByProject: {},
  capture: (snapshot) =>
    set((state) => ({
      latestByProject: {
        ...state.latestByProject,
        [snapshot.projectId]: snapshot,
      },
    })),
  clearProject: (projectId) =>
    set((state) => {
      if (!(projectId in state.latestByProject)) return state;
      const latestByProject = { ...state.latestByProject };
      delete latestByProject[projectId];
      return { latestByProject };
    }),
}));

export const contextLedger = {
  capture(snapshot: PackedContextSnapshot): void {
    useContextLedgerStore.getState().capture(snapshot);
  },

  get(projectId: string): PackedContextSnapshot | null {
    return useContextLedgerStore.getState().latestByProject[projectId] ?? null;
  },

  clearProject(projectId: string): void {
    useContextLedgerStore.getState().clearProject(projectId);
  },
};
