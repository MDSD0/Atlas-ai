export const SIMPLEMEM_DEFAULT_BASE_URL = "http://127.0.0.1:8766";
const SIMPLEMEM_HEALTH_TIMEOUT_MS = 750;

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

export function assertLoopbackHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("SimpleMem endpoint must use loopback HTTP");
  }
  return url;
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
    this.timeoutMs = options.timeoutMs ?? SIMPLEMEM_HEALTH_TIMEOUT_MS;
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
    const url = new URL("/health", this.endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      const latencyMs = Math.max(0, this.clock() - startedAt);
      if (!response.ok) {
        return {
          provider: "simplemem",
          status: "unavailable",
          optional: true,
          endpoint: url.toString(),
          latencyMs,
          detail: `health probe returned HTTP ${response.status}`,
        };
      }
      return {
        provider: "simplemem",
        status: "available",
        optional: true,
        endpoint: url.toString(),
        latencyMs,
        detail:
          "sidecar health probe passed; LocalRecords still remains the Atlas default",
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
    } finally {
      clearTimeout(timeout);
    }
  }
}
