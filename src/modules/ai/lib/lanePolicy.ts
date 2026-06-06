import type { AblationMode } from "../tools/tools";

export type AgentRunLane = "full" | "static_web_app";

export type AgentRunPolicy = {
  lane: AgentRunLane;
  toolMode: AblationMode;
  includeAtlasMd: boolean;
  includeMemoryIndex: boolean;
  includeLocalMemory: boolean;
  includeSimpleMem: boolean;
  includeWorkPacket: boolean;
  includeSkills: boolean;
  /** Lane-level ceiling on agent steps. Combined (min) with the model budget. */
  maxSteps?: number;
  reason: string;
};

export type AgentRunPolicyInput = {
  prompt: string;
  planMode: boolean;
  activeFile: string | null;
};

const FULL_POLICY: AgentRunPolicy = {
  lane: "full",
  toolMode: "full",
  includeAtlasMd: true,
  includeMemoryIndex: true,
  includeLocalMemory: true,
  includeSimpleMem: true,
  includeWorkPacket: true,
  includeSkills: true,
  reason: "default full harness lane",
};

const STATIC_WEB_APP_POLICY: AgentRunPolicy = {
  lane: "static_web_app",
  toolMode: "simple",
  includeAtlasMd: true,
  includeMemoryIndex: false,
  includeLocalMemory: false,
  includeSimpleMem: false,
  includeWorkPacket: false,
  includeSkills: false,
  maxSteps: 12,
  reason: "static HTML/CSS/JS flow uses the small no-todo toolbelt",
};

export function selectAgentRunPolicy(
  input: AgentRunPolicyInput,
): AgentRunPolicy {
  if (input.planMode) {
    return FULL_POLICY;
  }

  const prompt = normalizePolicyText(input.prompt);
  if (looksLikeStaticWebFlow(prompt, input.activeFile)) {
    return STATIC_WEB_APP_POLICY;
  }

  return FULL_POLICY;
}

function normalizePolicyText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function looksLikeStaticWebFlow(
  prompt: string,
  activeFile: string | null,
): boolean {
  const activePath = activeFile?.toLowerCase().replace(/\\/g, "/") ?? "";
  const activeStaticFile =
    activePath.endsWith(".html") ||
    activePath.endsWith(".css") ||
    activePath.endsWith(".js");

  const asksToAct =
    /\b(build|create|make|write|implement|generate|continue|run|open|preview|serve|launch)\b/.test(
      prompt,
    ) || prompt.includes("open command");
  if (!asksToAct) return false;

  const mentionsStaticStack =
    /\b(html|css|javascript|js)\b/.test(prompt) ||
    /\b(index\.html|style\.css|script\.js)\b/.test(prompt);
  const mentionsWebArtifact =
    /\b(calculator|web app|website|site|page|landing page|static app|static site)\b/.test(
      prompt,
    );
  const asksToRunStatic =
    /\b(run|open|preview|serve|launch)\b/.test(prompt) ||
    prompt.includes("open command");

  return (
    (mentionsStaticStack && mentionsWebArtifact) ||
    (activeStaticFile && (mentionsStaticStack || asksToRunStatic))
  );
}

