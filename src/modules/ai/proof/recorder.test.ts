import { describe, expect, it } from "vitest";
import { ProofJournal } from "@/modules/ai/proof/journal";
import type { ProofPersistence } from "@/modules/ai/proof/persistence";
import { isRecognizedCheck, RunRecorder } from "@/modules/ai/proof/recorder";

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
      output: {
        ok: true,
        replacements: 1,
        bytesWritten: 2,
        path: "/repo/a.ts",
        post_edit_diagnostics: {
          provider: "typescript",
          status: "fresh",
          file: "/repo/a.ts",
          diagnostics: [
            {
              range: { start: { line: 2, character: 4 } },
              source: "ts",
              message: "sample warning",
            },
          ],
        },
      },
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
      "lifecycle.finish_verdict",
      "lifecycle.session_finished",
    ]);
    expect(run?.status).toBe("verified");
    expect(run?.verdict?.changedFiles.items.map((f) => f.preview)).toEqual([
      "/repo/a.ts",
    ]);
    expect(run?.verdict?.checks.items.map((c) => c.preview)).toEqual([
      "npm test (exit 0)",
    ]);
    expect(run?.verdict?.diagnostics.items.map((d) => d.preview)).toEqual([
      "/repo/a.ts:3:5 ts: sample warning",
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

  it("records shell stream metadata, not the full output buffer", async () => {
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
    expect(payload?.preview).not.toContain(huge);
    expect(payload?.preview).toContain('"omitted":true');
    expect(payload?.preview).toContain('"bytes":50000');
  });

  it("marks a non-zero foreground shell result failed", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.recordTool({
      toolName: "bash_run",
      input: { command: "pnpm test" },
      output: { exit_code: 1, timed_out: false, stderr: "failed" },
    });
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    expect(run?.events[0].kind).toBe("shell.bash_run.failed");
    expect(run?.status).toBe("failed");
    expect(run?.verdict?.checks.originalCount).toBe(0);
    expect(run?.verdict?.unresolvedFailures.items[0].preview).toContain(
      "exited 1",
    );
  });

  it("marks a timed-out foreground shell result failed", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.recordTool({
      toolName: "bash_run",
      input: { command: "pnpm test" },
      output: { exit_code: null, timed_out: true },
    });
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    expect(run?.status).toBe("failed");
    expect(run?.verdict?.unresolvedFailures.items[0].preview).toContain(
      "timed out",
    );
  });

  it("marks a mutation-only run completed (edited, no check run)", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.recordTool({
      toolName: "write_file",
      input: { path: "/repo/out.ts" },
      output: { ok: true },
    });
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    expect(run?.status).toBe("completed");
    expect(run?.verdict?.changedFiles.originalCount).toBe(1);
    expect(run?.verdict?.checks.originalCount).toBe(0);
  });

  it("smoke-checks (not verifies) a bare successful command", async () => {
    // The core honesty fix: `echo ok` ran fine, but it is not a real check.
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.recordTool({
      toolName: "bash_run",
      input: { command: "echo ok" },
      output: { exit_code: 0, stdout: "ok" },
    });
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    expect(run?.status).toBe("smoke_checked");
  });

  it("does not verify commands that merely mention check words", () => {
    expect(isRecognizedCheck("echo test")).toBe(false);
    expect(isRecognizedCheck("Write-Output build")).toBe(false);
    expect(isRecognizedCheck("printf 'lint' ")).toBe(false);
    expect(isRecognizedCheck("echo ok # pnpm test")).toBe(false);
  });

  it("recognizes actual check runner invocations after shell chaining", () => {
    expect(isRecognizedCheck("pnpm test")).toBe(true);
    expect(isRecognizedCheck("pnpm --filter web test:unit")).toBe(true);
    expect(isRecognizedCheck("cd app && pnpm exec vitest run")).toBe(true);
    expect(isRecognizedCheck("python -m pytest -q")).toBe(true);
    expect(isRecognizedCheck("cargo clippy --locked")).toBe(true);
  });

  it("verifies when a recognized check command passes", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.recordTool({
      toolName: "bash_run",
      input: { command: "cargo test --locked" },
      output: { exit_code: 0, stdout: "ok" },
    });
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    expect(run?.status).toBe("verified");
  });

  it("marks a successful read-only run completed", async () => {
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
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    expect(run?.status).toBe("completed");
  });

  it("does not keep a passed verdict when a later mutation was not checked", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.recordTool({
      toolName: "write_file",
      input: { path: "/repo/a.ts" },
      output: { ok: true },
    });
    await rec.recordTool({
      toolName: "bash_run",
      input: { command: "pnpm test" },
      output: { exit_code: 0 },
    });
    await rec.recordTool({
      toolName: "edit",
      input: { path: "/repo/a.ts" },
      output: { ok: true },
    });
    await rec.finish();

    expect((await journal.getRun(rec.runId))?.status).toBe("smoke_checked");
  });

  it("keeps lifecycle-only runs unverified with zero actions", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.recordLifecycle("run_start");
    await rec.recordLifecycle("prompt_submit");
    await rec.finish();

    expect(rec.summary()).toMatchObject({
      status: "unverified",
      eventCount: 4,
      actionCount: 0,
    });
  });

  it("attaches explicit semantic-tool evidence", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.recordTool({
      toolName: "lsp_diagnostics",
      input: { path: "/repo/a.ts" },
      output: {
        provider: "typescript",
        status: "pending",
        file: "/repo/a.ts",
        diagnostics: [],
        detail: "bounded wait expired",
      },
    });
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    expect(run?.verdict?.diagnostics.items[0].preview).toContain("pending");
  });

  it("records lifecycle rows without optional hooks and omits prompt and body text", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.recordLifecycle("run_start");
    await rec.recordLifecycle("prompt_submit", {
      text: "API_KEY=super-secret-value explain auth",
    });
    await rec.recordLifecycle("before_tool", {
      toolName: "read_file",
      input: { path: "/repo/a.ts" },
    });
    await rec.recordLifecycle("after_tool", {
      toolName: "read_file",
      output: {
        content: "raw file body API_KEY=super-secret-value",
        matches: ["unfamiliar raw source line"],
      },
    });
    await rec.finish();

    const run = await journal.getRun(rec.runId);
    // before_tool/after_tool are observed only to drive skill hooks and are not
    // journaled themselves — recordTool (not exercised in this test) is the
    // sole journal path for tool-call rows, so no tool.started/tool.finished
    // rows appear here even though recordLifecycle("before_tool"/"after_tool")
    // was called above.
    expect(run?.events.map((event) => event.kind)).toEqual([
      "lifecycle.session_started",
      "lifecycle.user_prompt_submitted",
      "lifecycle.finish_verdict",
      "lifecycle.session_finished",
    ]);
    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain("super-secret-value");
    expect(serialized).not.toContain("raw file body");
    expect(serialized).not.toContain("unfamiliar raw source line");
    expect(serialized).not.toContain("explain auth");
    expect(run?.events[1].boundedPayload?.preview).toContain('"omitted":true');
  });

  it("waits for queued completion evidence before computing the verdict", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    const toolWrite = rec.recordTool({
      toolName: "bash_run",
      input: { command: "pnpm test" },
      output: { exit_code: 0, stdout: "ok" },
    });
    await rec.finish();
    await toolWrite;

    const run = await journal.getRun(rec.runId);
    expect(run?.status).toBe("verified");
    expect(run?.verdict?.checks.items[0].preview).toBe("pnpm test (exit 0)");
  });

  it("records late approval telemetry once after the run closes", async () => {
    const journal = makeJournal();
    const rec = await RunRecorder.start(journal, {
      sessionId: "s1",
      workspaceRoot: "/repo",
    });
    await rec.finish();
    await rec.recordApproval({
      approvalId: "approval-1",
      toolName: "write_file",
    });
    await rec.recordApproval({
      approvalId: "approval-1",
      toolName: "write_file",
    });
    await rec.recordApproval({
      approvalId: "approval-1",
      toolName: "write_file",
      approved: false,
    });
    await rec.recordApproval({
      approvalId: "approval-1",
      toolName: "write_file",
      approved: false,
    });

    const run = await journal.getRun(rec.runId);
    expect(
      run?.events
        .filter((event) => event.kind.startsWith("approval."))
        .map((event) => event.kind),
    ).toEqual(["approval.requested", "approval.resolved"]);
  });
});
