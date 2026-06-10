import type { AblationMode } from "../tools/tools";

export type AgentRunLane = "full";

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

/**
 * Every run uses the full harness lane. There was once a narrowed
 * `static_web_app` lane that keyed off prompt text and the open editor tab to
 * thin context for calculator-grade web tasks. It mis-fired in practice — a
 * stale `index.html` left open in the editor silently downgraded unrelated
 * projects (e.g. a Python CLI), stripping tools and capping steps. Repo truth
 * beats a brittle binary heuristic, so the lane was removed. The input shape is
 * retained so callers don't churn.
 */
export function selectAgentRunPolicy(
  _input: AgentRunPolicyInput,
): AgentRunPolicy {
  return FULL_POLICY;
}
