import { native } from "./native";

type ResourceRecord = {
  handles: Set<number>;
  onAbort: () => void;
};

type KillHandle = (handle: number) => Promise<void> | void;

const recordsBySignal = new WeakMap<AbortSignal, ResourceRecord>();
const activeSignalBySession = new Map<string, AbortSignal>();

let killHandle: KillHandle = (handle) => native.shellBgKill(handle);

export function beginRunResources(
  sessionId: string,
  signal: AbortSignal | undefined,
): void {
  if (!signal) return;
  const previous = activeSignalBySession.get(sessionId);
  if (previous && previous !== signal) {
    cleanupSignal(previous);
  }
  activeSignalBySession.set(sessionId, signal);
  ensureRecord(signal);
}

export function registerRunBackgroundHandle(
  sessionId: string,
  signal: AbortSignal | undefined,
  handle: number,
): void {
  if (!signal) return;
  const active = activeSignalBySession.get(sessionId);
  if (active && active !== signal) return;
  activeSignalBySession.set(sessionId, signal);
  const record = ensureRecord(signal);
  record.handles.add(handle);
  if (signal.aborted) {
    killHandles(record.handles);
    cleanupSignal(signal);
  }
}

export function releaseRunResources(
  sessionId: string,
  signal: AbortSignal | undefined,
): void {
  if (!signal) return;
  if (activeSignalBySession.get(sessionId) === signal) {
    activeSignalBySession.delete(sessionId);
  }
  cleanupSignal(signal);
}

export function killRunResourcesForSession(sessionId: string): void {
  const signal = activeSignalBySession.get(sessionId);
  if (!signal) return;
  const record = recordsBySignal.get(signal);
  if (record) killHandles(record.handles);
  activeSignalBySession.delete(sessionId);
  cleanupSignal(signal);
}

export function killRunResourcesForSignal(
  sessionId: string,
  signal: AbortSignal | undefined,
): void {
  if (!signal) return;
  const record = recordsBySignal.get(signal);
  if (record) killHandles(record.handles);
  releaseRunResources(sessionId, signal);
}

function ensureRecord(signal: AbortSignal): ResourceRecord {
  const existing = recordsBySignal.get(signal);
  if (existing) return existing;
  const record: ResourceRecord = {
    handles: new Set(),
    onAbort: () => {
      const current = recordsBySignal.get(signal);
      if (current) killHandles(current.handles);
      cleanupSignal(signal);
    },
  };
  recordsBySignal.set(signal, record);
  signal.addEventListener("abort", record.onAbort, { once: true });
  return record;
}

function cleanupSignal(signal: AbortSignal): void {
  const record = recordsBySignal.get(signal);
  if (!record) return;
  signal.removeEventListener("abort", record.onAbort);
  record.handles.clear();
  recordsBySignal.delete(signal);
}

function killHandles(handles: Iterable<number>): void {
  for (const handle of handles) {
    void Promise.resolve(killHandle(handle)).catch(() => {});
  }
}

export function configureRunResourceKillerForTests(killer: KillHandle): void {
  killHandle = killer;
}

export function resetRunResourcesForTests(): void {
  for (const signal of activeSignalBySession.values()) {
    cleanupSignal(signal);
  }
  activeSignalBySession.clear();
  killHandle = (handle) => native.shellBgKill(handle);
}
