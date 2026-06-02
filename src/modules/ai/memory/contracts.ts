export const MEMORY_STORE_PATH = "atlas-ai-memory.json";
export const MEMORY_RECORDS_PER_PROJECT = 500;
export const MEMORY_CONTENT_BYTES = 2048;
export const MEMORY_PATH_BYTES = 4096;
export const MEMORY_TAGS_PER_RECORD = 12;
export const MEMORY_RECALL_TOKEN_BUDGET = 1200;
export const MEMORY_RECALL_ITEMS = 8;

export type MemoryRecordKind =
  | "fact"
  | "instruction"
  | "preference"
  | "decision"
  | "run_summary";

export type MemoryRecordStatus = "active" | "stale" | "superseded" | "deleted";

export type MemoryRecord = {
  id: string;
  projectId: string;
  kind: MemoryRecordKind;
  content: string;
  sourceRunId: string | null;
  sourceArtifacts: string[];
  createdAt: number;
  updatedAt: number;
  confidence: number;
  status: MemoryRecordStatus;
  staleReason: string | null;
  tags: string[];
};

export type RememberMemoryInput = {
  projectId: string;
  kind: MemoryRecordKind;
  content: string;
  sourceRunId?: string | null;
  sourceArtifacts?: readonly string[];
  confidence?: number;
  tags?: readonly string[];
};

export type RecallMemoryInput = {
  projectId: string;
  query?: string;
  includeStale?: boolean;
  limit?: number;
  tokenBudget?: number;
};

export type RecallMemoryResult = {
  provider: "local_records";
  records: MemoryRecord[];
  tokenEstimate: number;
  staleExcluded: number;
  repoTruthRule: string;
};

export type LocalMemoryStats = {
  provider: "local_records";
  projectId: string;
  total: number;
  active: number;
  stale: number;
  superseded: number;
  deleted: number;
};

export interface AtlasMemoryProvider {
  readonly id: string;
  remember(input: RememberMemoryInput): Promise<MemoryRecord>;
  recall(input: RecallMemoryInput): Promise<RecallMemoryResult>;
  list(projectId: string, includeDeleted?: boolean): Promise<MemoryRecord[]>;
  get(projectId: string, id: string): Promise<MemoryRecord | null>;
  delete(projectId: string, id: string): Promise<boolean>;
  clearProject(projectId: string): Promise<number>;
  markStaleForArtifacts(
    projectId: string,
    artifacts: readonly string[],
    reason: string,
  ): Promise<MemoryRecord[]>;
  stats(projectId: string): Promise<LocalMemoryStats>;
}

export const MEMORY_REPO_TRUTH_RULE =
  "Historical memory is advisory only. Inspect current repository evidence before answering code questions; current source files override recalled records.";
