import type { ProofJournal } from "@/modules/ai/proof/journal";
import type {
  ProofRun,
  ProofRunStatus,
  ProofVerdictStatus,
} from "@/modules/ai/proof/contracts";

// Compact, synchronous view of a run for the UI. Built from state the recorder
// already accumulates, so the receipt strip never has to reload the journal.
export type ReceiptSummary = {
  runId: string;
  sessionId: string;
  status: ProofRunStatus;
  eventCount: number;
  changedFiles: string[];
  checks: string[];
  failures: string[];
  startedAt: number;
  finishedAt: number | null;
};

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
const VERIFICATION_TOOL = "bash_run";

function isErrorResult(output: unknown): output is { error: string } {
  return (
    typeof output === "object" &&
    output !== null &&
    "error" in output &&
    typeof (output as { error: unknown }).error === "string"
  );
}

function shellFailure(record: ToolStepRecord): string | null {
  if (record.toolName !== VERIFICATION_TOOL) return null;
  if (typeof record.output !== "object" || record.output === null) {
    return "missing structured shell result";
  }
  const output = record.output as Record<string, unknown>;
  if (output.timed_out === true) return "timed out";
  if (typeof output.exit_code !== "number") return "missing exit code";
  return output.exit_code === 0 ? null : `exited ${output.exit_code}`;
}

function shellCheckSummary(
  command: string,
  output: Record<string, unknown>,
): string {
  const duration =
    typeof output.duration_ms === "number" ? `, ${output.duration_ms}ms` : "";
  return `${command} (exit ${String(output.exit_code)}${duration})`;
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
export type RecorderOptions = {
  /** Notified on start, after each recorded tool, and on finish. Synchronous. */
  onUpdate?: (summary: ReceiptSummary) => void;
};

export class RunRecorder {
  private readonly changedFiles = new Set<string>();
  private readonly failures: string[] = [];
  private readonly shellChecks: string[] = [];
  private eventCount = 0;
  private status: ProofRunStatus = "running";
  private finishedAt: number | null = null;
  private finished = false;

  private constructor(
    private readonly journal: ProofJournal,
    private readonly run: ProofRun,
    private readonly onUpdate?: (summary: ReceiptSummary) => void,
  ) {}

  static async start(
    journal: ProofJournal,
    input: { sessionId: string; workspaceRoot: string | null },
    options: RecorderOptions = {},
  ): Promise<RunRecorder> {
    const run = await journal.startRun(input);
    const recorder = new RunRecorder(journal, run, options.onUpdate);
    recorder.emit();
    return recorder;
  }

  get runId(): string {
    return this.run.id;
  }

  summary(): ReceiptSummary {
    return {
      runId: this.run.id,
      sessionId: this.run.sessionId,
      status: this.status,
      eventCount: this.eventCount,
      changedFiles: [...this.changedFiles],
      checks: [...this.shellChecks],
      failures: [...this.failures],
      startedAt: this.run.startedAt,
      finishedAt: this.finishedAt,
    };
  }

  private emit(): void {
    this.onUpdate?.(this.summary());
  }

  async recordTool(record: ToolStepRecord): Promise<void> {
    const shellError = shellFailure(record);
    const failed = isErrorResult(record.output) || shellError !== null;
    const kind = eventKind(record.toolName, failed);
    const summary = summarize(record.toolName, record.input);
    await this.journal.appendEvent(this.run.id, {
      kind,
      summary,
      payload: record.output,
    });
    this.eventCount += 1;

    if (failed) {
      const detail = isErrorResult(record.output)
        ? record.output.error
        : (shellError as string);
      this.failures.push(`${summary}: ${detail}`);
      this.emit();
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
    if (
      record.toolName === VERIFICATION_TOOL &&
      typeof record.input.command === "string" &&
      typeof record.output === "object" &&
      record.output !== null
    ) {
      this.shellChecks.push(
        shellCheckSummary(
          record.input.command,
          record.output as Record<string, unknown>,
        ),
      );
    }
    this.emit();
  }

  /**
   * Close the run exactly once. The verdict is computed from observed evidence:
   * a cancelled run is "cancelled"; any recorded failure makes it "failed";
   * a successful foreground shell check makes it "passed"; otherwise it is
   * "incomplete". Extra calls are ignored so the first verdict wins.
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
        : this.shellChecks.length === 0
          ? "incomplete"
          : "passed";
    const verdict = await this.journal.finishRun(this.run.id, {
      status,
      changedFiles: [...this.changedFiles],
      checks: this.shellChecks,
      unresolvedFailures: this.failures,
    });
    this.status = verdict.status;
    this.finishedAt = Date.now();
    this.emit();
  }
}
