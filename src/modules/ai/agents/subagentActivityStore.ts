import { create } from "zustand";

export type SubagentActivityStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type SubagentActivity = {
  id: string;
  parentCallId: string;
  sessionId: string;
  kind: string;
  description: string;
  status: SubagentActivityStatus;
  step: string | null;
  summary: string | null;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
};

type StartActivity = Pick<
  SubagentActivity,
  "id" | "parentCallId" | "sessionId" | "kind" | "description"
>;

type ActivityState = {
  runs: Record<string, SubagentActivity>;
  begin: (run: StartActivity) => void;
  markRunning: (id: string) => void;
  setStep: (id: string, step: string) => void;
  finish: (
    id: string,
    result: { summary?: string; error?: string; cancelled?: boolean },
  ) => void;
  clearSession: (sessionId: string) => void;
};

const MAX_RETAINED_RUNS = 60;

function boundedRuns(
  runs: Record<string, SubagentActivity>,
): Record<string, SubagentActivity> {
  const entries = Object.entries(runs);
  if (entries.length <= MAX_RETAINED_RUNS) return runs;
  return Object.fromEntries(
    entries
      .sort(
        ([, a], [, b]) =>
          (b.endedAt ?? b.startedAt ?? 0) - (a.endedAt ?? a.startedAt ?? 0),
      )
      .slice(0, MAX_RETAINED_RUNS),
  );
}

export const useSubagentActivityStore = create<ActivityState>((set) => ({
  runs: {},
  begin: (run) =>
    set((state) => ({
      runs: boundedRuns({
        ...state.runs,
        [run.id]: {
          ...run,
          status: "queued",
          step: null,
          summary: null,
          error: null,
          startedAt: null,
          endedAt: null,
          durationMs: null,
        },
      }),
    })),
  markRunning: (id) =>
    set((state) => {
      const run = state.runs[id];
      if (!run || run.status !== "queued") return state;
      return {
        runs: {
          ...state.runs,
          [id]: { ...run, status: "running", startedAt: Date.now() },
        },
      };
    }),
  setStep: (id, step) =>
    set((state) => {
      const run = state.runs[id];
      if (!run || run.step === step) return state;
      return { runs: { ...state.runs, [id]: { ...run, step } } };
    }),
  finish: (id, result) =>
    set((state) => {
      const run = state.runs[id];
      if (!run) return state;
      const endedAt = Date.now();
      return {
        runs: {
          ...state.runs,
          [id]: {
            ...run,
            status: result.cancelled
              ? "cancelled"
              : result.error
                ? "failed"
                : "completed",
            summary: result.summary ?? null,
            error: result.error ?? null,
            endedAt,
            durationMs: run.startedAt ? endedAt - run.startedAt : 0,
          },
        },
      };
    }),
  clearSession: (sessionId) =>
    set((state) => ({
      runs: Object.fromEntries(
        Object.entries(state.runs).filter(([, run]) => run.sessionId !== sessionId),
      ),
    })),
}));
