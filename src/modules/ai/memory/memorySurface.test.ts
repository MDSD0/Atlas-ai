import { describe, expect, it } from "vitest";
import type { DirEntry, GrepResponse, ReadResult } from "@/modules/ai/lib/native";
import { boundText, type ProofRun } from "@/modules/ai/proof/contracts";
import type { WorkPacket } from "@/modules/ai/workPackets/contracts";
import {
  MEMORY_SURFACE_ENTRY_BYTES,
  MEMORY_SURFACE_SESSION_BYTES,
  MemorySurfaceRegistry,
  type MemorySurfaceIo,
  type MemorySurfacePersistence,
} from "@/modules/ai/memory/memorySurface";

class InMemoryPersistence implements MemorySurfacePersistence {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.values.get(key);
    return value === undefined ? undefined : structuredClone(value as T);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async save(): Promise<void> {}
}

class InMemoryIo implements MemorySurfaceIo {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();

  async readFile(path: string): Promise<ReadResult> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error("missing file");
    return { kind: "text", content, size: content.length };
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async createDir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async readDir(path: string): Promise<DirEntry[]> {
    if (!this.dirs.has(path)) throw new Error("missing directory");
    return [];
  }

  async grep(input: {
    pattern: string;
    root: string;
    maxResults?: number;
  }): Promise<GrepResponse> {
    const hits = [...this.files.entries()]
      .filter(([path, content]) => path.startsWith(input.root) && content.includes(input.pattern))
      .slice(0, input.maxResults ?? 20)
      .map(([path, content]) => ({
        path,
        rel: path.slice(input.root.length + 1),
        line: 1,
        text: content,
      }));
    return { hits, truncated: false, files_scanned: this.files.size, skipped_dirs: 0 };
  }
}

function proofRun(id = "run-1"): ProofRun {
  return {
    id,
    sessionId: "session-1",
    workspaceRoot: "/repo",
    startedAt: 1,
    finishedAt: 2,
    status: "verified",
    nextSequence: 1,
    events: [
      {
        id: `${id}:event:1`,
        runId: id,
        sequence: 1,
        kind: "shell.bash_run.ok",
        startedAt: 1,
        finishedAt: 2,
        summary: boundText("pnpm test API_KEY=super-secret-value", 256),
        boundedPayload: null,
      },
    ],
    eventsDropped: 0,
    artifacts: [],
    artifactsDropped: 0,
    verdict: {
      runId: id,
      status: "verified",
      changedFiles: {
        items: [boundText("/repo/src/main.ts", 4_096)],
        truncated: false,
        originalCount: 1,
      },
      diagnostics: { items: [], truncated: false, originalCount: 0 },
      checks: {
        items: [boundText("pnpm test (exit 0)", 2_048)],
        truncated: false,
        originalCount: 1,
      },
      unresolvedFailures: { items: [], truncated: false, originalCount: 0 },
    },
  };
}

function packet(): WorkPacket {
  return {
    id: "wp-1",
    projectId: "/repo",
    sessionId: "session-1",
    originalGoal: "Ship the filesystem surface.",
    acceptedInterpretation: "Keep memory advisory.",
    status: "active",
    filesChanged: [],
    decisionsMade: [],
    unresolvedBlockers: [],
    testsRun: [],
    failingTests: [],
    proofRunIds: ["run-1"],
    nextSuggestedAction: "Refresh repository evidence.",
    createdAt: 1,
    updatedAt: 2,
  };
}

function surface() {
  const io = new InMemoryIo();
  return {
    io,
    surface: new MemorySurfaceRegistry(
      new InMemoryPersistence(),
      io,
      () => 100,
    ),
  };
}

describe("MemorySurfaceRegistry", () => {
  it("requires explicit enable, initializes fixed paths, and preserves an existing index", async () => {
    const { io, surface: memory } = surface();
    await expect(memory.status("/repo/")).resolves.toMatchObject({
      enabled: false,
      indexPath: "/repo/.atlas/memory/MEMORY.md",
    });
    io.files.set("/repo/.atlas/memory/MEMORY.md", "# Existing\n");

    await expect(memory.enable("/repo")).resolves.toMatchObject({ enabled: true });
    expect(io.dirs).toEqual(
      new Set([
        "/repo/.atlas/memory",
        "/repo/.atlas/memory/topics",
        "/repo/.atlas/memory/sessions",
        "/repo/.atlas/memory/work-packets",
      ]),
    );
    await expect(memory.readIndex("/repo")).resolves.toBe("# Existing\n");
    await expect(memory.disable("/repo")).resolves.toMatchObject({ enabled: false });
    await expect(memory.readIndex("/repo")).resolves.toBeNull();
  });

  it("redacts index secrets and mirrors each proof run once after opt-in", async () => {
    const { io, surface: memory } = surface();
    await expect(memory.appendProofRun("/repo", proofRun())).resolves.toBe(false);
    await memory.enable("/repo");
    io.files.set(
      "/repo/.atlas/memory/MEMORY.md",
      "# Test\nAPI_KEY=super-secret-value\n",
    );

    await expect(memory.readIndex("/repo")).resolves.toContain("API_KEY=<REDACTED>");
    await expect(memory.appendProofRun("/repo", proofRun())).resolves.toBe(true);
    await expect(memory.appendProofRun("/repo", proofRun())).resolves.toBe(false);
    const jsonl = io.files.get("/repo/.atlas/memory/sessions/session-1.jsonl") ?? "";
    expect(jsonl).toContain('"type":"session"');
    expect(jsonl).toContain('"runId":"run-1"');
    expect(jsonl).toContain("API_KEY=<REDACTED>");
    expect(jsonl).not.toContain("super-secret-value");
  });

  it("keeps oversized proof summaries as bounded valid JSONL entries", async () => {
    const { io, surface: memory } = surface();
    await memory.enable("/repo");
    const oversized = proofRun("run-large");
    const longItems = Array.from({ length: 8 }, (_, index) =>
      boundText(`${index}-${"x".repeat(4_096)}`, 4_096),
    );
    oversized.verdict = {
      ...oversized.verdict!,
      changedFiles: { items: longItems, truncated: false, originalCount: 8 },
      checks: { items: longItems, truncated: false, originalCount: 8 },
      unresolvedFailures: {
        items: longItems,
        truncated: false,
        originalCount: 8,
      },
    };
    oversized.events = Array.from({ length: 20 }, (_, index) => ({
      id: `run-large:event:${index}`,
      runId: "run-large",
      sequence: index,
      kind: "shell.bash_run.ok",
      startedAt: 1,
      finishedAt: 2,
      summary: boundText("y".repeat(1_024), 1_024),
      boundedPayload: null,
    }));

    await expect(memory.appendProofRun("/repo", oversized)).resolves.toBe(true);
    const jsonl =
      io.files.get("/repo/.atlas/memory/sessions/session-1.jsonl") ?? "";
    const entry = jsonl.trimEnd().split("\n")[1];
    expect(new TextEncoder().encode(entry).byteLength).toBeLessThanOrEqual(
      MEMORY_SURFACE_ENTRY_BYTES,
    );
    expect(JSON.parse(entry)).toMatchObject({ evidenceTruncated: true });
  });

  it("caps grep-only JSONL history and exports project-owned packet Markdown", async () => {
    const { io, surface: memory } = surface();
    await memory.enable("/repo");
    for (let index = 0; index < 700; index++) {
      await memory.appendProofRun("/repo", proofRun(`run-${index}`));
    }
    const path = "/repo/.atlas/memory/sessions/session-1.jsonl";
    expect(new TextEncoder().encode(io.files.get(path) ?? "").byteLength).toBeLessThanOrEqual(
      MEMORY_SURFACE_SESSION_BYTES,
    );
    await expect(memory.searchSessions("/repo", "pnpm test")).resolves.toMatchObject({
      hits: [{ path }],
    });
    await expect(memory.exportWorkPacket("/repo", packet())).resolves.toBe(
      "/repo/.atlas/memory/work-packets/wp-1.md",
    );
    expect(io.files.get("/repo/.atlas/memory/work-packets/wp-1.md")).toContain(
      "# Atlas Work Packet: wp-1",
    );
    await expect(
      memory.exportWorkPacket("/elsewhere", packet()),
    ).rejects.toThrow("disabled");
  });
});
