import { describe, expect, it } from "vitest";
import { ProofJournal } from "@/modules/ai/proof/journal";
import type { ProofPersistence } from "@/modules/ai/proof/persistence";
import { RunRecorder } from "@/modules/ai/proof/recorder";

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

function makeJournal() {
  let nextId = 0;
  let now = 1_000;
  return new ProofJournal(new MemoryPersistence(), {
    idFactory: () => `run-${++nextId}`,
    clock: () => ++now,
  });
}

describe("RunRecorder", () => {
  it("records a complete read-edit-test trace with a passed verdict", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });

    await rec.recordTool({
      toolName: "read_file",
      input: { path: "/repo/a.ts" },
      output: { content: "x", size: 1 },
    });
    await rec.recordTool({
      toolName: "edit",
      input: { path: "/repo/a.ts" },
      output: { ok: true, replacements: 1, bytesWritten: 2, path: "/repo/a.ts" },
    });
    await rec.recordTool({
      toolName: "bash_run",
      input: { command: "npm test" },
      output: { exit_code: 0, stdout: "ok" },
    });
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    expect(run?.events.map((e) => e.kind)).toEqual([
      "read.read_file.ok",
      "mutation.edit.ok",
      "shell.bash_run.ok",
    ]);
    expect(run?.status).toBe("passed");
    expect(run?.verdict?.changedFiles.items.map((f) => f.preview)).toEqual([
      "/repo/a.ts",
    ]);
    expect(run?.verdict?.checks.items.map((c) => c.preview)).toEqual([
      "npm test",
    ]);
    // The mutation produced a changed-file artifact.
    expect(run?.artifacts.map((a) => a.pathOrCommand.preview)).toEqual([
      "/repo/a.ts",
    ]);
  });

  it("keeps a failed tool result visible and marks the run failed", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.recordTool({
      toolName: "write_file",
      input: { path: "/repo/out.ts" },
      output: { error: "no project is bound; refusing workspace mutation" },
    });
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    expect(run?.events[0].kind).toBe("mutation.write_file.failed");
    expect(run?.status).toBe("failed");
    expect(run?.verdict?.unresolvedFailures.items[0].preview).toContain(
      "refusing workspace mutation",
    );
    // A failed mutation must NOT be reported as a changed file.
    expect(run?.verdict?.changedFiles.originalCount).toBe(0);
  });

  it("records a cancelled verdict and ignores later finishes", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: null,
    });
    await rec.finish({ cancelled: true });
    await rec.finish(); // idempotent: first authoritative verdict wins

    const run = await journal.getRun(rec.runId);
    expect(run?.status).toBe("cancelled");
  });

  it("records a bounded shell summary, not the full output buffer", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    const huge = "A".repeat(50_000);
    await rec.recordTool({
      toolName: "bash_run",
      input: { command: "cat big.log" },
      output: { exit_code: 0, stdout: huge },
    });
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    const payload = run?.events[0].boundedPayload;
    expect(payload?.truncated).toBe(true);
    expect(payload!.preview.length).toBeLessThan(huge.length);
  });
});
