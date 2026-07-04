import { boundText } from "@/modules/ai/proof/contracts";

export const SKILL_STORE_PATH = "atlas-ai-skills.json";
export const SKILL_PACKAGES = 100;
export const SKILL_NAME_BYTES = 64;
export const SKILL_DESCRIPTION_BYTES = 1024;
export const SKILL_PROMPT_BYTES = 12_000;
export const SKILL_CONTEXT_BYTES = 20_000;
export const SKILL_TOOLS = 40;

const SKILL_NAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;

export type AtlasLifecycleEvent =
  | "run_start"
  | "prompt_submit"
  | "before_tool"
  | "after_tool"
  | "verdict"
  | "run_finish";

export type LocalSkillPackage = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  allowedTools: string[];
  hooks: AtlasLifecycleEvent[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type InstallSkillInput = {
  name: string;
  description: string;
  prompt: string;
  allowedTools?: readonly string[];
  hooks?: readonly AtlasLifecycleEvent[];
  enabled?: boolean;
};

function bounded(value: string, maxBytes: number): string {
  return boundText(value.trim(), maxBytes).preview;
}

export function validateSkillInput(input: InstallSkillInput): Omit<
  LocalSkillPackage,
  "id" | "createdAt" | "updatedAt"
> {
  const name = bounded(input.name, SKILL_NAME_BYTES);
  if (!SKILL_NAME_RE.test(name) || name.includes("--")) {
    throw new Error(
      "skill name must use lowercase letters, numbers, and single hyphens",
    );
  }
  const description = bounded(input.description, SKILL_DESCRIPTION_BYTES);
  if (!description) throw new Error("skill description cannot be empty");
  const prompt = bounded(input.prompt, SKILL_PROMPT_BYTES);
  if (!prompt) throw new Error("skill prompt cannot be empty");
  const allowedTools = [
    ...new Set((input.allowedTools ?? []).map((tool) => tool.trim())),
  ];
  if (
    allowedTools.length > SKILL_TOOLS ||
    allowedTools.some((tool) => !TOOL_NAME_RE.test(tool))
  ) {
    throw new Error("skill allowedTools contains an invalid tool name");
  }
  return {
    name,
    description,
    prompt,
    allowedTools,
    hooks: [...new Set(input.hooks ?? [])],
    enabled: input.enabled ?? false,
  };
}

export function narrowSkillTools(
  skill: Pick<LocalSkillPackage, "allowedTools">,
  availableTools: readonly string[],
): string[] {
  const available = new Set(availableTools);
  return skill.allowedTools.filter((tool) => available.has(tool));
}
