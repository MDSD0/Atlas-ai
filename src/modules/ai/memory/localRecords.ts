import {
  MEMORY_CONTENT_BYTES,
  MEMORY_PATH_BYTES,
  MEMORY_RECALL_ITEMS,
  MEMORY_RECALL_TOKEN_BUDGET,
  MEMORY_RECORDS_PER_PROJECT,
  MEMORY_REPO_TRUTH_RULE,
  MEMORY_TAGS_PER_RECORD,
  type AtlasMemoryProvider,
  type LocalMemoryStats,
  type MemoryRecord,
  type RecallMemoryInput,
  type RecallMemoryResult,
  type RememberMemoryInput,
} from "@/modules/ai/memory/contracts";
import type { MemoryPersistence } from "@/modules/ai/memory/persistence";
import { boundText } from "@/modules/ai/proof/contracts";
import { redactSensitive } from "@/modules/ai/lib/redact";

const projectKey = (projectId: string) => `project:${projectId}`;
const recordKey = (id: string) => `record:${id}`;
const WORD_RE = /[a-z0-9_./-]+/gi;

export type LocalRecordsOptions = {
  clock?: () => number;
  idFactory?: () => string;
  maxRecordsPerProject?: number;
};

function defaultId(): string {
  return `m-${crypto.randomUUID()}`;
}

function normalizeProjectId(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized) throw new Error("memory projectId cannot be empty");
  return normalized;
}

function normalizeText(text: string): string {
  const normalized = text.trim();
  if (!normalized) throw new Error("memory content cannot be empty");
  if (redactSensitive(normalized) !== normalized) {
    throw new Error("memory content refused: possible secret material");
  }
  return boundText(normalized, MEMORY_CONTENT_BYTES).preview;
}

function normalizeArtifacts(artifacts: readonly string[] = []): string[] {
  return [...new Set(artifacts.map((path) => boundText(path.trim(), MEMORY_PATH_BYTES).preview))]
    .filter(Boolean)
    .sort();
}

function normalizeTags(tags: readonly string[] = []): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()))]
    .filter(Boolean)
    .slice(0, MEMORY_TAGS_PER_RECORD);
}

function terms(text: string): Set<string> {
  return new Set((text.toLowerCase().match(WORD_RE) ?? []).filter(Boolean));
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function relevance(record: MemoryRecord, queryTerms: Set<string>): number {
  if (queryTerms.size === 0) return record.confidence;
  const haystack = terms(`${record.content} ${record.tags.join(" ")}`);
  let matches = 0;
  for (const term of queryTerms) {
    if (haystack.has(term)) matches += 1;
  }
  return matches * 10 + record.confidence;
}

export class LocalRecordsProvider implements AtlasMemoryProvider {
  readonly id = "local_records";
  private readonly clock: () => number;
  private readonly idFactory: () => string;
  private readonly maxRecordsPerProject: number;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly persistence: MemoryPersistence,
    options: LocalRecordsOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? defaultId;
    this.maxRecordsPerProject =
      options.maxRecordsPerProject ?? MEMORY_RECORDS_PER_PROJECT;
  }

  remember(input: RememberMemoryInput): Promise<MemoryRecord> {
    return this.mutate(async () => {
      const projectId = normalizeProjectId(input.projectId);
      const timestamp = this.clock();
      const record: MemoryRecord = {
        id: this.idFactory(),
        projectId,
        kind: input.kind,
        content: normalizeText(input.content),
        sourceRunId: input.sourceRunId ?? null,
        sourceArtifacts: normalizeArtifacts(input.sourceArtifacts),
        createdAt: timestamp,
        updatedAt: timestamp,
        confidence: Math.max(0, Math.min(1, input.confidence ?? 1)),
        status: "active",
        staleReason: null,
        tags: normalizeTags(input.tags),
      };
      const previous = (await this.persistence.get<string[]>(projectKey(projectId))) ?? [];
      const ids = [record.id, ...previous.filter((id) => id !== record.id)];
      const retained = ids.slice(0, this.maxRecordsPerProject);
      await this.persistence.set(recordKey(record.id), record);
      await this.persistence.set(projectKey(projectId), retained);
      for (const removed of ids.slice(this.maxRecordsPerProject)) {
        await this.persistence.delete(recordKey(removed));
      }
      await this.persistence.save();
      return record;
    });
  }

  async recall(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    const records = await this.list(input.projectId);
    const queryTerms = terms(input.query ?? "");
    const includeStale = input.includeStale ?? false;
    const staleExcluded = records.filter((record) => record.status === "stale").length;
    const ranked = records
      .filter((record) => record.status === "active" || (includeStale && record.status === "stale"))
      .map((record) => ({ record, score: relevance(record, queryTerms) }))
      .filter(({ score }) => queryTerms.size === 0 || score >= 10)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.record.updatedAt - a.record.updatedAt ||
          a.record.id.localeCompare(b.record.id),
      );
    const limit = Math.max(1, Math.min(input.limit ?? MEMORY_RECALL_ITEMS, 50));
    const tokenBudget = Math.max(
      1,
      Math.min(input.tokenBudget ?? MEMORY_RECALL_TOKEN_BUDGET, 10_000),
    );
    const selected: MemoryRecord[] = [];
    let tokenEstimate = 0;
    for (const { record } of ranked) {
      if (selected.length >= limit) break;
      const cost = estimateTokens(record.content);
      if (tokenEstimate + cost > tokenBudget) continue;
      selected.push(record);
      tokenEstimate += cost;
    }
    return {
      provider: "local_records",
      records: selected,
      tokenEstimate,
      staleExcluded,
      repoTruthRule: MEMORY_REPO_TRUTH_RULE,
    };
  }

  async list(projectId: string, includeDeleted = false): Promise<MemoryRecord[]> {
    await this.writes;
    return this.listUnlocked(projectId, includeDeleted);
  }

  private async listUnlocked(
    projectId: string,
    includeDeleted = false,
  ): Promise<MemoryRecord[]> {
    const normalized = normalizeProjectId(projectId);
    const ids = (await this.persistence.get<string[]>(projectKey(normalized))) ?? [];
    const records = await Promise.all(
      ids.map((id) => this.persistence.get<MemoryRecord>(recordKey(id))),
    );
    return records.filter(
      (record): record is MemoryRecord =>
        record !== undefined && (includeDeleted || record.status !== "deleted"),
    );
  }

  async get(projectId: string, id: string): Promise<MemoryRecord | null> {
    await this.writes;
    return this.getUnlocked(projectId, id);
  }

  private async getUnlocked(projectId: string, id: string): Promise<MemoryRecord | null> {
    const record = await this.persistence.get<MemoryRecord>(recordKey(id));
    return record?.projectId === normalizeProjectId(projectId) ? record : null;
  }

  delete(projectId: string, id: string): Promise<boolean> {
    return this.mutate(async () => {
      const record = await this.getUnlocked(projectId, id);
      if (!record || record.status === "deleted") return false;
      record.status = "deleted";
      record.updatedAt = this.clock();
      await this.persistence.set(recordKey(record.id), record);
      await this.persistence.save();
      return true;
    });
  }

  clearProject(projectId: string): Promise<number> {
    return this.mutate(async () => {
      const normalized = normalizeProjectId(projectId);
      const ids = (await this.persistence.get<string[]>(projectKey(normalized))) ?? [];
      for (const id of ids) await this.persistence.delete(recordKey(id));
      await this.persistence.delete(projectKey(normalized));
      await this.persistence.save();
      return ids.length;
    });
  }

  markStaleForArtifacts(
    projectId: string,
    artifacts: readonly string[],
    reason: string,
  ): Promise<MemoryRecord[]> {
    return this.mutate(async () => {
      const changed = new Set(normalizeArtifacts(artifacts));
      if (changed.size === 0) return [];
      const records = await this.listUnlocked(projectId);
      const stale: MemoryRecord[] = [];
      for (const record of records) {
        if (
          record.status !== "active" ||
          !record.sourceArtifacts.some((path) => changed.has(path))
        ) {
          continue;
        }
        record.status = "stale";
        record.staleReason = boundText(reason, MEMORY_CONTENT_BYTES).preview;
        record.updatedAt = this.clock();
        stale.push(record);
        await this.persistence.set(recordKey(record.id), record);
      }
      if (stale.length > 0) await this.persistence.save();
      return stale;
    });
  }

  async stats(projectId: string): Promise<LocalMemoryStats> {
    const records = await this.list(projectId, true);
    return {
      provider: "local_records",
      projectId: normalizeProjectId(projectId),
      total: records.length,
      active: records.filter((record) => record.status === "active").length,
      stale: records.filter((record) => record.status === "stale").length,
      superseded: records.filter((record) => record.status === "superseded").length,
      deleted: records.filter((record) => record.status === "deleted").length,
    };
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.then(operation, operation);
    this.writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
