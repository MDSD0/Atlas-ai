import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasToolProjectContext, ToolContext } from "../tools/tools";

const mocks = vi.hoisted(() => ({
  runAgentStream: vi.fn(),
  readFile: vi.fn().mockRejectedValue(new Error("no atlas.md")),
  buildMemorySurfaceContext: vi.fn().mockResolvedValue(null),
  buildPinnedMemoryContext: vi.fn().mockResolvedValue(null),
  buildActiveWorkPacketContext: vi.fn().mockResolvedValue(null),
  selectAgentRunPolicy: vi.fn().mockReturnValue({
    lane: "full",
    toolMode: "full",
    maxSteps: 10,
    reason: "test",
    includeAtlasMd: false,
    includeMemoryIndex: false,
    includeLocalMemory: false,
    includeWorkPacket: false,
    includeSkills: false,
    includeSimpleMem: false,
  }),
  finishSessionTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./agent", () => ({
  runAgentStream: mocks.runAgentStream,
}));
vi.mock("../config", () => ({
  getModel: () => ({ provider: "test-provider" }),
}));
vi.mock("./native", () => ({
  agentNative: { readFile: mocks.readFile },
}));
vi.mock("../tools/tools", () => ({
  atlasContextBlock: () => "",
}));
vi.mock("../proof", () => ({ proofJournal: {} }));
vi.mock("../proof/recorder", () => ({
  RunRecorder: { start: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../proof/runtime", () => ({ proofRunRegistry: { register: vi.fn() } }));
vi.mock("../store/proofStore", () => ({
  useProofStore: { getState: () => ({ setSummary: vi.fn() }) },
}));
vi.mock("../memory", () => ({
  buildPinnedMemoryContext: mocks.buildPinnedMemoryContext,
  buildMemorySurfaceContext: mocks.buildMemorySurfaceContext,
  mirrorProofRunToMemorySurface: vi.fn().mockResolvedValue(undefined),
  SimpleMemRunObserver: { start: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../skills", () => ({
  buildLocalSkillsContext: vi.fn().mockResolvedValue(null),
  getEnabledSkillToolRestriction: vi.fn().mockResolvedValue(null),
  lifecycleHookRunner: { run: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../workPackets", () => ({
  buildActiveWorkPacketContext: mocks.buildActiveWorkPacketContext,
}));
vi.mock("../contextLedger", () => ({
  contextLedger: { capture: vi.fn() },
}));
vi.mock("../checkpoints/checkpointStore", () => ({
  beginCheckpointTurn: vi.fn(),
}));
vi.mock("./lanePolicy", () => ({
  selectAgentRunPolicy: mocks.selectAgentRunPolicy,
}));
vi.mock("./sessions", () => ({
  normalizeMessageHistory: (m: unknown) => m,
}));
vi.mock("./runResources", () => ({
  beginRunResources: vi.fn(),
  killRunResourcesForSignal: vi.fn(),
  releaseRunResources: vi.fn(),
}));
vi.mock("../traces/sessionTrace", () => ({
  startSessionTrace: vi.fn().mockResolvedValue({}),
  finishSessionTrace: mocks.finishSessionTrace,
  recordSessionTraceEvent: vi.fn(),
  recordSessionTraceUsage: vi.fn(),
}));

import { createContextAwareTransport } from "./transport";

function project(workspaceRoot: string): AtlasToolProjectContext {
  return {
    projectId: workspaceRoot,
    workspaceRoot,
    projectName: workspaceRoot,
    activeFolder: null,
    activeFile: null,
    activeSelection: null,
    activeTerminalId: null,
    activeTerminalCwd: null,
    executionCwd: workspaceRoot,
    executionCwdMode: "workspace",
  };
}

describe("createContextAwareTransport — per-run frozen project context (F-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runAgentStream.mockResolvedValue({
      finishReason: Promise.resolve("stop"),
      toUIMessageStream: () => "stream",
    });
  });

  it("keeps a run's tool context bound to the project it started in, even if the live project changes mid-run", async () => {
    let liveProjectRoot = "/project-a";
    const toolContext: ToolContext = {
      getCwd: () => null,
      getWorkspaceRoot: () => liveProjectRoot,
      getProjectContext: () => project(liveProjectRoot),
      getTerminalContext: () => null,
      isActiveTerminalPrivate: () => false,
      injectIntoActivePty: () => false,
      openPreview: () => false,
      spawnAgent: () => null,
      readAgentOutput: () => null,
      readCache: new Map(),
      getSessionId: () => "session-1",
      getApprovalMode: () => "default",
    };

    const transport = createContextAwareTransport({
      getKeys: () => ({}) as never,
      toolContext,
      getModelId: () => "test-model" as never,
      getCustomInstructions: () => "",
      getAgentPersona: () => null,
      getLive: () => ({
        cwd: null,
        terminalPrivate: false,
        workspaceRoot: liveProjectRoot,
        activeFile: null,
        project: project(liveProjectRoot),
      }),
    });

    // Simulate a session/workspace switch happening between transport.run()
    // starting (which snapshots `live`) and the agent loop actually calling
    // a tool — this is the F-02 race: switching sessions must not redirect
    // an in-flight run's tool execution to the new project.
    mocks.runAgentStream.mockImplementationOnce(async (opts: { toolContext: ToolContext }) => {
      liveProjectRoot = "/project-b";
      expect(opts.toolContext.getProjectContext().workspaceRoot).toBe("/project-a");
      return { finishReason: Promise.resolve("stop"), toUIMessageStream: () => "stream" };
    });

    await transport.sendMessages({
      messages: [
        {
          id: "1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        } as never,
      ],
    });

    expect(mocks.runAgentStream).toHaveBeenCalledTimes(1);
  });
});

describe("createContextAwareTransport terminal run lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectAgentRunPolicy.mockReturnValue({
      lane: "full",
      toolMode: "full",
      maxSteps: 10,
      reason: "test",
      includeAtlasMd: false,
      includeMemoryIndex: false,
      includeLocalMemory: false,
      includeWorkPacket: false,
      includeSkills: false,
      includeSimpleMem: false,
    });
  });

  it("finalizes an aborted run once when the provider settles later", async () => {
    let settle!: (reason: string) => void;
    const finishReason = new Promise<string>((resolve) => {
      settle = resolve;
    });
    mocks.runAgentStream.mockResolvedValue({
      finishReason,
      toUIMessageStream: () => "stream",
    });
    const controller = new AbortController();
    const onCancel = vi.fn();
    const root = "/project-lifecycle";
    const toolContext: ToolContext = {
      getCwd: () => root,
      getWorkspaceRoot: () => root,
      getProjectContext: () => project(root),
      getTerminalContext: () => null,
      isActiveTerminalPrivate: () => false,
      injectIntoActivePty: () => false,
      openPreview: () => false,
      spawnAgent: () => null,
      readAgentOutput: () => null,
      readCache: new Map(),
      getSessionId: () => "session-lifecycle",
      getApprovalMode: () => "default",
    };
    const transport = createContextAwareTransport({
      getKeys: () => ({}) as never,
      toolContext,
      getModelId: () => "test-model" as never,
      getCustomInstructions: () => "",
      getAgentPersona: () => null,
      getLive: () => ({
        cwd: root,
        terminalPrivate: false,
        workspaceRoot: root,
        activeFile: null,
        project: project(root),
      }),
      onCancel,
    });

    await transport.sendMessages({
      messages: [
        { id: "1", role: "user", parts: [{ type: "text", text: "hello" }] } as never,
      ],
      abortSignal: controller.signal,
    });
    controller.abort();
    await vi.waitFor(() =>
      expect(mocks.finishSessionTrace).toHaveBeenCalledTimes(1),
    );
    settle("stop");
    await Promise.resolve();
    await Promise.resolve();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mocks.finishSessionTrace).toHaveBeenCalledTimes(1);
    expect(mocks.finishSessionTrace.mock.calls[0][1]).toBe("cancelled");
  });
});

describe("createContextAwareTransport — manifest instead of eager context injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runAgentStream.mockResolvedValue({
      finishReason: Promise.resolve("stop"),
      toUIMessageStream: () => "stream",
    });
    mocks.selectAgentRunPolicy.mockReturnValue({
      lane: "full",
      toolMode: "full",
      maxSteps: 10,
      reason: "test",
      includeAtlasMd: true,
      includeMemoryIndex: true,
      includeLocalMemory: true,
      includeWorkPacket: true,
      includeSkills: false,
      includeSimpleMem: false,
    });
  });

  function toolContextFor(workspaceRoot: string): ToolContext {
    return {
      getCwd: () => null,
      getWorkspaceRoot: () => workspaceRoot,
      getProjectContext: () => project(workspaceRoot),
      getTerminalContext: () => null,
      isActiveTerminalPrivate: () => false,
      injectIntoActivePty: () => false,
      openPreview: () => false,
      spawnAgent: () => null,
      readAgentOutput: () => null,
      readCache: new Map(),
      getSessionId: () => "session-1",
      getApprovalMode: () => "default",
    };
  }

  it("replaces eager ATLAS.md/memory/work-packet content with a short manifest pointing at the pull-side tools", async () => {
    const atlasMdText = "x".repeat(500);
    mocks.readFile.mockResolvedValue({ kind: "text", content: atlasMdText });
    mocks.buildMemorySurfaceContext.mockResolvedValue("y".repeat(200));
    mocks.buildPinnedMemoryContext.mockResolvedValue("z".repeat(100));
    mocks.buildActiveWorkPacketContext.mockResolvedValue("packet contents");

    const transport = createContextAwareTransport({
      getKeys: () => ({}) as never,
      toolContext: toolContextFor("/project-a"),
      getModelId: () => "test-model" as never,
      getCustomInstructions: () => "",
      getAgentPersona: () => null,
      getLive: () => ({
        cwd: null,
        terminalPrivate: false,
        workspaceRoot: "/project-a",
        activeFile: null,
        project: project("/project-a"),
      }),
    });

    await transport.sendMessages({
      messages: [
        { id: "1", role: "user", parts: [{ type: "text", text: "hello" }] } as never,
      ],
    });

    const opts = mocks.runAgentStream.mock.calls[0][0] as {
      contextLedger?: { projectSources: { id: string; content: string | null }[] };
    };
    const sources = opts.contextLedger!.projectSources;
    const byId = Object.fromEntries(sources.map((s) => [s.id, s.content]));

    // Raw content must never reach the prompt directly...
    expect(byId.atlas_md).not.toContain(atlasMdText);
    expect(byId.memory_index).not.toContain("y".repeat(200));
    expect(byId.local_memory).not.toContain("z".repeat(100));
    expect(byId.active_work_packet).not.toContain("packet contents");
    // ...but each manifest line still points at the tool that can pull it.
    expect(byId.atlas_md).toContain('read_file("ATLAS.md")');
    expect(byId.memory_index).toMatch(/memory_status|memory_recall/);
    expect(byId.local_memory).toContain("memory_recall");
    expect(byId.active_work_packet).toContain("work_packet_resume");
  });

  it("emits no manifest line when a source doesn't exist", async () => {
    // Distinct workspace root: readAtlasMd caches by workspaceRoot for 30s, so
    // reusing "/project-a" here could see the previous test's cached content.
    mocks.readFile.mockRejectedValue(new Error("no atlas.md"));
    mocks.buildMemorySurfaceContext.mockResolvedValue(null);
    mocks.buildPinnedMemoryContext.mockResolvedValue(null);
    mocks.buildActiveWorkPacketContext.mockResolvedValue(null);

    const transport = createContextAwareTransport({
      getKeys: () => ({}) as never,
      toolContext: toolContextFor("/project-c"),
      getModelId: () => "test-model" as never,
      getCustomInstructions: () => "",
      getAgentPersona: () => null,
      getLive: () => ({
        cwd: null,
        terminalPrivate: false,
        workspaceRoot: "/project-c",
        activeFile: null,
        project: project("/project-c"),
      }),
    });

    await transport.sendMessages({
      messages: [
        { id: "1", role: "user", parts: [{ type: "text", text: "hello" }] } as never,
      ],
    });

    const opts = mocks.runAgentStream.mock.calls[0][0] as {
      contextLedger?: { projectSources: { id: string; content: string | null }[] };
    };
    const sources = opts.contextLedger!.projectSources;
    const byId = Object.fromEntries(sources.map((s) => [s.id, s.content]));
    expect(byId.atlas_md).toBeNull();
    expect(byId.memory_index).toBeNull();
    expect(byId.local_memory).toBeNull();
    expect(byId.active_work_packet).toBeNull();
  });
});
