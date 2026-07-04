import type { ProofJournal } from "@/modules/ai/proof/journal";
import type {
  ProofRun,
  ProofRunStatus,
  ProofVerdictStatus,
} from "@/modules/ai/proof/contracts";
import { boundText } from "@/modules/ai/proof/contracts";
import { redactSensitive } from "@/modules/ai/lib/redact";
import {
  semanticEvidenceFromToolResult,
  summarizeDiagnosticEvidence,
} from "@/modules/ai/proof/diagnostics";
import {
  lifecycleHookRunner,
  type AtlasLifecycleEvent,
} from "@/modules/ai/skills";
import { recordLocalMetric } from "@/modules/ai/metrics";

// Compact, synchronous view of a run for the UI. Built from state the recorder
// already accumulates, so the receipt strip never has to reload the journal.
export type ReceiptSummary = {
  runId: string;
  sessionId: string;
  status: ProofRunStatus;
  eventCount: number;
  actionCount: number;
  changedFiles: string[];
  checks: string[];
  diagnostics: string[];
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
const TIMELINE_TEXT_BYTES = 256;
const TIMELINE_ARRAY_ITEMS = 12;
const TIMELINE_OBJECT_KEYS = 24;
const TIMELINE_MAX_DEPTH = 4;
const encoder = new TextEncoder();
const OMITTED_TEXT_KEYS = new Set([
  "body",
  "content",
  "data",
  "new_string",
  "old_string",
  "prompt",
  "raw",
  "stderr",
  "stdout",
  "text",
]);
const RETAINED_OUTPUT_TEXT_KEYS = new Set([
  "detail",
  "error",
  "file",
  "kind",
  "message",
  "path",
  "provider",
  "reason",
  "status",
  "toolname",
]);

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

// Recognized verification commands: a successful run of one of these earns the
// "verified" tier. A bare echo/ls/cat does not — it is at most "smoke_checked".
// Matched on the command token stream so wrappers (npm run test, pnpm -w lint,
// npx tsc, python -m pytest, cargo test) are caught without overfitting.
const VERIFICATION_PATTERNS: RegExp[] = [
  /(?:^|[;&|]\s*)(?:npm|pnpm|yarn|bun)(?:\s+(?:-w|--workspace-root|--filter\s+\S+|-C\s+\S+|--dir\s+\S+))*\s+(?:run\s+)?(?:test|lint|build|typecheck|type-check|check)(?::[\w.-]+)?(?:\s|$)/,
  /(?:^|[;&|]\s*)(?:(?:pnpm\s+exec|npx|bunx)\s+)?(?:vitest|jest|mocha|ava|pytest|ruff|flake8|mypy|eslint|tsc)(?:\s|$)/,
  /(?:^|[;&|]\s*)(?:python(?:3)?\s+-m|uv\s+run)\s+(?:pytest|unittest|mypy|ruff)(?:\s|$)/,
  /(?:^|[;&|]\s*)cargo\s+(?:test|check|clippy|build)(?:\s|$)/,
  /(?:^|[;&|]\s*)cargo\s+nextest\s+run(?:\s|$)/,
  /(?:^|[;&|]\s*)go\s+(?:test|build|vet)(?:\s|$)/,
  /(?:^|[;&|]\s*)(?:\.\/)?gradle(?:w)?(?:\.bat)?\b[^;&|]*\b(?:test|build|check)\b/,
  /(?:^|[;&|]\s*)(?:\.\/)?mvn(?:w)?(?:\.cmd)?\b[^;&|]*\b(?:test|verify|package)\b/,
  /(?:^|[;&|]\s*)make\b[^;&|]*\b(?:test|check|build)\b/,
  /(?:^|[;&|]\s*)(?:dotnet|swift|deno)\s+(?:test|build|check|lint)(?:\s|$)/,
  /(?:^|[;&|]\s*)(?:ctest|tox)(?:\s|$)/,
];

/** True when a shell command is a recognized test/build/typecheck/lint check. */
export function isRecognizedCheck(command: string): boolean {
  const c = command.toLowerCase();
  return VERIFICATION_PATTERNS.some((re) => re.test(c));
}

function shellCheckSummary(
  command: string,
  output: Record<string, unknown>,
): string {
  const duration =
    typeof output.duration_ms === "number" ? `, ${output.duration_ms}ms` : "";
  return `${timelineText(command)} (exit ${String(output.exit_code)}${duration})`;
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
    return timelineText(`${toolName} ${input.path}`);
  }
  if (SHELL_TOOLS.has(toolName) && typeof input.command === "string") {
    return timelineText(`${toolName} ${input.command}`);
  }
  return timelineText(toolName);
}

function timelineText(value: string): string {
  return boundText(redactSensitive(value), TIMELINE_TEXT_BYTES).preview;
}

function textBytes(value: string): number {
  return encoder.encode(value).byteLength;
}

/**
 * Keep proof rows useful without turning them into a second raw-output store.
 * Bodies, prompts, diffs, and terminal streams become byte-count metadata;
 * small operational fields remain visible after redaction and bounding.
 */
function timelineValue(
  value: unknown,
  key = "",
  depth = 0,
  outputText = false,
): unknown {
  if (typeof value === "string") {
    const normalizedKey = key.toLowerCase();
    if (
      OMITTED_TEXT_KEYS.has(normalizedKey) ||
      (outputText && !RETAINED_OUTPUT_TEXT_KEYS.has(normalizedKey))
    ) {
      return { omitted: true, bytes: textBytes(value) };
    }
    return timelineText(value);
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "undefined") return null;
  if (depth >= TIMELINE_MAX_DEPTH) return "[nested metadata omitted]";
  if (Array.isArray(value)) {
    return {
      items: value
        .slice(0, TIMELINE_ARRAY_ITEMS)
        .map((item) => timelineValue(item, key, depth + 1, outputText)),
      originalCount: value.length,
      truncated: value.length > TIMELINE_ARRAY_ITEMS,
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return Object.fromEntries(
      entries
        .slice(0, TIMELINE_OBJECT_KEYS)
        .map(([childKey, childValue]) => [
          childKey,
          timelineValue(
            childValue,
            childKey,
            depth + 1,
            outputText || key.toLowerCase() === "output",
          ),
        ]),
    );
  }
  return timelineText(String(value));
}

function lifecycleRow(
  event: AtlasLifecycleEvent,
  payload: Record<string, unknown>,
): { kind: string; summary: string; payload: unknown } {
  const toolName =
    typeof payload.toolName === "string" ? timelineText(payload.toolName) : null;
  switch (event) {
    case "run_start":
      return {
        kind: "lifecycle.session_started",
        summary: "Agent session started",
        payload: timelineValue(payload),
      };
    case "prompt_submit":
      return {
        kind: "lifecycle.user_prompt_submitted",
        summary: "User prompt submitted",
        payload: timelineValue(payload),
      };
    case "before_tool":
      return {
        kind: "tool.started",
        summary: toolName ? `${toolName} started` : "Tool started",
        payload: timelineValue(payload),
      };
    case "after_tool":
      return {
        kind: "tool.finished",
        summary: toolName ? `${toolName} finished` : "Tool finished",
        payload: timelineValue(payload),
      };
    case "verdict":
      return {
        kind: "lifecycle.finish_verdict",
        summary: `Finish verdict: ${timelineText(String(payload.status ?? "unknown"))}`,
        payload: timelineValue(payload),
      };
    case "run_finish":
      return {
        kind: "lifecycle.session_finished",
        summary: `Agent session finished: ${timelineText(String(payload.status ?? "unknown"))}`,
        payload: timelineValue(payload),
      };
  }
}

/**
 * Records one agent run. Created at run start, fed per-tool records during the
 * stream, and closed once with a verdict. Recorder calls are serialized here
 * before they reach the journal so finish cannot race fire-and-forget evidence.
 */
export type RecorderOptions = {
  /** Notified on start, after each recorded tool, and on finish. Synchronous. */
  onUpdate?: (summary: ReceiptSummary) => void;
};

export type ApprovalRecord = {
  approvalId: string;
  toolName: string;
  approved?: boolean;
};

export class RunRecorder {
  private readonly changedFiles = new Set<string>();
  private readonly failures: string[] = [];
  private readonly shellChecks: string[] = [];
  private readonly diagnostics: string[] = [];
  /** A recognized test/build/typecheck/lint command exited 0 this run. */
  private verifiedCheckRan = false;
  private mutationVersion = 0;
  private verifiedMutationVersion = -1;
  /** Some non-trivial command ran successfully (not necessarily a known check). */
  private anyCommandRan = false;
  private anyToolRan = false;
  private eventCount = 0;
  private actionCount = 0;
  private status: ProofRunStatus = "running";
  private finishedAt: number | null = null;
  private finishPromise: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private readonly recordedApprovals = new Set<string>();

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
    recordLocalMetric({ name: "run.started", value: 1, unit: "count" });
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
      actionCount: this.actionCount,
      changedFiles: [...this.changedFiles],
      checks: [...this.shellChecks],
      diagnostics: [...this.diagnostics],
      failures: [...this.failures],
      startedAt: this.run.startedAt,
      finishedAt: this.finishedAt,
    };
  }

  private emit(): void {
    this.onUpdate?.(this.summary());
  }

  private sequence<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.then(operation, operation);
    this.writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  recordTool(record: ToolStepRecord): Promise<void> {
    return this.sequence(() => this.recordToolNow(record));
  }

  private async recordToolNow(record: ToolStepRecord): Promise<void> {
    const shellError = shellFailure(record);
    const failed = isErrorResult(record.output) || shellError !== null;
    const kind = eventKind(record.toolName, failed);
    const summary = summarize(record.toolName, record.input);
    await this.journal.appendEvent(this.run.id, {
      kind,
      summary,
      payload: timelineValue(record.output, "output", 0, true),
    });
    this.eventCount += 1;
    this.actionCount += 1;
    recordLocalMetric({
      name: "tool.completed",
      value: 1,
      unit: "count",
      attributes: { tool: record.toolName, status: failed ? "failed" : "ok" },
    });

    if (failed) {
      const detail = isErrorResult(record.output)
        ? timelineText(record.output.error)
        : (shellError as string);
      this.failures.push(`${summary}: ${detail}`);
      this.emit();
      return;
    }

    this.anyToolRan = true;

    if (MUTATION_TOOLS.has(record.toolName) && typeof record.input.path === "string") {
      this.mutationVersion += 1;
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
      this.anyCommandRan = true;
      if (isRecognizedCheck(record.input.command)) {
        this.verifiedCheckRan = true;
        this.verifiedMutationVersion = this.mutationVersion;
      }
    }
    // Running the app counts as activity: a successful serve_preview (the fused
    // run/open tool) means something ran, so the verdict is at least
    // "smoke_checked" rather than the alarming "unverified".
    if (record.toolName === "serve_preview" && !failed) {
      this.anyCommandRan = true;
    }
    this.diagnostics.push(
      ...summarizeDiagnosticEvidence(
        semanticEvidenceFromToolResult(record.toolName, record.output),
      ),
    );
    this.emit();
  }

  recordLifecycle(
    event: AtlasLifecycleEvent,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    return this.sequence(() => this.recordLifecycleNow(event, payload));
  }

  private async recordLifecycleNow(
    event: AtlasLifecycleEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // before_tool/after_tool are observed only to drive skill hooks — recordTool
    // (fed from onToolResult) already journals a richer, categorized row for the
    // same tool call (mutation/shell/read, failure detection, changed files,
    // verification-check detection). Journaling a second generic
    // tool.started/tool.finished row here would be pure duplication.
    if (event !== "before_tool" && event !== "after_tool") {
      const row = lifecycleRow(event, payload);
      await this.journal.appendEvent(this.run.id, row);
      this.eventCount += 1;
    }
    const results = await lifecycleHookRunner.run(event, payload);
    for (const result of results) {
      await this.journal.appendEvent(this.run.id, {
        kind: `hook.${event}.${result.status}`,
        summary: `${result.hookId} ${event}: ${result.status}`,
        payload: result,
      });
      this.eventCount += 1;
    }
    this.emit();
  }

  recordApproval(record: ApprovalRecord): Promise<void> {
    return this.sequence(() => this.recordApprovalNow(record));
  }

  private async recordApprovalNow(record: ApprovalRecord): Promise<void> {
    const stage = record.approved === undefined ? "requested" : "resolved";
    const dedupeKey = `${record.approvalId}:${stage}`;
    if (this.recordedApprovals.has(dedupeKey)) return;
    this.recordedApprovals.add(dedupeKey);
    const decision =
      record.approved === undefined
        ? "needs user approval"
        : record.approved
          ? "approved"
          : "denied";
    await this.journal.appendFollowUpEvent(this.run.id, {
      kind: `approval.${stage}`,
      summary: `${timelineText(record.toolName)} ${decision}`,
      payload: {
        approvalId: timelineText(record.approvalId),
        toolName: timelineText(record.toolName),
        ...(record.approved === undefined
          ? {}
          : { approved: record.approved }),
      },
    });
    this.eventCount += 1;
    this.actionCount += 1;
    this.emit();
  }

  /**
   * Close the run exactly once with a soft, honest verdict (see
   * ProofVerdictStatus): failed > unverified > completed > smoke_checked >
   * verified, plus explicit cancelled. "verified" requires a recognized
   * test/build/typecheck/lint command to exit 0; a bare command is only
   * "smoke_checked". Extra calls are ignored so the first verdict wins.
   */
  finish(outcome: {
    cancelled?: boolean;
    errored?: boolean;
  } = {}): Promise<void> {
    if (this.finishPromise) return this.finishPromise;
    this.finishPromise = this.sequence(() => this.finishNow(outcome));
    return this.finishPromise;
  }

  private async finishNow(outcome: {
    cancelled?: boolean;
    errored?: boolean;
  }): Promise<void> {
    // Soft 5-tier verdict (worst-wins). Honest, never blocking:
    //   failed   - something we recorded actually failed
    //   verified - a recognized test/build/typecheck/lint exited 0
    //   smoke_checked - some command ran ok, but no recognized check
    //   completed - edits happened but no command was run
    //   unverified - nothing meaningful to check
    const status: ProofVerdictStatus = outcome.cancelled
      ? "cancelled"
      : outcome.errored || this.failures.length > 0
        ? "failed"
        : this.verifiedCheckRan &&
            (this.changedFiles.size === 0 ||
              this.verifiedMutationVersion === this.mutationVersion)
          ? "verified"
          : this.anyCommandRan
            ? "smoke_checked"
            : this.changedFiles.size > 0 || this.anyToolRan
              ? "completed"
              : "unverified";
    await this.recordLifecycleNow("verdict", { status });
    await this.recordLifecycleNow("run_finish", { status });
    const verdict = await this.journal.finishRun(this.run.id, {
      status,
      changedFiles: [...this.changedFiles],
      checks: this.shellChecks,
      diagnostics: this.diagnostics,
      unresolvedFailures: this.failures,
    });
    this.status = verdict.status;
    this.finishedAt = Date.now();
    recordLocalMetric({
      name: "run.duration",
      value: this.finishedAt - this.run.startedAt,
      unit: "ms",
      attributes: { status: verdict.status },
    });
    recordLocalMetric({
      name: "run.completed",
      value: 1,
      unit: "count",
      attributes: { status: verdict.status },
    });
    this.emit();
  }
}
