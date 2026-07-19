import { MEMORY_REPO_TRUTH_RULE } from "@/modules/ai/memory/contracts";
import { LocalRecordsProvider } from "@/modules/ai/memory/localRecords";
import { TauriMemoryPersistence } from "@/modules/ai/memory/persistence";
import { isMemoryEnabled } from "@/modules/ai/memory/enabled";

export * from "@/modules/ai/memory/contracts";
export * from "@/modules/ai/memory/enabled";
export * from "@/modules/ai/memory/localRecords";
export * from "@/modules/ai/memory/memoryLab";
export * from "@/modules/ai/memory/memorySurface";
export * from "@/modules/ai/memory/persistence";
export * from "@/modules/ai/memory/simpleMem";
export * from "@/modules/ai/memory/simpleMemConfig";
export * from "@/modules/ai/memory/simpleMemLab";
export * from "@/modules/ai/memory/simpleMemObserver";

export const localRecords = new LocalRecordsProvider(
  new TauriMemoryPersistence(),
);

export type MemoryInvalidation = {
  provider: "local_records";
  status: "ok" | "unavailable";
  staleRecordIds: string[];
  detail: string;
};

export async function invalidateMemoryForPaths(
  projectId: string,
  paths: readonly string[],
): Promise<MemoryInvalidation> {
  try {
    const stale = await localRecords.markStaleForArtifacts(
      projectId,
      paths,
      "linked source artifact changed",
    );
    return {
      provider: "local_records",
      status: "ok",
      staleRecordIds: stale.map((record) => record.id),
      detail: `${stale.length} linked memory record(s) marked stale`,
    };
  } catch (error) {
    return {
      provider: "local_records",
      status: "unavailable",
      staleRecordIds: [],
      detail: String(error),
    };
  }
}

export async function buildLocalMemoryContext(
  projectId: string | null,
  query: string,
): Promise<string | null> {
  if (!projectId) return null;
  try {
    if (!(await isMemoryEnabled())) return null;
    const result = await localRecords.recall({ projectId, query });
    if (result.records.length === 0) return null;
    return [
      '<atlas_memory provider="local_records">',
      MEMORY_REPO_TRUTH_RULE,
      ...result.records.map(
        (record) =>
          `- [${record.kind}] ${record.content} (id=${record.id}, confidence=${record.confidence.toFixed(2)})`,
      ),
      "</atlas_memory>",
    ].join("\n");
  } catch {
    return null;
  }
}

const PINNED_MEMORY_LIMIT = 5;

/**
 * Memory kernel: a tiny, always-on snapshot of the highest-confidence project
 * facts. Unlike `buildLocalMemoryContext` (query-based recall that the harness
 * used to inject every turn), this is bounded and query-free — the small
 * "frozen" memory layer. Deeper or query-specific retrieval is on-demand and
 * cited via the memory_recall tool (which federates keyword, session, and
 * semantic sources), not injected.
 */
export async function buildPinnedMemoryContext(
  projectId: string | null,
  limit = PINNED_MEMORY_LIMIT,
  provider: Pick<LocalRecordsProvider, "list"> = localRecords,
): Promise<string | null> {
  if (!projectId) return null;
  try {
    if (provider === localRecords && !(await isMemoryEnabled())) return null;
    const records = await provider.list(projectId);
    const pinned = records
      .filter((record) => record.status === "active")
      .sort(
        (a, b) =>
          b.confidence - a.confidence ||
          b.updatedAt - a.updatedAt ||
          a.id.localeCompare(b.id),
      )
      .slice(0, Math.max(1, limit));
    if (pinned.length === 0) return null;
    return [
      '<atlas_memory provider="local_records" scope="pinned">',
      MEMORY_REPO_TRUTH_RULE,
      "Advisory only. For more, call memory_recall (searches records, sessions, and semantic memory in one call).",
      ...pinned.map(
        (record) =>
          `- [${record.kind}] ${record.content} (id=${record.id}, confidence=${record.confidence.toFixed(2)})`,
      ),
      "</atlas_memory>",
    ].join("\n");
  } catch {
    return null;
  }
}
