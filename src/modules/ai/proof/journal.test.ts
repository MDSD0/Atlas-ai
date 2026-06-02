import { describe, expect, it } from "vitest";
import { hashProofContent } from "@/modules/ai/proof/contracts";
import { ProofJournal } from "@/modules/ai/proof/journal";
import type { ProofPersistence } from "@/modules/ai/proof/persistence";

class MemoryPersistence implements ProofPersistence {
  private readonly values = new Map<string, unknown>();
  saves = 0;

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.values.get(key);
    return value === undefined ? undefined : structuredClone(value as T);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async save(): Promise<void> {
    this.saves += 1;
  }
}

function journal(
  persistence = new MemoryPersistence(),
  options: ConstructorParameters<typeof ProofJournal>[1] = {},
) {
  let nextId = 0;
  let now = 1_000;
  return {
    persistence,
    journal: new ProofJournal(persistence, {
      idFactory: () => `run-${++nextId}`,
      clock: () => ++now,
      ...options,
    }),
  };
}

describe("ProofJournal", () => {
  it("serializes concurrent event appends into sequence order", async () => {
    const { journal: proof } = journal();
    const run = await proof.startRun({
      sessionId: "session-1",
      workspaceRoot: "/repo",
    });

    await Promise.all([
      proof.appendEvent(run.id, { kind: "read", summary: "first" }),
      proof.appendEvent(run.id, { kind: "edit", summary: "second" }),
    ]);

    const restored = await proof.getRun(run.id);
    expect(restored?.events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(restored?.events.map((event) => event.id)).toEqual([
      "run-1:event:1",
      "run-1:event:2",
    ]);
  });

  it("bounds UTF-8 payload previews without splitting characters", async () => {
    const { journal: proof } = journal(undefined, { payloadBytes: 5 });
    const run = await proof.startRun({
      sessionId: "session-1",
      workspaceRoot: "/repo",
    });

    await proof.appendEvent(run.id, {
      kind: "output",
      summary: "bounded",
      payload: "ééé",
    });

    const restored = await proof.getRun(run.id);
    expect(restored?.events[0].boundedPayload).toEqual({
      preview: "éé",
      truncated: true,
      originalBytes: 6,
    });
  });

  it("restores persisted runs after repository restart", async () => {
    const persistence = new MemoryPersistence();
    const first = journal(persistence).journal;
    const run = await first.startRun({
      sessionId: "session-1",
      workspaceRoot: "/repo",
    });
    await first.appendEvent(run.id, { kind: "read", summary: "README" });

    const second = journal(persistence).journal;
    const restored = await second.restore();

    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(run.id);
    expect(restored[0].events[0].summary.preview).toBe("README");
    expect(persistence.saves).toBe(2);
  });

  it("stores a cancelled verdict with bounded failure lists", async () => {
    const { journal: proof } = journal(undefined, { maxListItems: 1 });
    const run = await proof.startRun({
      sessionId: "session-1",
      workspaceRoot: "/repo",
    });

    const verdict = await proof.finishRun(run.id, {
      status: "cancelled",
      unresolvedFailures: ["approval denied", "test not run"],
    });
    const restored = await proof.getRun(run.id);

    expect(verdict.unresolvedFailures).toEqual({
      items: [
        {
          preview: "approval denied",
          truncated: false,
          originalBytes: 15,
        },
      ],
      truncated: true,
      originalCount: 2,
    });
    expect(restored?.status).toBe("cancelled");
    expect(restored?.finishedAt).not.toBeNull();
  });

  it("uses stable artifact ids and updates the existing artifact", async () => {
    const { journal: proof } = journal();
    const run = await proof.startRun({
      sessionId: "session-1",
      workspaceRoot: "/repo",
    });

    const first = await proof.upsertArtifact(run.id, {
      kind: "file",
      pathOrCommand: "/repo/src/main.ts",
      contentHash: await hashProofContent("before"),
      preview: "before",
    });
    const second = await proof.upsertArtifact(run.id, {
      kind: "file",
      pathOrCommand: "/repo/src/main.ts",
      contentHash: await hashProofContent("after"),
      preview: "after",
    });
    const restored = await proof.getRun(run.id);

    expect(second.id).toBe(first.id);
    expect(restored?.artifacts).toHaveLength(1);
    expect(restored?.artifacts[0].boundedPreview?.preview).toBe("after");
  });

  it("retains bounded runs, events, and artifacts", async () => {
    const { journal: proof } = journal(undefined, {
      maxRuns: 1,
      maxEventsPerRun: 1,
      maxArtifactsPerRun: 1,
    });
    const first = await proof.startRun({
      sessionId: "session-1",
      workspaceRoot: "/repo",
    });
    await proof.appendEvent(first.id, { kind: "read", summary: "old" });
    await proof.appendEvent(first.id, { kind: "edit", summary: "new" });
    await proof.upsertArtifact(first.id, {
      kind: "file",
      pathOrCommand: "/repo/old.ts",
      contentHash: "old",
    });
    await proof.upsertArtifact(first.id, {
      kind: "file",
      pathOrCommand: "/repo/new.ts",
      contentHash: "new",
    });
    const retainedFirst = await proof.getRun(first.id);

    expect(retainedFirst?.events.map((event) => event.summary.preview)).toEqual([
      "new",
    ]);
    expect(retainedFirst?.eventsDropped).toBe(1);
    expect(retainedFirst?.artifacts).toHaveLength(1);
    expect(retainedFirst?.artifactsDropped).toBe(1);

    await proof.startRun({ sessionId: "session-2", workspaceRoot: "/repo" });
    expect(await proof.getRun(first.id)).toBeNull();
    expect(await proof.restore()).toHaveLength(1);
  });

  it("redacts persisted proof surfaces and accepts explicit late follow-ups", async () => {
    const { journal: proof } = journal();
    const run = await proof.startRun({
      sessionId: "session-1",
      workspaceRoot: "/repo",
    });
    await proof.appendEvent(run.id, {
      kind: "shell",
      summary: "pnpm test API_KEY=super-secret-value",
      payload: { stderr: "PASSWORD=super-secret-value" },
    });
    await proof.upsertArtifact(run.id, {
      kind: "command",
      pathOrCommand: "API_KEY=super-secret-value pnpm test",
      contentHash: "hash",
      preview: "AUTH_TOKEN=super-secret-value",
    });
    await proof.finishRun(run.id, {
      status: "failed",
      unresolvedFailures: ["PASSWORD=super-secret-value"],
    });
    await proof.appendFollowUpEvent(run.id, {
      kind: "approval.resolved",
      summary: "write_file denied",
      payload: { approved: false },
    });

    const restored = await proof.getRun(run.id);
    const serialized = JSON.stringify(restored);
    expect(serialized).not.toContain("super-secret-value");
    expect(serialized).toContain("<REDACTED>");
    expect(restored?.events[restored.events.length - 1]?.kind).toBe(
      "approval.resolved",
    );
  });
});
