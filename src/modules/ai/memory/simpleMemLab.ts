import type {
  SimpleMemAdapter,
  SimpleMemHealth,
  SimpleMemStats,
  SimpleMemStopResult,
} from "@/modules/ai/memory/simpleMem";

export type SimpleMemProbeReport = {
  provider: "simplemem";
  status: "unavailable" | "measured" | "degraded";
  marker: string;
  health: SimpleMemHealth;
  lifecycle: {
    started: boolean;
    messageRecorded: boolean;
    finalized: boolean;
    ended: boolean;
  };
  finalization: SimpleMemStopResult | null;
  retrieval: {
    observed: boolean;
    resultCount: number;
  };
  stats: SimpleMemStats | null;
  unsupportedGates: string[];
  recommendation: string;
};

export async function probeSimpleMem(
  adapter: SimpleMemAdapter,
  marker = `atlas-memorylab-${crypto.randomUUID()}`,
): Promise<SimpleMemProbeReport> {
  const health = await adapter.health();
  const base: Omit<SimpleMemProbeReport, "status" | "recommendation"> = {
    provider: "simplemem" as const,
    marker,
    health,
    lifecycle: {
      started: false,
      messageRecorded: false,
      finalized: false,
      ended: false,
    },
    finalization: null,
    retrieval: { observed: false, resultCount: 0 },
    stats: null,
    unsupportedGates: [
      "stale_fact_rejection requires a provider invalidation contract",
      "consolidation_false_merges requires a seeded multi-record benchmark",
    ],
  };
  if (health.status !== "available") {
    return {
      ...base,
      status: "unavailable",
      recommendation: "keep SimpleMem disabled until the local Cross sidecar is reachable",
    };
  }

  let memorySessionId: string | null = null;
  try {
    const started = await adapter.startSession({
      tenantId: marker,
      contentSessionId: marker,
      project: marker,
      userPrompt: `Remember the Atlas MemoryLab marker ${marker}`,
    });
    memorySessionId = started.memory_session_id;
    base.lifecycle.started = true;
    await adapter.recordMessage(
      memorySessionId,
      `The Atlas MemoryLab marker is ${marker}`,
    );
    base.lifecycle.messageRecorded = true;
    base.finalization = await adapter.stopSession(memorySessionId);
    base.lifecycle.finalized = true;
    await adapter.endSession(memorySessionId);
    base.lifecycle.ended = true;
    const search = await adapter.search({ query: marker, tenantId: marker, topK: 10 });
    base.retrieval = {
      observed: search.entries.some((entry) => entry.text.includes(marker)),
      resultCount: search.count,
    };
    base.stats = await adapter.stats();
    return {
      ...base,
      status: base.retrieval.observed ? "measured" : "degraded",
      recommendation: base.retrieval.observed
        ? "review unsupported gates before enabling SimpleMem context injection"
        : "keep SimpleMem context injection disabled; lifecycle passed but retrieval was not observed",
    };
  } catch (error) {
    if (memorySessionId && !base.lifecycle.ended) {
      await adapter.endSession(memorySessionId).catch(() => {});
    }
    return {
      ...base,
      status: "degraded",
      recommendation: `keep SimpleMem context injection disabled: ${String(error)}`,
    };
  }
}
