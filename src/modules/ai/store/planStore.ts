import { create } from "zustand";
import { agentNative } from "../lib/native";
import {
  fingerprintText,
  fingerprintsMatch,
  STALE_READ_ERROR,
  type ReadFingerprint,
} from "../tools/fingerprint";
import { withFileMutationQueue } from "../tools/fileMutationQueue";
import { observePostEdit } from "../tools/postEdit";
import { captureFileSnapshot } from "../checkpoints/checkpointStore";

export type QueuedEdit = {
  id: string;
  /** Tool that produced the queued mutation. */
  kind: "write_file" | "edit" | "multi_edit" | "create_directory";
  path: string;
  /** Explicitly selected project root for native agent IPC. */
  projectRoot: string;
  /** Original file content (empty for new files / create_directory). */
  originalContent: string;
  /** Proposed full content after edit (empty for create_directory). */
  proposedContent: string;
  /** True if the file did not exist when the edit was queued. */
  isNewFile: boolean;
  /** Reviewed source fingerprint. Checked again before delayed plan writes. */
  expectedFingerprint?: ReadFingerprint;
  /** Human-readable description, used for create_directory. */
  description?: string;
};

type PlanState = {
  /** Legacy/default plan state used by tests and any callsites without a session. */
  active: boolean;
  queue: QueuedEdit[];
  sessions: Record<string, { active: boolean; queue: QueuedEdit[] }>;
  isActive: (sessionId?: string | null) => boolean;
  queueFor: (sessionId?: string | null) => QueuedEdit[];
  toggle: (sessionId?: string | null) => void;
  enable: (sessionId?: string | null) => void;
  disable: (sessionId?: string | null) => void;
  enqueue: (q: QueuedEdit, sessionId?: string | null) => void;
  removeOne: (id: string, sessionId?: string | null) => void;
  clear: (sessionId?: string | null) => void;
  /** Apply queued edits in order. Returns per-edit results. */
  applyAll: (
    sessionId?: string | null,
  ) => Promise<{ id: string; ok: boolean; error?: string }[]>;
  /**
   * Apply only the given queued edits, in queue order. Successfully applied
   * edits leave the queue; edits that fail or were not selected remain so the
   * user can review/retry. Enables per-file accept without all-or-nothing.
   */
  applySome: (
    ids: readonly string[],
    sessionId?: string | null,
  ) => Promise<{ id: string; ok: boolean; error?: string }[]>;
};

let nextId = 1;
const EMPTY_QUEUE: QueuedEdit[] = [];

export function newQueuedEditId(): string {
  return `q-${Date.now().toString(36)}-${(nextId++).toString(36)}`;
}

async function assertQueuedEditFresh(q: QueuedEdit): Promise<void> {
  if (!q.expectedFingerprint) return;
  const current = await agentNative.readFile(q.path, q.projectRoot);
  if (
    current.kind !== "text" ||
    !fingerprintsMatch(q.expectedFingerprint, fingerprintText(current.content))
  ) {
    throw new Error(STALE_READ_ERROR);
  }
}

export const usePlanStore = create<PlanState>((set, get) => ({
  active: false,
  queue: [],
  sessions: {},
  isActive: (sessionId) => {
    if (!sessionId) return get().active;
    return get().sessions[sessionId]?.active ?? false;
  },
  queueFor: (sessionId) => {
    if (!sessionId) return get().queue;
    return get().sessions[sessionId]?.queue ?? EMPTY_QUEUE;
  },
  toggle: (sessionId) => {
    if (!sessionId) {
      set((s) => ({ active: !s.active, queue: s.active ? [] : s.queue }));
      return;
    }
    set((s) => {
      const cur = s.sessions[sessionId] ?? { active: false, queue: [] };
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            active: !cur.active,
            queue: cur.active ? [] : cur.queue,
          },
        },
      };
    });
  },
  enable: (sessionId) => {
    if (!sessionId) {
      set({ active: true });
      return;
    }
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: {
          active: true,
          queue: s.sessions[sessionId]?.queue ?? [],
        },
      },
    }));
  },
  disable: (sessionId) => {
    if (!sessionId) {
      set({ active: false, queue: [] });
      return;
    }
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: { active: false, queue: [] },
      },
    }));
  },
  enqueue: (q, sessionId) => {
    if (!sessionId) {
      set((s) => ({ queue: [...s.queue, q] }));
      return;
    }
    set((s) => {
      const cur = s.sessions[sessionId] ?? { active: false, queue: [] };
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: { ...cur, queue: [...cur.queue, q] },
        },
      };
    });
  },
  removeOne: (id, sessionId) => {
    if (!sessionId) {
      set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }));
      return;
    }
    set((s) => {
      const cur = s.sessions[sessionId] ?? { active: false, queue: [] };
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...cur,
            queue: cur.queue.filter((q) => q.id !== id),
          },
        },
      };
    });
  },
  clear: (sessionId) => {
    if (!sessionId) {
      set({ queue: [] });
      return;
    }
    set((s) => {
      const cur = s.sessions[sessionId] ?? { active: false, queue: [] };
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: { ...cur, queue: [] },
        },
      };
    });
  },
  async applyAll(sessionId) {
    return applyQueued(
      get,
      set,
      get().queueFor(sessionId).map((q) => q.id),
      sessionId,
    );
  },
  async applySome(ids, sessionId) {
    return applyQueued(get, set, ids, sessionId);
  },
}));

async function applyOne(q: QueuedEdit, sessionId?: string | null): Promise<void> {
  if (q.kind === "create_directory") {
    await agentNative.createDir(q.path, q.projectRoot);
    return;
  }
  await withFileMutationQueue(
    q.path,
    async () => {
      await assertQueuedEditFresh(q);
      captureFileSnapshot(
        sessionId,
        q.path,
        q.isNewFile ? null : q.originalContent,
      );
      await agentNative.writeFile(q.path, q.proposedContent, q.projectRoot);
      await observePostEdit(q.projectRoot, q.path);
    },
    (p) => agentNative.canonicalize(p, q.projectRoot),
  );
}

// Apply the selected queued edits in queue order. Applied edits are removed
// from the queue; failed and unselected edits stay so the user can retry.
async function applyQueued(
  get: () => PlanState,
  set: (partial: Partial<PlanState>) => void,
  ids: readonly string[],
  sessionId?: string | null,
): Promise<{ id: string; ok: boolean; error?: string }[]> {
  const selected = new Set(ids);
  const items = get().queueFor(sessionId).filter((q) => selected.has(q.id));
  const results: { id: string; ok: boolean; error?: string }[] = [];
  const appliedOk = new Set<string>();
  for (const q of items) {
    try {
      await applyOne(q, sessionId);
      results.push({ id: q.id, ok: true });
      appliedOk.add(q.id);
    } catch (e) {
      results.push({ id: q.id, ok: false, error: String(e) });
    }
  }
  if (!sessionId) {
    set({ queue: get().queue.filter((q) => !appliedOk.has(q.id)) });
  } else {
    const sessions = get().sessions;
    const cur = sessions[sessionId] ?? { active: false, queue: [] };
    set({
      sessions: {
        ...sessions,
        [sessionId]: {
          ...cur,
          queue: cur.queue.filter((q) => !appliedOk.has(q.id)),
        },
      },
    });
  }
  return results;
}
