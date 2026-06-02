import { create } from "zustand";
import { agentNative, type LspProviderInfo } from "../lib/native";
import {
  simpleMemConfig,
  SimpleMemAdapter,
  type SimpleMemHealth,
} from "../memory";

// Honest capability status for the CodeReality panel footer: which language
// servers are actually reachable, and which memory provider is active. This
// reports real probe results — it never claims a capability that isn't there.

export type MemoryStatus = {
  // LocalRecords is always the active default; SimpleMem is an optional sidecar.
  primary: "local_records";
  simplemem: SimpleMemHealth;
};

type StatusState = {
  lsp: LspProviderInfo[] | null;
  memory: MemoryStatus | null;
  loading: boolean;
  refresh: (workspaceRoot: string | null) => Promise<void>;
};

// SimpleMem is opt-in; default adapter is disabled, so health() reports
// "disabled" rather than probing a sidecar nobody started.
async function simpleMemHealth(): Promise<SimpleMemHealth> {
  try {
    return await (await simpleMemConfig.adapter()).health();
  } catch {
    return new SimpleMemAdapter().health();
  }
}

export const useStatusStore = create<StatusState>((set) => ({
  lsp: null,
  memory: null,
  loading: false,

  refresh: async (workspaceRoot) => {
    if (!workspaceRoot) {
      set({ lsp: null, memory: null, loading: false });
      return;
    }
    set({ loading: true });
    const [lsp, simplemem] = await Promise.all([
      agentNative.lspStatus(workspaceRoot).catch(() => [] as LspProviderInfo[]),
      simpleMemHealth(),
    ]);
    set({
      lsp,
      memory: { primary: "local_records", simplemem },
      loading: false,
    });
  },
}));
