import { LazyStore } from "@tauri-apps/plugin-store";
import { redactSensitive } from "../lib/redact";

export const SESSION_TRACE_STORE_PATH = "atlas-ai-session-traces.json";

const TRACE_INDEX_KEY = "index";
const MAX_TRACES = 100;
const MAX_EVENTS = 500;
const MAX_STRING = 1200;
const OMIT_KEYS = new Set([
  "content",
  "new_string",
  "old_string",
  "prompt",
  "text",
  "body",
  "data",
  "messages",
]);

type JsonRecord = Record<string, unknown>;

export type SessionTraceStatus =
  | "running"
  | "finished"
  | "cancelled"
  | "errored";

export type SessionTraceEvent = {
  at: number;
  type: string;
  payload?: unknown;
};

export type SessionTraceIndexEntry = {
  runId: string;
  sessionId: string;
  workspaceRoot: string | null;
  modelId: string;
  providerId: string;
  startedAt: number;
  updatedAt: number;
  status: SessionTraceStatus;
  promptPreview: string;
};

export type SessionTrace = SessionTraceIndexEntry & {
  lane: string;
  toolMode: string;
  planMode: boolean;
  reason: string;
  activeFile: string | null;
  promptBytes: number;
  durationMs?: number;
  events: SessionTraceEvent[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    toolCalls: number;
    steps: number;
  };
};

export type SessionTraceStart = {
  sessionId: string;
  workspaceRoot: string | null;
  modelId: string;
  providerId: string;
  prompt: string;
  lane: string;
  toolMode: string;
  planMode: boolean;
  reason: string;
  activeFile: string | null;
};

export type SessionTraceRef = {
  runId: string;
};

const store = new LazyStore(SESSION_TRACE_STORE_PATH, {
  defaults: {},
  autoSave: false,
});

let writeChain = Promise.resolve();

export async function startSessionTrace(
  input: SessionTraceStart,
): Promise<SessionTraceRef | null> {
  try {
    const runId = makeRunId();
    const now = Date.now();
    const trace: SessionTrace = {
      runId,
      sessionId: input.sessionId,
      workspaceRoot: input.workspaceRoot,
      modelId: input.modelId,
      providerId: input.providerId,
      startedAt: now,
      updatedAt: now,
      status: "running",
      promptPreview: boundString(input.prompt, 320),
      promptBytes: input.prompt.length,
      lane: input.lane,
      toolMode: input.toolMode,
      planMode: input.planMode,
      reason: input.reason,
      activeFile: input.activeFile,
      events: [
        {
          at: now,
          type: "run.started",
          payload: {
            sessionId: input.sessionId,
            workspaceRoot: input.workspaceRoot,
            modelId: input.modelId,
            providerId: input.providerId,
            lane: input.lane,
            toolMode: input.toolMode,
            planMode: input.planMode,
            reason: input.reason,
            activeFile: input.activeFile,
            promptPreview: boundString(input.prompt, 320),
            promptBytes: input.prompt.length,
          },
        },
      ],
      totals: {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        toolCalls: 0,
        steps: 0,
      },
    };
    await enqueue(async () => {
      await store.set(traceKey(runId), trace);
      await updateIndex(trace);
      await store.save();
    });
    return { runId };
  } catch {
    return null;
  }
}

export function recordSessionTraceEvent(
  ref: SessionTraceRef | null,
  type: string,
  payload?: unknown,
): void {
  if (!ref) return;
  void enqueue(async () => {
    const trace = await store.get<SessionTrace>(traceKey(ref.runId));
    if (!trace) return;
    const event = {
      at: Date.now(),
      type,
      payload: sanitizePayload(payload),
    };
    trace.events.push(event);
    if (trace.events.length > MAX_EVENTS) {
      trace.events = trace.events.slice(-MAX_EVENTS);
    }
    if (
      type === "agent.step" &&
      typeof event.payload === "object" &&
      event.payload &&
      typeof (event.payload as { step?: unknown }).step === "string"
    ) {
      trace.totals.steps += 1;
    }
    if (type === "tool.finished") trace.totals.toolCalls += 1;
    trace.updatedAt = event.at;
    await store.set(traceKey(ref.runId), trace);
    await updateIndex(trace);
    await store.save();
  });
}

export function recordSessionTraceUsage(
  ref: SessionTraceRef | null,
  delta: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  },
): void {
  if (!ref) return;
  void enqueue(async () => {
    const trace = await store.get<SessionTrace>(traceKey(ref.runId));
    if (!trace) return;
    const now = Date.now();
    trace.totals.inputTokens += delta.inputTokens;
    trace.totals.outputTokens += delta.outputTokens;
    trace.totals.cachedInputTokens += delta.cachedInputTokens;
    trace.events.push({
      at: now,
      type: "usage.delta",
      payload: sanitizePayload(delta),
    });
    if (trace.events.length > MAX_EVENTS) {
      trace.events = trace.events.slice(-MAX_EVENTS);
    }
    trace.updatedAt = now;
    await store.set(traceKey(ref.runId), trace);
    await updateIndex(trace);
    await store.save();
  });
}

export function finishSessionTrace(
  ref: SessionTraceRef | null,
  status: SessionTraceStatus,
  payload?: unknown,
): Promise<void> {
  if (!ref) return Promise.resolve();
  return enqueue(async () => {
    const trace = await store.get<SessionTrace>(traceKey(ref.runId));
    if (!trace) return;
    const now = Date.now();
    if (trace.status !== "running" && trace.status !== status) return;
    trace.status = status;
    trace.durationMs = now - trace.startedAt;
    trace.updatedAt = now;
    trace.events.push({
      at: now,
      type: `run.${status}`,
      payload: sanitizePayload(payload),
    });
    if (trace.events.length > MAX_EVENTS) {
      trace.events = trace.events.slice(-MAX_EVENTS);
    }
    await store.set(traceKey(ref.runId), trace);
    await updateIndex(trace);
    await store.save();
  }).then(() => undefined);
}

/**
 * A webview/process restart cannot resume an in-flight provider stream. Close
 * traces left in `running` so history never presents a ghost agent as active.
 */
export async function recoverInterruptedSessionTraces(): Promise<number> {
  const recovered = await enqueue(async () => {
    const index =
      (await store.get<SessionTraceIndexEntry[]>(TRACE_INDEX_KEY)) ?? [];
    const running = index.filter((entry) => entry.status === "running");
    if (running.length === 0) return 0;
    const now = Date.now();
    for (const entry of running) {
      const trace = await store.get<SessionTrace>(traceKey(entry.runId));
      if (!trace || trace.status !== "running") continue;
      trace.status = "cancelled";
      trace.durationMs = Math.max(0, now - trace.startedAt);
      trace.updatedAt = now;
      trace.events.push({
        at: now,
        type: "run.cancelled",
        payload: { reason: "app_restarted" },
      });
      if (trace.events.length > MAX_EVENTS) {
        trace.events = trace.events.slice(-MAX_EVENTS);
      }
      await store.set(traceKey(trace.runId), trace);
      await updateIndex(trace);
    }
    await store.save();
    return running.length;
  });
  return recovered ?? 0;
}

function enqueue<T>(op: () => Promise<T>): Promise<T | undefined> {
  const next = writeChain.then(op, op);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next.catch(() => undefined);
}

async function updateIndex(trace: SessionTrace): Promise<void> {
  const existing =
    (await store.get<SessionTraceIndexEntry[]>(TRACE_INDEX_KEY)) ?? [];
  const next = [
    toIndexEntry(trace),
    ...existing.filter((entry) => entry.runId !== trace.runId),
  ].slice(0, MAX_TRACES);
  await store.set(TRACE_INDEX_KEY, next);
  const keep = new Set(next.map((entry) => entry.runId));
  for (const entry of existing) {
    if (!keep.has(entry.runId)) {
      await store.delete(traceKey(entry.runId)).catch(() => false);
    }
  }
}

function toIndexEntry(trace: SessionTrace): SessionTraceIndexEntry {
  return {
    runId: trace.runId,
    sessionId: trace.sessionId,
    workspaceRoot: trace.workspaceRoot,
    modelId: trace.modelId,
    providerId: trace.providerId,
    startedAt: trace.startedAt,
    updatedAt: trace.updatedAt,
    status: trace.status,
    promptPreview: trace.promptPreview,
  };
}

function traceKey(runId: string): string {
  return `trace:${runId}`;
}

function makeRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `trace-${Date.now()}`;
}

function sanitizePayload(value: unknown): unknown {
  return sanitizeValue(value, 0);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value == null) return value;
  if (typeof value === "string") return boundString(value, MAX_STRING);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth > 4) return { omitted: true, reason: "max-depth" };
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value !== "object") return String(value);
  if (depth > 4) return { omitted: true, reason: "max-depth" };
  const record = value as JsonRecord;
  const out: JsonRecord = {};
  for (const [key, item] of Object.entries(record).slice(0, 80)) {
    const normalized = key.toLowerCase();
    if (OMIT_KEYS.has(normalized)) {
      out[key] = {
        omitted: true,
        bytes: typeof item === "string" ? item.length : undefined,
      };
      continue;
    }
    out[key] = sanitizeValue(item, depth + 1);
  }
  return out;
}

function boundString(value: string, max: number): string {
  const redacted = redactSensitive(value);
  if (redacted.length <= max) return redacted;
  return `${redacted.slice(0, max)}...[truncated ${redacted.length - max} chars]`;
}
