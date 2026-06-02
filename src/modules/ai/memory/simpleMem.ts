import { redactSensitive } from "@/modules/ai/lib/redact";
import { boundText } from "@/modules/ai/proof/contracts";

export const SIMPLEMEM_DEFAULT_BASE_URL = "http://127.0.0.1:8766";
const SIMPLEMEM_DEFAULT_TIMEOUT_MS = 1_500;
const SIMPLEMEM_TEXT_BYTES = 8 * 1024;
const SIMPLEMEM_RESPONSE_BYTES = 64 * 1024;

export type SimpleMemHealth =
  | {
      provider: "simplemem";
      status: "disabled";
      optional: true;
      detail: string;
    }
  | {
      provider: "simplemem";
      status: "available" | "unavailable";
      optional: true;
      endpoint: string;
      latencyMs: number;
      detail: string;
    };

export type SimpleMemAdapterOptions = {
  enabled?: boolean;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  clock?: () => number;
};

export type SimpleMemStartInput = {
  tenantId: string;
  contentSessionId: string;
  project: string;
  userPrompt?: string;
};

export type SimpleMemStartResult = {
  memory_session_id: string;
  context: string;
  context_tokens: number;
};

export type SimpleMemStopResult = {
  memory_session_id: string;
  observations_count: number;
  summary_generated: boolean;
  entries_stored: number;
};

export type SimpleMemSearchInput = {
  query: string;
  topK?: number;
  tenantId?: string;
};

export type SimpleMemSearchEntry = {
  text: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type SimpleMemSearchResult = {
  entries: SimpleMemSearchEntry[];
  count: number;
};

export type SimpleMemStats = {
  sessions: number;
  events: number;
  observations: number;
  summaries: number;
};

export function assertLoopbackHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("SimpleMem endpoint must use credential-free loopback HTTP");
  }
  return url;
}

function boundedSafeText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`SimpleMem ${label} cannot be empty`);
  if (redactSensitive(normalized) !== normalized) {
    throw new Error(`SimpleMem ${label} refused: possible secret material`);
  }
  return boundText(normalized, SIMPLEMEM_TEXT_BYTES).preview;
}

function serializeSafe(value: unknown, label: string): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    throw new Error(`SimpleMem ${label} must be serializable`);
  }
  return boundedSafeText(text ?? "", label);
}

function boundedCount(value: number | undefined): number {
  return Math.max(1, Math.min(value ?? 10, 100));
}

export class SimpleMemAdapter {
  readonly id = "simplemem";
  private readonly enabled: boolean;
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly clock: () => number;

  constructor(options: SimpleMemAdapterOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.endpoint = assertLoopbackHttpUrl(
      options.baseUrl ?? SIMPLEMEM_DEFAULT_BASE_URL,
    );
    this.timeoutMs = options.timeoutMs ?? SIMPLEMEM_DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.clock = options.clock ?? Date.now;
  }

  async health(): Promise<SimpleMemHealth> {
    if (!this.enabled) {
      return {
        provider: "simplemem",
        status: "disabled",
        optional: true,
        detail: "optional sidecar is disabled; LocalRecords remains active",
      };
    }
    const startedAt = this.clock();
    const url = this.crossUrl("/health");
    try {
      await this.request<Record<string, unknown>>("/health", { method: "GET" });
      return {
        provider: "simplemem",
        status: "available",
        optional: true,
        endpoint: url.toString(),
        latencyMs: Math.max(0, this.clock() - startedAt),
        detail:
          "SimpleMem Cross sidecar is reachable; LocalRecords remains the Atlas default",
      };
    } catch (error) {
      return {
        provider: "simplemem",
        status: "unavailable",
        optional: true,
        endpoint: url.toString(),
        latencyMs: Math.max(0, this.clock() - startedAt),
        detail: String(error),
      };
    }
  }

  startSession(input: SimpleMemStartInput): Promise<SimpleMemStartResult> {
    return this.request("/sessions/start", {
      method: "POST",
      body: {
        tenant_id: boundedSafeText(input.tenantId, "tenant id"),
        content_session_id: boundedSafeText(
          input.contentSessionId,
          "content session id",
        ),
        project: boundedSafeText(input.project, "project"),
        user_prompt: input.userPrompt
          ? boundedSafeText(input.userPrompt, "user prompt")
          : undefined,
      },
    });
  }

  recordMessage(
    memorySessionId: string,
    content: string,
    role: "user" | "assistant" | "system" = "user",
  ): Promise<{ event_id: number }> {
    const id = boundedSafeText(memorySessionId, "memory session id");
    return this.request(`/sessions/${encodeURIComponent(id)}/message`, {
      method: "POST",
      body: {
        memory_session_id: id,
        content: boundedSafeText(content, "message"),
        role,
      },
    });
  }

  recordToolUse(
    memorySessionId: string,
    toolName: string,
    toolInput: unknown,
    toolOutput: unknown,
  ): Promise<{ event_id: number }> {
    const id = boundedSafeText(memorySessionId, "memory session id");
    return this.request(`/sessions/${encodeURIComponent(id)}/tool-use`, {
      method: "POST",
      body: {
        memory_session_id: id,
        tool_name: boundedSafeText(toolName, "tool name"),
        tool_input: serializeSafe(toolInput, "tool input"),
        tool_output: serializeSafe(toolOutput, "tool output"),
      },
    });
  }

  stopSession(memorySessionId: string): Promise<SimpleMemStopResult> {
    const id = boundedSafeText(memorySessionId, "memory session id");
    return this.request(`/sessions/${encodeURIComponent(id)}/stop`, {
      method: "POST",
    });
  }

  endSession(
    memorySessionId: string,
  ): Promise<{ memory_session_id: string; status: string }> {
    const id = boundedSafeText(memorySessionId, "memory session id");
    return this.request(`/sessions/${encodeURIComponent(id)}/end`, {
      method: "POST",
    });
  }

  search(input: SimpleMemSearchInput): Promise<SimpleMemSearchResult> {
    return this.request("/search", {
      method: "POST",
      body: {
        query: boundedSafeText(input.query, "search query"),
        top_k: boundedCount(input.topK),
        tenant_id: input.tenantId
          ? boundedSafeText(input.tenantId, "tenant id")
          : undefined,
      },
    });
  }

  stats(): Promise<SimpleMemStats> {
    return this.request("/stats", { method: "GET" });
  }

  private crossUrl(path: string): URL {
    return new URL(`/cross${path}`, this.endpoint);
  }

  private async request<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: Record<string, unknown> },
  ): Promise<T> {
    if (!this.enabled) throw new Error("SimpleMem sidecar is disabled");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.crossUrl(path), {
        method: init.method,
        body: init.body ? JSON.stringify(init.body) : undefined,
        headers: init.body ? { "Content-Type": "application/json" } : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `SimpleMem Cross ${path} returned HTTP ${response.status}: ${boundText(text, 256).preview}`,
        );
      }
      if (new TextEncoder().encode(text).byteLength > SIMPLEMEM_RESPONSE_BYTES) {
        throw new Error(`SimpleMem Cross ${path} response exceeded byte limit`);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`SimpleMem Cross ${path} returned invalid JSON`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
