import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));
vi.mock("@/modules/workspace/env", () => ({
  currentWorkspaceEnv: () => null,
}));
vi.mock("../lib/native", () => ({
  native: { writeFile: vi.fn(async () => undefined) },
  agentNative: {
    readFile: vi.fn(async () => {
      throw new Error("not found");
    }),
    writeFile: vi.fn(async () => undefined),
    createDir: vi.fn(async () => undefined),
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { native } from "../lib/native";
import {
  __resetCheckpointsForTest,
  beginCheckpointTurn,
  captureFileSnapshot,
  computeRestorePlan,
  hasCheckpoint,
  restoreToMessage,
} from "./checkpointStore";

describe("checkpointStore", () => {
  beforeEach(() => {
    __resetCheckpointsForTest();
    vi.clearAllMocks();
  });

  it("first capture per turn wins and re-running a message reuses its turn", () => {
    beginCheckpointTurn("s1", "m1", "/w");
    captureFileSnapshot("s1", "/w/a.ts", "v0");
    captureFileSnapshot("s1", "/w/a.ts", "v1-should-be-ignored");
    // Auto-resume re-enters with the same message id — same turn.
    beginCheckpointTurn("s1", "m1", "/w");
    captureFileSnapshot("s1", "/w/b.ts", null);

    const plan = computeRestorePlan("s1", "m1");
    expect(plan?.files.get("/w/a.ts")).toBe("v0");
    expect(plan?.files.get("/w/b.ts")).toBeNull();
  });

  it("restore plan unions turns from the target onward, oldest pre-image wins", () => {
    beginCheckpointTurn("s1", "m1", "/w");
    captureFileSnapshot("s1", "/w/a.ts", "original");
    beginCheckpointTurn("s1", "m2", "/w");
    captureFileSnapshot("s1", "/w/a.ts", "after-turn-1");
    captureFileSnapshot("s1", "/w/new.ts", null);

    // Restoring to m2 keeps turn-1's result for a.ts.
    const planM2 = computeRestorePlan("s1", "m2");
    expect(planM2?.files.get("/w/a.ts")).toBe("after-turn-1");
    // Restoring to m1 goes all the way back.
    const planM1 = computeRestorePlan("s1", "m1");
    expect(planM1?.files.get("/w/a.ts")).toBe("original");
    expect(planM1?.files.get("/w/new.ts")).toBeNull();
  });

  it("captures without an active turn are ignored (scoped agents)", () => {
    captureFileSnapshot("other-session", "/w/x.ts", "content");
    expect(hasCheckpoint("other-session", "anything")).toBe(false);
  });

  it("restoreToMessage writes pre-images, deletes created files, drops consumed turns", async () => {
    beginCheckpointTurn("s1", "m1", "/w");
    captureFileSnapshot("s1", "/w/a.ts", "original");
    captureFileSnapshot("s1", "/w/created.ts", null);

    const result = await restoreToMessage("s1", "m1");
    expect(result?.restored).toEqual(["/w/a.ts"]);
    expect(result?.deleted).toEqual(["/w/created.ts"]);
    expect(result?.failed).toEqual([]);
    expect(native.writeFile).toHaveBeenCalledWith("/w/a.ts", "original");
    expect(invoke).toHaveBeenCalledWith(
      "fs_delete",
      expect.objectContaining({ path: "/w/created.ts" }),
    );
    // Consumed: a second restore has nothing.
    expect(computeRestorePlan("s1", "m1")).toBeNull();
  });

  it("oversized pre-images are skipped", () => {
    beginCheckpointTurn("s1", "m1", "/w");
    captureFileSnapshot("s1", "/w/huge.bin", "x".repeat(1024 * 1024 + 1));
    const plan = computeRestorePlan("s1", "m1");
    expect(plan?.files.has("/w/huge.bin")).toBe(false);
  });

  it("failed writes are reported per path, not thrown", async () => {
    (native.writeFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("locked"),
    );
    beginCheckpointTurn("s1", "m1", "/w");
    captureFileSnapshot("s1", "/w/a.ts", "original");
    captureFileSnapshot("s1", "/w/b.ts", "fine");
    const result = await restoreToMessage("s1", "m1");
    expect(result?.failed).toHaveLength(1);
    expect(result?.failed[0].path).toBe("/w/a.ts");
    expect(result?.restored).toEqual(["/w/b.ts"]);
  });
});
