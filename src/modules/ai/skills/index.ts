import { boundText } from "@/modules/ai/proof/contracts";
import { SKILL_CONTEXT_BYTES } from "@/modules/ai/skills/contracts";
import { TauriSkillPersistence } from "@/modules/ai/skills/persistence";
import { SkillRegistry } from "@/modules/ai/skills/registry";

export * from "@/modules/ai/skills/contracts";
export * from "@/modules/ai/skills/hooks";
export * from "@/modules/ai/skills/persistence";
export * from "@/modules/ai/skills/registry";

export const skillRegistry = new SkillRegistry(new TauriSkillPersistence());

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
