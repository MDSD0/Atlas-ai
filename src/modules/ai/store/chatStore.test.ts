import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/sessions", () => ({
  deleteSessionData: vi.fn().mockResolvedValue(undefined),
  bindSessionToWorkspace: (meta: unknown, workspaceRoot: string | null) => ({
    ...(meta as Record<string, unknown>),
    projectId: workspaceRoot,
    projectName: workspaceRoot ?? "Unbound",
    workspaceRoot,
  }),
  deriveTitle: () => "New chat",
  loadAll: vi.fn().mockResolvedValue({ sessions: [], activeId: null }),
  loadMessages: vi.fn().mockResolvedValue(null),
  newSessionId: (() => {
    let n = 0;
    return () => `session-${++n}`;
  })(),
  saveActiveId: vi.fn().mockResolvedValue(undefined),
  saveMessages: vi.fn().mockResolvedValue(undefined),
  saveSessionsList: vi.fn().mockResolvedValue(undefined),
  normalizeMessageHistory: (m: unknown) => m,
}));
vi.mock("../lib/modelPrefs", () => ({ pushRecentModel: vi.fn() }));
vi.mock("../lib/transport", () => ({
  createContextAwareTransport: () => ({ sendMessages: vi.fn(), reconnectToStream: vi.fn() }),
}));
vi.mock("../lib/errors", () => ({
  formatAgentError: (e: unknown) => String(e),
  isTransientStreamError: () => false,
}));
vi.mock("../lib/runResources", () => ({ killRunResourcesForSession: vi.fn() }));
vi.mock("@/modules/workspace/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: () => ({
      workspaceRoot: null,
      setWorkspaceRoot: vi.fn().mockResolvedValue(undefined),
      clearWorkspace: vi.fn(),
    }),
  },
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: { getState: () => ({ customInstructions: "" }) },
}));
vi.mock("../lib/agents", () => ({ BUILTIN_AGENTS: [{ id: "default", name: "Atlas", instructions: "" }] }));
vi.mock("./agentsStore", () => ({
  useAgentsStore: { getState: () => ({ activeId: "default", customAgents: [] }) },
}));
vi.mock("./planStore", () => ({
  usePlanStore: { getState: () => ({ isActive: () => false }) },
}));
vi.mock("./todoStore", () => ({
  useTodosStore: {
    getState: () => ({
      completeTerminalInProgressTodo: vi.fn(),
      pauseInProgressTodo: vi.fn(),
      clearSession: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { useChatStore } from "./chatStore";

describe("F-03: per-session agent run state", () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      agentMeta: useChatStore.getState().agentMeta,
      approvalMode: "default",
      approvalResponder: null,
    });
  });

  // switchSession resolves asynchronously (it loads persisted messages and
  // restores the workspace before flipping state), so tests await the
  // observable effect rather than assuming synchronous completion.
  async function switchAndWait(id: string) {
    useChatStore.getState().switchSession(id);
    await vi.waitFor(() => {
      expect(useChatStore.getState().activeSessionId).toBe(id);
    });
  }

  it("does not let a background session's patchAgentMeta corrupt the active session's mirrored state", () => {
    const a = useChatStore.getState().newSession();
    const b = useChatStore.getState().newSession(); // b is now active
    expect(useChatStore.getState().activeSessionId).toBe(b);

    useChatStore.getState().patchAgentMeta(a, { status: "streaming", step: "Reading file" });

    // Active session (b) must still show idle — a's write must not leak.
    expect(useChatStore.getState().agentMeta.status).toBe("idle");
    expect(useChatStore.getState().agentMeta.step).toBeNull();
  });

  it("restores a session's own state on switch instead of resetting it to idle", async () => {
    const a = useChatStore.getState().newSession();
    useChatStore.getState().patchAgentMeta(a, { status: "streaming", step: "Running tests" });
    useChatStore.getState().newSession(); // switches active away, resets new session to idle
    expect(useChatStore.getState().agentMeta.status).toBe("idle");

    await switchAndWait(a);

    expect(useChatStore.getState().agentMeta.status).toBe("streaming");
    expect(useChatStore.getState().agentMeta.step).toBe("Running tests");
  });

  it("routes respondToApproval through the correct session's responder after switching back", async () => {
    const a = useChatStore.getState().newSession();
    const bResponses: Array<{ id: string; approved: boolean }> = [];
    const aResponses: Array<{ id: string; approved: boolean }> = [];
    useChatStore.getState().setApprovalResponder(a, (id, approved) => aResponses.push({ id, approved }));

    const b = useChatStore.getState().newSession();
    useChatStore.getState().setApprovalResponder(b, (id, approved) => bResponses.push({ id, approved }));

    // Approving while B is active must go to B's responder, not A's.
    useChatStore.getState().respondToApproval("approval-1", true);
    expect(bResponses).toEqual([{ id: "approval-1", approved: true }]);
    expect(aResponses).toEqual([]);

    // Switch back to A — A's responder must still be intact (not orphaned).
    await switchAndWait(a);
    useChatStore.getState().respondToApproval("approval-2", false);
    expect(aResponses).toEqual([{ id: "approval-2", approved: false }]);
    expect(bResponses).toEqual([{ id: "approval-1", approved: true }]);
  });

  it("keeps approvalMode scoped per session across a switch", async () => {
    const a = useChatStore.getState().newSession();
    useChatStore.getState().setApprovalMode("full");
    expect(useChatStore.getState().approvalMode).toBe("full");

    useChatStore.getState().newSession();
    expect(useChatStore.getState().approvalMode).toBe("default");

    await switchAndWait(a);
    expect(useChatStore.getState().approvalMode).toBe("full");
  });

  it("routes approvals correctly across 3+ concurrent sessions, not just 2 (edge case)", async () => {
    const responses: Record<string, Array<{ id: string; approved: boolean }>> = {};
    const ids = ["a", "b", "c"].map(() => useChatStore.getState().newSession());
    const [a, b, c] = ids;
    for (const id of ids) {
      responses[id] = [];
      useChatStore.getState().setApprovalResponder(id, (approvalId, approved) =>
        responses[id].push({ id: approvalId, approved }),
      );
    }
    // c is active (last created). Approve while active on each in turn.
    useChatStore.getState().respondToApproval("c-approval", true);
    expect(responses[c]).toEqual([{ id: "c-approval", approved: true }]);

    await switchAndWait(a);
    useChatStore.getState().respondToApproval("a-approval", false);
    expect(responses[a]).toEqual([{ id: "a-approval", approved: false }]);

    await switchAndWait(b);
    useChatStore.getState().respondToApproval("b-approval", true);
    expect(responses[b]).toEqual([{ id: "b-approval", approved: true }]);

    // Every session's responder only ever received its own approval.
    expect(responses[a]).toHaveLength(1);
    expect(responses[b]).toHaveLength(1);
    expect(responses[c]).toHaveLength(1);
  });

  it("deleting the active session restores the next session's real state, not IDLE_META (edge case)", async () => {
    const a = useChatStore.getState().newSession();
    useChatStore.getState().patchAgentMeta(a, { status: "streaming", step: "a running" });
    const b = useChatStore.getState().newSession(); // b active
    useChatStore.getState().patchAgentMeta(b, { status: "error", error: "b failed earlier" });

    await switchAndWait(a); // a active again, streaming
    expect(useChatStore.getState().agentMeta.status).toBe("streaming");

    // Deleting the currently-active session (a) must fall back to the
    // remaining session's OWN persisted state (b's "error"), not silently
    // reset to idle and not leak a's leftover "streaming" state either.
    useChatStore.getState().deleteSession(a);
    await vi.waitFor(() => {
      expect(useChatStore.getState().activeSessionId).toBe(b);
    });
    expect(useChatStore.getState().agentMeta.status).toBe("error");
    expect(useChatStore.getState().agentMeta.error).toBe("b failed earlier");
    expect(useChatStore.getState().sessions.some((s) => s.id === a)).toBe(false);
  });
});
