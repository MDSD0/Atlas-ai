import { agentNative } from "@/modules/ai/lib/native";
import { localRecords } from "@/modules/ai/memory";
import { mcpRegistry } from "@/modules/ai/mcp";
import { skillRegistry } from "@/modules/ai/skills";
import { useProofStore } from "@/modules/ai/store/proofStore";
import type { ToolContext } from "@/modules/ai/tools/context";
import { checkFileAccessAllowed } from "@/modules/ai/tools/context";
import { summarizeRepoStatus } from "@/modules/ai/tools/reality";

export type ContextInspectorSources = {
  reality: (root: string, task: string) => Promise<unknown>;
  lsp: (root: string, activeFile?: string) => Promise<unknown>;
  memory: (root: string) => Promise<unknown>;
  skills: () => Promise<unknown>;
  mcp: () => Promise<unknown>;
  proof: (sessionId: string | null) => unknown;
};

const defaultSources: ContextInspectorSources = {
  reality: async (root, task) =>
    summarizeRepoStatus(await agentNative.repoContext(task, root, 128)),
  lsp: (root, activeFile) => agentNative.lspStatus(root, activeFile),
  memory: (root) => localRecords.stats(root),
  skills: async () => {
    const packages = await skillRegistry.list();
    return {
      installed: packages.length,
      enabled: packages.filter((skill) => skill.enabled).map((skill) => skill.name),
    };
  },
  mcp: () => mcpRegistry.status(),
  proof: (sessionId) =>
    sessionId ? (useProofStore.getState().latestBySession[sessionId] ?? null) : null,
};

async function settle(name: string, load: () => Promise<unknown>) {
  try {
    return { name, status: "ok" as const, value: await load() };
  } catch (error) {
    return { name, status: "degraded" as const, error: String(error) };
  }
}

export async function inspectContext(
  ctx: ToolContext,
  task: string,
  sources: ContextInspectorSources = defaultSources,
) {
  const project = ctx.getProjectContext();
  const blocked = checkFileAccessAllowed(project);
  if (blocked) return blocked;
  const root = project.workspaceRoot as string;
  const [reality, lsp, memory, skills, mcp] = await Promise.all([
    settle("reality", () => sources.reality(root, task)),
    settle("lsp", () => sources.lsp(root, project.activeFile ?? undefined)),
    settle("memory", () => sources.memory(root)),
    settle("skills", sources.skills),
    settle("mcp", sources.mcp),
  ]);
  return {
    project: { root, activeFile: project.activeFile, sessionId: ctx.getSessionId() },
    sections: { reality, lsp, memory, skills, mcp },
    proof: sources.proof(ctx.getSessionId()),
    degraded: [reality, lsp, memory, skills, mcp]
      .filter((section) => section.status === "degraded")
      .map((section) => section.name),
    policy: "current repository evidence outranks historical memory; inspector reads existing subsystem boundaries on demand",
  };
}
