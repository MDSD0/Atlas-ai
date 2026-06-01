import type { ProofJournal } from "@/modules/ai/proof/journal";
import type { ProofRun, ProofVerdictStatus } from "@/modules/ai/proof/contracts";

// Maps agent-loop lifecycle callbacks onto journal events. This is the Slice 2.2
// "hard hook" layer: it does NOT add a second tool runtime — it observes the
// existing streamText loop (run start/finish + per-step tool calls/results) and
// records structured events. A tool result carrying `error` becomes a failure
// event so failures are reconstructable from the receipt, not only console logs.

export type ToolStepRecord = {
  toolName: string;
  input: Record<string, unknown>;
  // The tool's structured result. Atlas tools return `{ error }` on failure and
  // various shapes on success; both are recorded as bounded payloads.
  output: unknown;
};

const PATH_TOOLS = new Set([
  "read_file",
  "list_directory",
  "edit",
  "multi_edit",
  "write_file",
  "create_directory",
]);
const MUTATION_TOOLS = new Set([
  "edit",
  "multi_edit",
  "write_file",
  "create_directory",
]);
const SHELL_TOOLS = new Set(["bash_run", "bash_background"]);

function isErrorResult(output: unknown): output is { error: string } {
  return (
    typeof output === "object" &&
    output !== null &&
    "error" in output &&
    typeof (output as { error: unknown }).error === "string"
  );
}

function eventKind(toolName: string, failed: boolean): string {
  const lane = MUTATION_TOOLS.has(toolName)
    ? "mutation"
    : SHELL_TOOLS.has(toolName)
      ? "shell"
      : "read";
  return `${lane}.${toolName}.${failed ? "failed" : "ok"}`;
}

function summarize(toolName: string, input: Record<string, unknown>): string {
  if (PATH_TOOLS.has(toolName) && typeof input.path === "string") {
    return `${toolName} ${input.path}`;
  }
  if (SHELL_TOOLS.has(toolName) && typeof input.command === "string") {
    return `${toolName} ${input.command}`;
  }
  return toolName;
}

/**
 * Records one agent run. Created at run start, fed per-tool records during the
 * stream, and closed once with a verdict. All journal writes are serialized by
 * the journal itself; this class only sequences its own calls.
 */
export class RunRecorder {
  private readonly changedFiles = new Set<string>();
  private readonly failures: string[] = [];
  private readonly shellChecks: string[] = [];
  private finished = false;

  private constructor(
    private readonly journal: ProofJournal,
    private readonly run: ProofRun,
  ) {}

  static async start(
    journal: ProofJournal,
    input: { sessionId: string; workspaceRoot: string | null },
  ): Promise<RunRecorder> {
    const run = await journal.startRun(input);
    return new RunRecorder(journal, run);
  }

  get runId(): string {
    return this.run.id;
  }

  async recordTool(record: ToolStepRecord): Promise<void> {
    const failed = isErrorResult(record.output);
    const kind = eventKind(record.toolName, failed);
    const summary = summarize(record.toolName, record.input);
    await this.journal.appendEvent(this.run.id, {
      kind,
      summary,
      payload: record.output,
    });

    if (failed) {
      this.failures.push(`${summary}: ${(record.output as { error: string }).error}`);
      return;
    }

    if (MUTATION_TOOLS.has(record.toolName) && typeof record.input.path === "string") {
      this.changedFiles.add(record.input.path);
      await this.journal.upsertArtifact(this.run.id, {
        kind: "changed_file",
        pathOrCommand: record.input.path,
        contentHash: "",
      });
    }
    if (SHELL_TOOLS.has(record.toolName) && typeof record.input.command === "string") {
      this.shellChecks.push(record.input.command);
    }
  }

  /**
   * Close the run exactly once. The verdict is computed from observed evidence:
   * a cancelled run is "cancelled"; any recorded failure makes it "failed";
   * otherwise "passed". Idempotent — extra calls (e.g. abort then finish) are
   * ignored so the first authoritative verdict wins.
   */
  async finish(outcome: {
    cancelled?: boolean;
    errored?: boolean;
  } = {}): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    const status: ProofVerdictStatus = outcome.cancelled
      ? "cancelled"
      : outcome.errored || this.failures.length > 0
        ? "failed"
        : "passed";
    await this.journal.finishRun(this.run.id, {
      status,
      changedFiles: [...this.changedFiles],
      checks: this.shellChecks,
      unresolvedFailures: this.failures,
    });
  }
}
