import { create } from "zustand";
import type { ReceiptSummary } from "@/modules/ai/proof/recorder";

// Live receipt summaries keyed by session. The transport's RunRecorder pushes
// updates here on start / each tool / finish; the receipt strip subscribes.
// One latest run per session is enough for the compact strip; full history
// lives in the durable journal.
type ProofStoreState = {
  latestBySession: Record<string, ReceiptSummary>;
  setSummary: (summary: ReceiptSummary) => void;
  clearSession: (sessionId: string) => void;
};

export const useProofStore = create<ProofStoreState>((set) => ({
  latestBySession: {},
  setSummary: (summary) =>
    set((s) => ({
      latestBySession: { ...s.latestBySession, [summary.sessionId]: summary },
    })),
  clearSession: (sessionId) =>
    set((s) => {
      if (!(sessionId in s.latestBySession)) return s;
      const next = { ...s.latestBySession };
      delete next[sessionId];
      return { latestBySession: next };
    }),
}));
