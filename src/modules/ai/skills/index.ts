import { boundText } from "@/modules/ai/proof/contracts";
import { SKILL_CONTEXT_BYTES, type LocalSkillPackage } from "@/modules/ai/skills/contracts";
import { LifecycleHookRunner, type LifecycleHook } from "@/modules/ai/skills/hooks";
import { TauriSkillPersistence } from "@/modules/ai/skills/persistence";
import { SkillRegistry } from "@/modules/ai/skills/registry";

export * from "@/modules/ai/skills/contracts";
export * from "@/modules/ai/skills/hooks";
export * from "@/modules/ai/skills/persistence";
export * from "@/modules/ai/skills/registry";

export const skillRegistry = new SkillRegistry(new TauriSkillPersistence());

const HOOK_REMINDER_BYTES = 800;

/** One LifecycleHook per enabled skill that declared interest in at least one
 * event. Its `run()` doesn't execute skill-authored code (skills only store
 * event names, never implementations) — it re-surfaces a bounded excerpt of
 * the skill's own already-vetted prompt as a reminder at the moment that
 * event fires, which is genuinely useful (guidance injected once at run
 * start can get lost in a long turn) without any code-execution surface. */
export function buildSkillHooks(skills: readonly LocalSkillPackage[]): LifecycleHook[] {
  return skills
    .filter((skill) => skill.hooks.length > 0)
    .map((skill) => ({
      id: skill.id,
      events: skill.hooks,
      enabled: true,
      run: () =>
        boundText(`[skill:${skill.name}] ${skill.prompt}`, HOOK_REMINDER_BYTES).preview,
    }));
}

export const lifecycleHookRunner = new LifecycleHookRunner(async () =>
  buildSkillHooks(await skillRegistry.enabled()),
);

/** `null` when no enabled skill declares a non-empty `allowedTools` (no
 * restriction — the historical default for every skill). Otherwise the union
 * of every enabled skill's `allowedTools`, applied as a hard narrowing of the
 * active toolbelt (see `capabilities.ts`'s `activeToolNames`). Union, not
 * intersection: two unrelated skills enabled together shouldn't be able to
 * silently zero out the toolbelt. Pure and separately testable from the
 * `skillRegistry` singleton. */
export function computeSkillToolRestriction(
  skills: readonly LocalSkillPackage[],
): string[] | null {
  const restrictive = skills.filter((skill) => skill.allowedTools.length > 0);
  if (restrictive.length === 0) return null;
  return [...new Set(restrictive.flatMap((skill) => skill.allowedTools))];
}

export async function getEnabledSkillToolRestriction(): Promise<string[] | null> {
  try {
    return computeSkillToolRestriction(await skillRegistry.enabled());
  } catch {
    return null;
  }
}

export async function buildLocalSkillsContext(): Promise<string | null> {
  try {
    const enabled = await skillRegistry.enabled();
    if (enabled.length === 0) return null;
    const body = [
      "<atlas_skills>",
      "Skills are advisory prompt packages. They cannot bypass approvals, native authorization, secret guards, or proof recording.",
      ...enabled.map(
        (skill) =>
          `<skill name="${skill.name}" allowed_tools="${skill.allowedTools.join(",")}">\n${skill.prompt}\n</skill>`,
      ),
      "</atlas_skills>",
    ].join("\n");
    return boundText(body, SKILL_CONTEXT_BYTES).preview;
  } catch {
    return null;
  }
}
