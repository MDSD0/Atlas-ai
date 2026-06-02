import { beforeEach, describe, expect, it, vi } from "vitest";

const { repoContext } = vi.hoisted(() => ({
  repoContext: vi.fn(),
}));

vi.mock("../lib/native", () => ({
  agentNative: { repoContext },
}));

import { useRealityStore } from "./realityStore";

describe("realityStore", () => {
  beforeEach(() => {
    repoContext.mockReset();
    useRealityStore.getState().reset();
  });

  it("requests a task-scoped projection", async () => {
    repoContext.mockResolvedValue({ root: "/repo" });

    await useRealityStore.getState().refresh("/repo", "fix calculateTotal");

    expect(repoContext).toHaveBeenCalledWith(
      "fix calculateTotal",
      "/repo",
      2000,
    );
    expect(useRealityStore.getState().task).toBe("fix calculateTotal");
    expect(useRealityStore.getState().status).toBe("ready");
  });

  it("does not apply an older response after the focused task changes", async () => {
    let releaseFirst: ((value: { root: string; task?: string }) => void) | undefined;
    repoContext
      .mockImplementationOnce(
        () =>
          new Promise<{ root: string; task?: string }>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ root: "/repo", task: "new" });

    const first = useRealityStore.getState().refresh("/repo", "old task");
    await useRealityStore.getState().refresh("/repo", "new task");
    releaseFirst?.({ root: "/repo", task: "old" });
    await first;

    expect(useRealityStore.getState().task).toBe("new task");
    expect(useRealityStore.getState().snapshot).toEqual({
      root: "/repo",
      task: "new",
    });
  });
});
