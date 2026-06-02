import { LazyStore } from "@tauri-apps/plugin-store";
import { agentNative, type DirEntry, type GrepResponse, type ReadResult } from "@/modules/ai/lib/native";
import { redactSensitive } from "@/modules/ai/lib/redact";
import { boundText } from "@/modules/ai/proof/contracts";
import type { ProofRun } from "@/modules/ai/proof/contracts";
import { renderWorkPacketMarkdown } from "@/modules/ai/workPackets/compiler";
import type { WorkPacket } from "@/modules/ai/workPackets/contracts";

export const MEMORY_SURFACE_STORE_PATH = "atlas-ai-memory-surface.json";
export const MEMORY_SURFACE_ROOT = ".atlas/memory";
export const MEMORY_SURFACE_INDEX_BYTES = 16 * 1024;
export const MEMORY_SURFACE_SESSION_BYTES = 256 * 1024;
export const MEMORY_SURFACE_ENTRY_BYTES = 8 * 1024;

const DEFAULT_INDEX = `# Atlas Project Memory

This is the small user-editable project-memory index loaded by Atlas.
Keep durable details in \`topics/\`, multi-session handoffs in \`work-packets/\`,
and searchable proof-run summaries in \`sessions/\`.

## Resume Rule

- Memory is advisory. Refresh current repository evidence before editing.
`;

type MemorySurfaceConfig = {
  projectId: string;
  enabled: boolean;
  initializedAt: number;
  updatedAt: number;
};

export type MemorySurfaceStatus = {
  provider: "filesystem";
  projectId: string;
  enabled: boolean;
  memoryRoot: string;
  indexPath: string;
  topicsPath: string;
  sessionsPath: string;
  workPacketsPath: string;
  initializedAt: number | null;
  updatedAt: number | null;
};

export interface MemorySurfacePersistence {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export interface MemorySurfaceIo {
  readFile(path: string, projectRoot: string): Promise<ReadResult>;
  writeFile(path: string, content: string, projectRoot: string): Promise<void>;
  createDir(path: string, projectRoot: string): Promise<void>;
  readDir(path: string, projectRoot: string): Promise<DirEntry[]>;
  grep(
    input: {
      pattern: string;
      root: string;
      glob?: string[];
      maxResults?: number;
    },
    projectRoot: string,
  ): Promise<GrepResponse>;
}

class TauriMemorySurfacePersistence implements MemorySurfacePersistence {
  private readonly store = new LazyStore(MEMORY_SURFACE_STORE_PATH, {
    defaults: {},
    autoSave: false,
  });

  get<T>(key: string): Promise<T | undefined> {
    return this.store.get<T>(key);
  }

  set(key: string, value: unknown): Promise<void> {
    return this.store.set(key, value);
  }

  save(): Promise<void> {
    return this.store.save();
  }
}

const defaultIo: MemorySurfaceIo = {
  readFile: agentNative.readFile,
  writeFile: agentNative.writeFile,
  createDir: agentNative.createDir,
  readDir: agentNative.readDir,
  grep: agentNative.grep,
};

const configKey = (projectId: string) => `surface:${projectId}`;

function normalizeProjectId(projectId: string): string {
  const normalized = projectId.trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("memory surface projectId cannot be empty");
  return normalized;
}

function join(root: string, relative: string): string {
  return `${root}/${relative}`;
}

function filename(id: string): string {
  const normalized = id.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error("memory surface id contains unsupported filename characters");
  }
  return normalized;
}

function safeText(text: string, maxBytes = 512): string {
  return boundText(redactSensitive(text), maxBytes).preview;
}

function safeList(
  values: readonly string[],
  maxItems = 8,
  maxBytes = 512,
): string[] {
  return [
    ...new Set(values.map((value) => safeText(value, maxBytes)).filter(Boolean)),
  ].slice(0, maxItems);
}

function paths(projectId: string) {
  const memoryRoot = join(projectId, MEMORY_SURFACE_ROOT);
  return {
    memoryRoot,
    indexPath: join(memoryRoot, "MEMORY.md"),
    topicsPath: join(memoryRoot, "topics"),
    sessionsPath: join(memoryRoot, "sessions"),
    workPacketsPath: join(memoryRoot, "work-packets"),
  };
}

function textResult(result: ReadResult, path: string): string {
  if (result.kind === "text") return result.content;
  throw new Error(`memory surface expected a readable text file: ${path}`);
}

function proofRunEntry(run: ProofRun): string {
  const base = {
    type: "proof_run",
    version: 1,
    runId: filename(run.id),
    sessionId: filename(run.sessionId),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    status: run.status,
    changedFiles: safeList(
      run.verdict?.changedFiles.items.map((item) => item.preview) ?? [],
    ),
    checks: safeList(run.verdict?.checks.items.map((item) => item.preview) ?? []),
    failures: safeList(
      run.verdict?.unresolvedFailures.items.map((item) => item.preview) ?? [],
    ),
    events: run.events.slice(-20).map((event) => ({
      kind: safeText(event.kind, 128),
      summary: safeText(event.summary.preview, 256),
    })),
  };
  const full = JSON.stringify(base);
  if (new TextEncoder().encode(full).byteLength <= MEMORY_SURFACE_ENTRY_BYTES) {
    return full;
  }
  const compact = JSON.stringify({
    ...base,
    changedFiles: safeList(base.changedFiles, 4, 256),
    checks: safeList(base.checks, 4, 256),
    failures: safeList(base.failures, 4, 256),
    events: [],
    eventsTruncated: base.events.length > 0,
    evidenceTruncated: true,
  });
  if (
    new TextEncoder().encode(compact).byteLength <= MEMORY_SURFACE_ENTRY_BYTES
  ) {
    return compact;
  }
  return JSON.stringify({
    type: base.type,
    version: base.version,
    runId: base.runId,
    sessionId: base.sessionId,
    startedAt: base.startedAt,
    finishedAt: base.finishedAt,
    status: base.status,
    changedFiles: [],
    checks: [],
    failures: [],
    events: [],
    evidenceTruncated: true,
  });
}

function capJsonl(content: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(content).byteLength <= MEMORY_SURFACE_SESSION_BYTES) {
    return content;
  }
  const lines = content.trimEnd().split("\n");
  const header = lines[0];
  const kept: string[] = [];
  let used = encoder.encode(`${header}\n`).byteLength;
  for (let index = lines.length - 1; index >= 1; index--) {
    const line = `${lines[index]}\n`;
    const bytes = encoder.encode(line).byteLength;
    if (used + bytes > MEMORY_SURFACE_SESSION_BYTES) break;
    kept.unshift(lines[index]);
    used += bytes;
  }
  return `${[header, ...kept].join("\n")}\n`;
}

export class MemorySurfaceRegistry {
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly persistence: MemorySurfacePersistence,
    private readonly io: MemorySurfaceIo,
    private readonly clock: () => number = Date.now,
  ) {}

  async status(projectId: string): Promise<MemorySurfaceStatus> {
    const root = normalizeProjectId(projectId);
    const config = await this.persistence.get<MemorySurfaceConfig>(configKey(root));
    return {
      provider: "filesystem",
      projectId: root,
      enabled: config?.enabled ?? false,
      ...paths(root),
      initializedAt: config?.initializedAt ?? null,
      updatedAt: config?.updatedAt ?? null,
    };
  }

  enable(projectId: string): Promise<MemorySurfaceStatus> {
    return this.mutate(async () => {
      const root = normalizeProjectId(projectId);
      const now = this.clock();
      const existing =
        await this.persistence.get<MemorySurfaceConfig>(configKey(root));
      const surfacePaths = paths(root);
      await this.ensureDir(surfacePaths.memoryRoot, root);
      await this.ensureDir(surfacePaths.topicsPath, root);
      await this.ensureDir(surfacePaths.sessionsPath, root);
      await this.ensureDir(surfacePaths.workPacketsPath, root);
      await this.ensureIndex(surfacePaths.indexPath, root);
      await this.persistence.set(configKey(root), {
        projectId: root,
        enabled: true,
        initializedAt: existing?.initializedAt ?? now,
        updatedAt: now,
      } satisfies MemorySurfaceConfig);
      await this.persistence.save();
      return this.status(root);
    });
  }

  disable(projectId: string): Promise<MemorySurfaceStatus> {
    return this.mutate(async () => {
      const root = normalizeProjectId(projectId);
      const now = this.clock();
      const existing =
        await this.persistence.get<MemorySurfaceConfig>(configKey(root));
      await this.persistence.set(configKey(root), {
        projectId: root,
        enabled: false,
        initializedAt: existing?.initializedAt ?? now,
        updatedAt: now,
      } satisfies MemorySurfaceConfig);
      await this.persistence.save();
      return this.status(root);
    });
  }

  async readIndex(projectId: string): Promise<string | null> {
    const status = await this.status(projectId);
    if (!status.enabled) return null;
    const result = await this.io.readFile(status.indexPath, status.projectId);
    return boundText(
      redactSensitive(textResult(result, status.indexPath)),
      MEMORY_SURFACE_INDEX_BYTES,
    ).preview;
  }

  async searchSessions(
    projectId: string,
    query: string,
    maxResults = 20,
  ): Promise<GrepResponse> {
    const status = await this.status(projectId);
    if (!status.enabled) throw new Error("memory filesystem surface is disabled");
    return this.io.grep(
      {
        pattern: query,
        root: status.sessionsPath,
        glob: ["*.jsonl"],
        maxResults: Math.max(1, Math.min(maxResults, 100)),
      },
      status.projectId,
    );
  }

  appendProofRun(projectId: string, run: ProofRun): Promise<boolean> {
    return this.mutate(async () => {
      const status = await this.status(projectId);
      if (!status.enabled || run.workspaceRoot !== status.projectId) return false;
      const sessionId = filename(run.sessionId);
      const path = join(status.sessionsPath, `${sessionId}.jsonl`);
      let previous = "";
      let existing: ReadResult | null = null;
      try {
        existing = await this.io.readFile(path, status.projectId);
      } catch {
        existing = null;
      }
      if (existing) previous = textResult(existing, path);
      if (previous.includes(`"runId":"${filename(run.id)}"`)) return false;
      const header =
        previous ||
        `${JSON.stringify({
          type: "session",
          version: 1,
          sessionId,
          projectId: status.projectId,
          createdAt: run.startedAt,
        })}\n`;
      await this.io.writeFile(
        path,
        capJsonl(`${header}${proofRunEntry(run)}\n`),
        status.projectId,
      );
      return true;
    });
  }

  exportWorkPacket(projectId: string, packet: WorkPacket): Promise<string> {
    return this.mutate(async () => {
      const status = await this.status(projectId);
      if (!status.enabled) throw new Error("memory filesystem surface is disabled");
      if (packet.projectId !== status.projectId) {
        throw new Error("work packet belongs to a different project");
      }
      const path = join(status.workPacketsPath, `${filename(packet.id)}.md`);
      await this.io.writeFile(
        path,
        renderWorkPacketMarkdown(packet),
        status.projectId,
      );
      return path;
    });
  }

  private async ensureDir(path: string, projectId: string): Promise<void> {
    try {
      await this.io.readDir(path, projectId);
    } catch {
      await this.io.createDir(path, projectId);
    }
  }

  private async ensureIndex(path: string, projectId: string): Promise<void> {
    let existing: ReadResult | null = null;
    try {
      existing = await this.io.readFile(path, projectId);
    } catch {
      existing = null;
    }
    if (existing) {
      textResult(existing, path);
      return;
    }
    await this.io.writeFile(path, DEFAULT_INDEX, projectId);
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

export const memorySurface = new MemorySurfaceRegistry(
  new TauriMemorySurfacePersistence(),
  defaultIo,
);

export async function buildMemorySurfaceContext(
  projectId: string | null,
): Promise<string | null> {
  if (!projectId) return null;
  try {
    const index = await memorySurface.readIndex(projectId);
    return index
      ? `<atlas_memory_index path="${MEMORY_SURFACE_ROOT}/MEMORY.md">\n${index}\n</atlas_memory_index>`
      : null;
  } catch {
    return null;
  }
}

export async function mirrorProofRunToMemorySurface(
  projectId: string | null,
  run: ProofRun | null,
): Promise<void> {
  if (!projectId || !run) return;
  await memorySurface.appendProofRun(projectId, run);
}
