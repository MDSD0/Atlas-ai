import { tool } from "ai";
import { z } from "zod";
import { proofJournal } from "@/modules/ai/proof";
import { getTodos } from "@/modules/ai/store/todoStore";
import {
  compileWorkPacket,
  inspectableWorkPacket,
  workPacketRegistry,
} from "@/modules/ai/workPackets";
import {
  checkFileAccessAllowed,
  type ToolContext,
} from "@/modules/ai/tools/context";

const status = z.enum(["active", "blocked", "complete"]);

function projectRoot(ctx: ToolContext): string | { error: string } {
  const project = ctx.getProjectContext();
  const blocked = checkFileAccessAllowed(project);
  return blocked ?? (project.workspaceRoot as string);
}

function sessionId(ctx: ToolContext): string | { error: string } {
  return ctx.getSessionId() ?? { error: "no active session; cannot create work packet" };
}

export function buildWorkPacketTools(ctx: ToolContext) {
  return {
    work_packet_generate: tool({
      description:
        "Generate one bounded resumable work packet for the active session. Atlas derives changed files, checks, failures, and proof references from its proof journal. This persists app-local state only. To materialize the returned Markdown under .atlas/memory/work-packets/, use the normal approval-gated write_file tool.",
      inputSchema: z.object({
        original_goal: z.string().min(1),
        accepted_interpretation: z.string().min(1),
        status,
        decisions_made: z.array(z.string()).max(50).optional(),
        unresolved_blockers: z.array(z.string()).max(50).optional(),
        next_suggested_action: z.string().optional(),
      }),
      needsApproval: true,
      execute: async ({
        original_goal,
        accepted_interpretation,
        decisions_made,
        unresolved_blockers,
        next_suggested_action,
        ...input
      }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        const activeSessionId = sessionId(ctx);
        if (typeof activeSessionId !== "string") return activeSessionId;
        try {
          const packet = await workPacketRegistry.create(
            compileWorkPacket({
              projectId: root,
              sessionId: activeSessionId,
              originalGoal: original_goal,
              acceptedInterpretation: accepted_interpretation,
              status: input.status,
              decisionsMade: decisions_made,
              unresolvedBlockers: unresolved_blockers,
              nextSuggestedAction: next_suggested_action,
              proofRuns: await proofJournal.restore(),
              todos: getTodos(activeSessionId),
            }),
          );
          return inspectableWorkPacket(packet);
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    work_packet_list: tool({
      description:
        "List compact resumable work packets for the bound project. Packets are advisory; refresh repository evidence before editing.",
      inputSchema: z.object({}),
      execute: async () => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        return {
          packets: (await workPacketRegistry.list(root)).map((packet) => ({
            id: packet.id,
            sessionId: packet.sessionId,
            status: packet.status,
            originalGoal: packet.originalGoal,
            nextSuggestedAction: packet.nextSuggestedAction,
            proofRunIds: packet.proofRunIds,
            updatedAt: packet.updatedAt,
          })),
        };
      },
    }),

    work_packet_inspect: tool({
      description:
        "Inspect one Atlas work packet plus deterministic Markdown and its optional repository export path.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        const packet = await workPacketRegistry.get(root, id);
        return packet ? inspectableWorkPacket(packet) : { error: "work packet not found" };
      },
    }),

    work_packet_resume: tool({
      description:
        "Load one bounded prompt-ready work packet capsule. If id is omitted, load the latest active packet for the project. Always call repo_context before editing resumed work.",
      inputSchema: z.object({ id: z.string().min(1).optional() }),
      execute: async ({ id }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        return (
          (await workPacketRegistry.resume(root, id)) ?? {
            error: id ? "work packet not found" : "no active work packet",
          }
        );
      },
    }),

    work_packet_delete: tool({
      description: "Delete one app-local Atlas work packet.",
      inputSchema: z.object({ id: z.string().min(1) }),
      needsApproval: true,
      execute: async ({ id }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        return { id, deleted: await workPacketRegistry.delete(root, id) };
      },
    }),
  } as const;
}
export function buildReadOnlyWorkPacketTools(ctx: ToolContext) {
  const tools = buildWorkPacketTools(ctx);
  return {
    work_packet_list: tools.work_packet_list,
    work_packet_inspect: tools.work_packet_inspect,
    work_packet_resume: tools.work_packet_resume,
  } as const;
}
