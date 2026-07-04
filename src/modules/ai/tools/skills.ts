import { tool } from "ai";
import { z } from "zod";
import {
  narrowSkillTools,
  skillRegistry,
  type AtlasLifecycleEvent,
} from "@/modules/ai/skills";

const lifecycleEvent = z.enum([
  "run_start",
  "prompt_submit",
  "before_tool",
  "after_tool",
  "verdict",
  "run_finish",
]);

export function buildSkillTools(availableTools: () => readonly string[]) {
  return {
    skill_list: tool({
      description: "List inspectable Atlas-local skill packages and enabled state.",
      inputSchema: z.object({}),
      execute: async () => ({
        policy:
          "skills are advisory and cannot bypass approvals, native authorization, secret guards, or proof recording",
        skills: await skillRegistry.list(),
      }),
    }),

    skill_inspect: tool({
      description: "Inspect one Atlas-local skill package by id.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const skill = await skillRegistry.inspect(id);
        return skill
          ? {
              ...skill,
              effectiveAllowedTools: narrowSkillTools(skill, availableTools()),
            }
          : { error: `skill not found: ${id}` };
      },
    }),

    skill_install: tool({
      description:
        "Install one explicit local prompt-only skill package. allowed_tools restricts the active toolbelt while this skill is enabled (union with any other enabled skill's restriction, including capability_search itself — omit it and the model can't unlock more tools mid-run to route around the restriction). hooks re-surfaces this skill's prompt as a reminder at the named lifecycle events. Skills still cannot bypass approvals, native authorization, secret guards, or proof recording.",
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        prompt: z.string().min(1),
        allowed_tools: z.array(z.string()).max(40).optional(),
        hooks: z.array(lifecycleEvent).max(6).optional(),
        enabled: z.boolean().optional(),
      }),
      needsApproval: true,
      execute: async ({
        name,
        description,
        prompt,
        allowed_tools,
        hooks,
        enabled,
      }) => {
        try {
          const skill = await skillRegistry.install({
            name,
            description,
            prompt,
            allowedTools: allowed_tools,
            hooks: hooks as AtlasLifecycleEvent[] | undefined,
            enabled,
          });
          return {
            ...skill,
            effectiveAllowedTools: narrowSkillTools(skill, availableTools()),
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    skill_enable: tool({
      description: "Enable one installed Atlas-local skill package by id.",
      inputSchema: z.object({ id: z.string().min(1) }),
      needsApproval: true,
      execute: async ({ id }) => ({
        id,
        enabled: await skillRegistry.setEnabled(id, true),
      }),
    }),

    skill_disable: tool({
      description: "Disable one installed Atlas-local skill package by id.",
      inputSchema: z.object({ id: z.string().min(1) }),
      needsApproval: true,
      execute: async ({ id }) => ({
        id,
        disabled: await skillRegistry.setEnabled(id, false),
      }),
    }),

    skill_remove: tool({
      description: "Remove one installed Atlas-local skill package by id.",
      inputSchema: z.object({ id: z.string().min(1) }),
      needsApproval: true,
      execute: async ({ id }) => ({
        id,
        removed: await skillRegistry.remove(id),
      }),
    }),
  } as const;
}

export function buildReadOnlySkillTools(availableTools: () => readonly string[]) {
  const tools = buildSkillTools(availableTools);
  return {
    skill_list: tools.skill_list,
    skill_inspect: tools.skill_inspect,
  } as const;
}
