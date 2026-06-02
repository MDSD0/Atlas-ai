import { describe, expect, it } from "vitest";
import type { CreateWorkPacketInput } from "@/modules/ai/workPackets/contracts";
import type { WorkPacketPersistence } from "@/modules/ai/workPackets/persistence";
import { WorkPacketRegistry } from "@/modules/ai/workPackets/registry";

class InMemoryPersistence implements WorkPacketPersistence {
  readonly values = new Map<string, unknown>();
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

function packet(
  projectId: string,
  status: CreateWorkPacketInput["status"] = "active",
): CreateWorkPacketInput {
  return {
    projectId,
    sessionId: "session-1",
    originalGoal: "Ship the resumable handoff.",
    acceptedInterpretation: "Keep the local harness boundary.",
    status,
    filesChanged: [],
    decisionsMade: [],
    unresolvedBlockers: [],
    testsRun: [],
    failingTests: [],
    proofRunIds: [],
    nextSuggestedAction: "Refresh repository evidence.",
  };
}

function registry(
  persistence = new InMemoryPersistence(),
  maxPacketsPerProject = 100,
) {
  let id = 0;
  let now = 100;
  return {
    persistence,
    registry: new WorkPacketRegistry(persistence, {
      idFactory: () => `wp-${++id}`,
      clock: () => ++now,
      maxPacketsPerProject,
    }),
  };
}

describe("WorkPacketRegistry", () => {
  it("persists packets without crossing projects and restores the latest active one", async () => {
    const { persistence, registry: packets } = registry();
    await packets.create(packet("/repo-a", "complete"));
    const active = await packets.create(packet("/repo-a"));
    await packets.create(packet("/repo-b"));

    const restored = new WorkPacketRegistry(persistence);
    await expect(restored.list("/repo-a")).resolves.toHaveLength(2);
    await expect(restored.list("/repo-b")).resolves.toHaveLength(1);
    await expect(restored.latestActive("/repo-a")).resolves.toMatchObject({
      id: active.id,
      projectId: "/repo-a",
      status: "active",
    });
    await expect(restored.resume("/repo-a")).resolves.toMatchObject({
      packetId: active.id,
      projectId: "/repo-a",
      status: "active",
    });
  });

  it("retains bounded project history and deletes only project-owned packets", async () => {
    const { registry: packets } = registry(undefined, 1);
    const old = await packets.create(packet("/repo"));
    const retained = await packets.create(packet("/repo", "blocked"));

    await expect(packets.list("/repo")).resolves.toMatchObject([
      { id: retained.id },
    ]);
    await expect(packets.get("/repo", old.id)).resolves.toBeNull();
    await expect(packets.delete("/other", retained.id)).resolves.toBe(false);
    await expect(packets.delete("/repo", retained.id)).resolves.toBe(true);
    await expect(packets.list("/repo")).resolves.toEqual([]);
  });
});
