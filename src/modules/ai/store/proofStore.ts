import { create } from "zustand";
import type { ReceiptSummary } from "@/modules/ai/proof/recorder";

function hasMeaningfulEvidence(summary: ReceiptSummary): boolean {
  return (
    summary.actionCount > 0 ||
    summary.changedFiles.length > 0 ||
    summary.checks.length > 0 ||
    summary.diagnostics.length > 0 ||
    summary.failures.length > 0 ||
    summary.status === "failed"
  );
}

// Live receipt summaries keyed by session. The transport's RunRecorder pushes
// updates here on start / each tool / finish; the receipt strip subscribes.
// One latest run per session is enough for the compact strip; full history
// lives in the durable journal.
type ProofStoreState = {
  currentBySession: Record<string, ReceiptSummary>;
  latestBySession: Record<string, ReceiptSummary>;
  setSummary: (summary: ReceiptSummary) => void;
  clearSession: (sessionId: string) => void;
};

export const useProofStore = create<ProofStoreState>((set) => ({
  currentBySession: {},
  latestBySession: {},
  setSummary: (summary) =>
    set((s) => {
      const currentBySession = {
        ...s.currentBySession,
        [summary.sessionId]: summary,
      };
      if (!hasMeaningfulEvidence(summary)) return { currentBySession };
      return {
        currentBySession,
        latestBySession: { ...s.latestBySession, [summary.sessionId]: summary },
      };
    }),
  clearSession: (sessionId) =>
    set((s) => {
      if (
        !(sessionId in s.latestBySession) &&
        !(sessionId in s.currentBySession)
      ) return s;
      const next = { ...s.latestBySession };
      const current = { ...s.currentBySession };
      delete next[sessionId];
      delete current[sessionId];
      return { latestBySession: next, currentBySession: current };
    }),
}));
