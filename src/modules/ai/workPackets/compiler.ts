import { redactSensitive } from "@/modules/ai/lib/redact";
import { boundText } from "@/modules/ai/proof/contracts";
import type { ProofRun } from "@/modules/ai/proof/contracts";
import type { Todo } from "@/modules/ai/lib/todos";
import {
  WORK_PACKET_CONTEXT_BYTES,
  WORK_PACKET_LIST_ITEMS,
  WORK_PACKET_PATH_BYTES,
  WORK_PACKET_REPO_TRUTH_RULE,
  WORK_PACKET_TEXT_BYTES,
  type CreateWorkPacketInput,
  type WorkPacket,
  type WorkPacketResumeCapsule,
  type WorkPacketStatus,
} from "@/modules/ai/workPackets/contracts";

const encoder = new TextEncoder();

function safeText(text: string, maxBytes = WORK_PACKET_TEXT_BYTES): string {
  return boundText(redactSensitive(text.trim()), maxBytes).preview;
}

function requiredText(text: string, label: string): string {
  const normalized = safeText(text);
  if (!normalized) throw new Error(`work packet ${label} cannot be empty`);
  return normalized;
}

function uniqueBounded(
  values: readonly string[],
  maxBytes = WORK_PACKET_TEXT_BYTES,
): string[] {
  return [
    ...new Set(
      values
        .map((value) => safeText(value, maxBytes))
        .filter((value) => value.length > 0),
    ),
  ].slice(0, WORK_PACKET_LIST_ITEMS);
}

export type CompileWorkPacketInput = {
  projectId: string;
  sessionId: string;
  originalGoal: string;
  acceptedInterpretation: string;
  status: WorkPacketStatus;
  decisionsMade?: readonly string[];
  unresolvedBlockers?: readonly string[];
  nextSuggestedAction?: string;
  proofRuns: readonly ProofRun[];
  todos?: readonly Todo[];
};

export function compileWorkPacket(
  input: CompileWorkPacketInput,
): CreateWorkPacketInput {
  const runs = input.proofRuns.filter(
    (run) =>
      run.sessionId === input.sessionId &&
      run.workspaceRoot === input.projectId &&
      run.verdict !== null,
  );
  const filesChanged = runs.flatMap((run) => [
    ...(run.verdict?.changedFiles.items.map((item) => item.preview) ?? []),
    ...run.artifacts
      .filter((artifact) => artifact.kind === "changed_file")
      .map((artifact) => artifact.pathOrCommand.preview),
  ]);
  const testsRun = runs.flatMap(
    (run) => run.verdict?.checks.items.map((item) => item.preview) ?? [],
  );
  const failingTests = runs.flatMap(
    (run) =>
      run.verdict?.unresolvedFailures.items.map((item) => item.preview) ?? [],
  );
  const nextTodo = input.todos?.find(
    (todo) => todo.status === "in_progress" || todo.status === "pending",
  );

  return {
    projectId: requiredText(input.projectId, "project id"),
    sessionId: requiredText(input.sessionId, "session id"),
    originalGoal: requiredText(input.originalGoal, "goal"),
    acceptedInterpretation: requiredText(
      input.acceptedInterpretation,
      "interpretation",
    ),
    status: input.status,
    filesChanged: uniqueBounded(filesChanged, WORK_PACKET_PATH_BYTES),
    decisionsMade: uniqueBounded(input.decisionsMade ?? []),
    unresolvedBlockers: uniqueBounded(input.unresolvedBlockers ?? []),
    testsRun: uniqueBounded(testsRun),
    failingTests: uniqueBounded(failingTests),
    proofRunIds: uniqueBounded(
      runs.map((run) => run.id),
      WORK_PACKET_PATH_BYTES,
    ),
    nextSuggestedAction: requiredText(
      input.nextSuggestedAction ??
        nextTodo?.title ??
        "Refresh current repository evidence and choose the next bounded action.",
      "next action",
    ),
  };
}

function markdownList(values: readonly string[], empty: string): string {
  return values.length === 0
    ? `- ${empty}`
    : values.map((value) => `- ${value}`).join("\n");
}

export function renderWorkPacketMarkdown(packet: WorkPacket): string {
  return [
    `# Atlas Work Packet: ${packet.id}`,
    "",
    `Status: ${packet.status}`,
    `Project: ${packet.projectId}`,
    `Session: ${packet.sessionId}`,
    `Updated: ${new Date(packet.updatedAt).toISOString()}`,
    "",
    "## Original Goal",
    packet.originalGoal,
    "",
    "## Accepted Interpretation",
    packet.acceptedInterpretation,
    "",
    "## Files Changed",
    markdownList(packet.filesChanged, "None recorded."),
    "",
    "## Decisions Made",
    markdownList(packet.decisionsMade, "None recorded."),
    "",
    "## Unresolved Blockers",
    markdownList(packet.unresolvedBlockers, "None recorded."),
    "",
    "## Tests Run",
    markdownList(packet.testsRun, "None recorded."),
    "",
    "## Failing Tests",
    markdownList(packet.failingTests, "None recorded."),
    "",
    "## Proof References",
    markdownList(packet.proofRunIds, "None recorded."),
    "",
    "## Next Suggested Action",
    packet.nextSuggestedAction,
    "",
    "## Resume Rule",
    WORK_PACKET_REPO_TRUTH_RULE,
    "",
  ].join("\n");
}

export function suggestedWorkPacketPath(packet: WorkPacket): string {
  return `.atlas/memory/work-packets/${packet.id}.md`;
}

export function resumeCapsule(packet: WorkPacket): WorkPacketResumeCapsule {
  const markdown = boundText(
    renderWorkPacketMarkdown(packet),
    WORK_PACKET_CONTEXT_BYTES,
  ).preview;
  return {
    packetId: packet.id,
    projectId: packet.projectId,
    status: packet.status,
    tokenEstimate: Math.ceil(encoder.encode(markdown).byteLength / 4),
    repoTruthRule: WORK_PACKET_REPO_TRUTH_RULE,
    markdown,
  };
}
