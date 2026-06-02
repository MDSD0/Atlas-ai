import { describe, expect, it } from "vitest";
import type { Todo } from "@/modules/ai/lib/todos";
import { boundText, type ProofRun } from "@/modules/ai/proof/contracts";
import {
  compileWorkPacket,
  renderWorkPacketMarkdown,
  resumeCapsule,
  suggestedWorkPacketPath,
} from "@/modules/ai/workPackets/compiler";

function run(overrides: Partial<ProofRun> = {}): ProofRun {
  return {
    id: "run-1",
    sessionId: "session-1",
    workspaceRoot: "/repo",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    nextSequence: 1,
    events: [],
    eventsDropped: 0,
    artifacts: [
      {
        id: "artifact-1",
        runId: "run-1",
        kind: "changed_file",
        pathOrCommand: boundText("/repo/src/main.ts", 4_096),
        contentHash: "",
        boundedPreview: null,
      },
    ],
    artifactsDropped: 0,
    verdict: {
      runId: "run-1",
      status: "failed",
      changedFiles: {
        items: [boundText("/repo/src/main.ts", 4_096)],
        truncated: false,
        originalCount: 1,
      },
      diagnostics: { items: [], truncated: false, originalCount: 0 },
      checks: {
        items: [boundText("pnpm test (exit 1)", 2_048)],
        truncated: false,
        originalCount: 1,
      },
      unresolvedFailures: {
        items: [boundText("pnpm test: exited 1", 2_048)],
        truncated: false,
        originalCount: 1,
      },
    },
    ...overrides,
  };
}

describe("work packet compiler", () => {
  it("derives proof evidence, redacts secrets, and uses the active todo fallback", () => {
    const todos: Todo[] = [
      { id: "todo-1", title: "Run the focused suite.", status: "in_progress" },
    ];
    const input = compileWorkPacket({
      projectId: "/repo",
      sessionId: "session-1",
      originalGoal: "Finish auth refactor with API_KEY=super-secret-value.",
      acceptedInterpretation: "Keep the existing auth boundary.",
      status: "active",
      decisionsMade: ["Do not duplicate session state."],
      proofRuns: [
        run(),
        run({ id: "other-session", sessionId: "session-2" }),
        run({ id: "other-repo", workspaceRoot: "/elsewhere" }),
      ],
      todos,
    });

    expect(input.originalGoal).toBe("Finish auth refactor with API_KEY=<REDACTED>");
    expect(input.filesChanged).toEqual(["/repo/src/main.ts"]);
    expect(input.testsRun).toEqual(["pnpm test (exit 1)"]);
    expect(input.failingTests).toEqual(["pnpm test: exited 1"]);
    expect(input.proofRunIds).toEqual(["run-1"]);
    expect(input.nextSuggestedAction).toBe("Run the focused suite.");
  });

  it("renders deterministic bounded Markdown and the normal export path", () => {
    const packet = {
      ...compileWorkPacket({
        projectId: "/repo",
        sessionId: "session-1",
        originalGoal: "Resume the bounded refactor.",
        acceptedInterpretation: "Refresh repository evidence before editing.",
        status: "active" as const,
        nextSuggestedAction: "Call repo_context for current auth files.",
        proofRuns: [run()],
      }),
      id: "wp-1",
      createdAt: 1,
      updatedAt: 2,
    };

    const markdown = renderWorkPacketMarkdown(packet);
    expect(markdown).toContain("# Atlas Work Packet: wp-1");
    expect(markdown).toContain("## Resume Rule");
    expect(markdown).toContain("Refresh current repository evidence before editing");
    expect(suggestedWorkPacketPath(packet)).toBe(
      ".atlas/memory/work-packets/wp-1.md",
    );
    expect(resumeCapsule(packet)).toMatchObject({
      packetId: "wp-1",
      projectId: "/repo",
      status: "active",
      markdown,
    });
  });

  it("caps a resume capsule instead of injecting a raw transcript-sized payload", () => {
    const packet = {
      ...compileWorkPacket({
        projectId: "/repo",
        sessionId: "session-1",
        originalGoal: "x".repeat(20_000),
        acceptedInterpretation: "y".repeat(20_000),
        status: "active" as const,
        decisionsMade: Array.from({ length: 100 }, (_, index) =>
          `decision-${index}-${"z".repeat(500)}`,
        ),
        proofRuns: [],
      }),
      id: "wp-large",
      createdAt: 1,
      updatedAt: 2,
    };

    expect(new TextEncoder().encode(resumeCapsule(packet).markdown).byteLength).toBeLessThanOrEqual(
      8_192,
    );
    expect(packet.decisionsMade).toHaveLength(50);
  });
});
