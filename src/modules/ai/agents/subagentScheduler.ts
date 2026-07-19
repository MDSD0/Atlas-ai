const MAX_GLOBAL_SUBAGENTS = 4;
const MAX_SESSION_SUBAGENTS = 3;

type QueuedJob<T> = {
  sessionId: string;
  signal?: AbortSignal;
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  onStart?: () => void;
  onAbort: () => void;
};

const queue: QueuedJob<unknown>[] = [];
const activeBySession = new Map<string, number>();
let activeGlobal = 0;

function abortError(): DOMException {
  return new DOMException("Subagent cancelled", "AbortError");
}

function hasCapacity(sessionId: string): boolean {
  return (
    activeGlobal < MAX_GLOBAL_SUBAGENTS &&
    (activeBySession.get(sessionId) ?? 0) < MAX_SESSION_SUBAGENTS
  );
}

function startJob<T>(job: QueuedJob<T>): void {
  if (job.signal?.aborted) {
    job.reject(abortError());
    return;
  }
  activeGlobal += 1;
  activeBySession.set(
    job.sessionId,
    (activeBySession.get(job.sessionId) ?? 0) + 1,
  );
  job.signal?.removeEventListener("abort", job.onAbort);
  job.onStart?.();
  void job.run().then(job.resolve, job.reject).finally(() => {
    activeGlobal = Math.max(0, activeGlobal - 1);
    const next = Math.max(0, (activeBySession.get(job.sessionId) ?? 1) - 1);
    if (next === 0) activeBySession.delete(job.sessionId);
    else activeBySession.set(job.sessionId, next);
    drainQueue();
  });
}

function drainQueue(): void {
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let index = 0; index < queue.length; index += 1) {
      const job = queue[index];
      if (!hasCapacity(job.sessionId)) continue;
      queue.splice(index, 1);
      startJob(job);
      progressed = true;
      break;
    }
  }
}

export function scheduleSubagent<T>(input: {
  sessionId: string;
  signal?: AbortSignal;
  onStart?: () => void;
  run: () => Promise<T>;
}): Promise<T> {
  if (input.signal?.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const job: QueuedJob<T> = {
      ...input,
      resolve,
      reject,
      onAbort: () => {
        const index = queue.indexOf(job as QueuedJob<unknown>);
        if (index >= 0) queue.splice(index, 1);
        reject(abortError());
      },
    };
    if (hasCapacity(input.sessionId)) {
      startJob(job);
      return;
    }
    queue.push(job as QueuedJob<unknown>);
    input.signal?.addEventListener("abort", job.onAbort, { once: true });
  });
}

export function subagentSchedulerSnapshot(): {
  activeGlobal: number;
  queued: number;
  activeBySession: Record<string, number>;
} {
  return {
    activeGlobal,
    queued: queue.length,
    activeBySession: Object.fromEntries(activeBySession),
  };
}

export function resetSubagentSchedulerForTests(): void {
  for (const job of queue.splice(0)) {
    job.signal?.removeEventListener("abort", job.onAbort);
    job.reject(abortError());
  }
  activeBySession.clear();
  activeGlobal = 0;
}
