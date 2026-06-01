import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspaceAuthorizeAgentProject: vi.fn(),
  storeGet: vi.fn(),
  storeSave: vi.fn(),
  storeSet: vi.fn(),
}));

vi.mock("@/modules/ai/lib/native", () => ({
  native: {
    workspaceAuthorizeAgentProject: mocks.workspaceAuthorizeAgentProject,
  },
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    get(key: string) {
      return mocks.storeGet(key);
    }

    save() {
      return mocks.storeSave();
    }

    set(key: string, value: unknown) {
      return mocks.storeSet(key, value);
    }
  },
}));

import { useWorkspaceStore } from "./workspaceStore";

describe("workspace binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      projectId: "/old",
      projectName: "old",
      workspaceRoot: "/old",
      recentWorkspaces: [{ path: "/old", name: "old", addedAt: 1 }],
    });
  });

  it("binds only after native authorization succeeds", async () => {
    let authorize: (() => void) | undefined;
    mocks.workspaceAuthorizeAgentProject.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          authorize = () => resolve("/host-canonical/repo");
        }),
    );

    const binding = useWorkspaceStore.getState().setWorkspaceRoot("/repo");

    expect(useWorkspaceStore.getState().workspaceRoot).toBe("/old");
    authorize?.();
    await binding;

    expect(useWorkspaceStore.getState()).toMatchObject({
      projectId: "/repo",
      projectName: "repo",
      workspaceRoot: "/repo",
    });
    expect(useWorkspaceStore.getState().recentWorkspaces[0]).toMatchObject({
      path: "/repo",
      name: "repo",
    });
  });

  it("preserves the previous binding and recents after native rejection", async () => {
    mocks.workspaceAuthorizeAgentProject.mockRejectedValue("native authorization denied");

    await expect(
      useWorkspaceStore.getState().setWorkspaceRoot("/denied"),
    ).rejects.toThrow(
      'Unable to open workspace "/denied": native authorization denied',
    );

    expect(useWorkspaceStore.getState()).toMatchObject({
      projectId: "/old",
      projectName: "old",
      workspaceRoot: "/old",
      recentWorkspaces: [{ path: "/old", name: "old", addedAt: 1 }],
    });
    expect(mocks.storeSet).not.toHaveBeenCalled();
    expect(mocks.storeSave).not.toHaveBeenCalled();
  });
});
