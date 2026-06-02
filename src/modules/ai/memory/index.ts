import { MEMORY_REPO_TRUTH_RULE } from "@/modules/ai/memory/contracts";
import { LocalRecordsProvider } from "@/modules/ai/memory/localRecords";
import { TauriMemoryPersistence } from "@/modules/ai/memory/persistence";

export * from "@/modules/ai/memory/contracts";
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
