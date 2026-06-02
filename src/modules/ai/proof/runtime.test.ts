import { describe, expect, it } from "vitest";
import { ProofJournal } from "@/modules/ai/proof/journal";
import type { ProofPersistence } from "@/modules/ai/proof/persistence";
import { RunRecorder } from "@/modules/ai/proof/recorder";
import { ProofRunRegistry } from "@/modules/ai/proof/runtime";

class MemoryPersistence implements ProofPersistence {
  private readonly values = new Map<string, unknown>();

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

  async save(): Promise<void> {}
}

function journal() {
  let nextId = 0;
  return new ProofJournal(new MemoryPersistence(), {
    idFactory: () => `run-${++nextId}`,
  });
}

describe("ProofRunRegistry", () => {
  it("routes approval telemetry to the latest recorder for each session", async () => {
    const proof = journal();
    const first = await RunRecorder.start(proof, {
      sessionId: "session-1",
      workspaceRoot: "/repo",
    });
    const second = await RunRecorder.start(proof, {
      sessionId: "session-2",
      workspaceRoot: "/repo",
    });
    await first.finish();
    await second.finish();
    const registry = new ProofRunRegistry();
    registry.register(first);
    registry.register(second);

    await expect(
      registry.recordApproval("session-1", {
        approvalId: "approval-1",
        toolName: "write_file",
        approved: true,
      }),
    ).resolves.toBe(true);
    await expect(
      registry.recordApproval("missing", {
        approvalId: "approval-2",
        toolName: "bash_run",
      }),
    ).resolves.toBe(false);

    const restored = await proof.getRun(first.runId);
    expect(restored?.events[restored.events.length - 1]?.kind).toBe(
      "approval.resolved",
    );
    expect(registry.latest("session-2")).toBe(second);
  });

  it("bounds retained session recorders", async () => {
    const proof = journal();
    const registry = new ProofRunRegistry(1);
    const first = await RunRecorder.start(proof, {
      sessionId: "session-1",
      workspaceRoot: "/repo",
    });
    const second = await RunRecorder.start(proof, {
      sessionId: "session-2",
      workspaceRoot: "/repo",
    });
    registry.register(first);
    registry.register(second);

    expect(registry.latest("session-1")).toBeNull();
    expect(registry.latest("session-2")).toBe(second);
  });
});
