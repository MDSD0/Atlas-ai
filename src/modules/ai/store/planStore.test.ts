import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDir: vi.fn(),
  canonicalize: vi.fn(async (path: string) => path),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  lspDiagnostics: vi.fn(),
}));

vi.mock("../lib/native", () => ({
  agentNative: {
    canonicalize: mocks.canonicalize,
    createDir: mocks.createDir,
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
    lspDiagnostics: mocks.lspDiagnostics,
  },
}));

import { fingerprintText, STALE_READ_ERROR } from "../tools/fingerprint";
import { usePlanStore, type QueuedEdit } from "./planStore";

function queuedEdit(originalContent: string): QueuedEdit {
  return {
    id: "q-1",
    kind: "edit",
    path: "/repo/value.ts",
    projectRoot: "/repo",
    originalContent,
    proposedContent: "export const VALUE = 3;\n",
    isNewFile: false,
    expectedFingerprint: fingerprintText(originalContent),
  };
}

describe("plan edit freshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlanStore.setState({ active: false, queue: [], sessions: {} });
    mocks.lspDiagnostics.mockResolvedValue({
      provider: "typescript",
      status: "fresh",
      file: "/repo/value.ts",
      diagnostics: [],
      waited_ms: 1,
      detail: "fresh",
    });
  });

  it("rejects a changed file before applying a reviewed edit", async () => {
    usePlanStore.getState().enqueue(queuedEdit("export const VALUE = 1;\n"));
    mocks.readFile.mockResolvedValue({
      kind: "text",
      content: "export const VALUE = 2;\n",
      size: 24,
    });

    await expect(usePlanStore.getState().applyAll()).resolves.toEqual([
      { id: "q-1", ok: false, error: `Error: ${STALE_READ_ERROR}` },
    ]);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("applies a reviewed edit when the source fingerprint is unchanged", async () => {
    const original = "export const VALUE = 1;\n";
    usePlanStore.getState().enqueue(queuedEdit(original));
    mocks.readFile.mockResolvedValue({
      kind: "text",
      content: original,
      size: fingerprintText(original).size,
    });
    mocks.writeFile.mockResolvedValue(undefined);

    await expect(usePlanStore.getState().applyAll()).resolves.toEqual([
      { id: "q-1", ok: true },
    ]);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      "/repo/value.ts",
      "export const VALUE = 3;\n",
      "/repo",
    );
    expect(mocks.lspDiagnostics).toHaveBeenCalledWith(
      "/repo",
      "/repo/value.ts",
    );
  });
});

describe("plan per-file accept (applySome)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlanStore.setState({ active: false, queue: [], sessions: {} });
    mocks.lspDiagnostics.mockResolvedValue({
      provider: "typescript",
      status: "fresh",
      file: "x",
      diagnostics: [],
      waited_ms: 1,
      detail: "fresh",
    });
    mocks.createDir.mockResolvedValue(undefined);
  });

  function dirEdit(id: string, path: string): QueuedEdit {
    return {
      id,
      kind: "create_directory",
      path,
      projectRoot: "/repo",
      originalContent: "",
      proposedContent: "",
      isNewFile: true,
    };
  }

  it("applies only the selected edit and keeps the rest queued", async () => {
    usePlanStore.getState().enqueue(dirEdit("q-1", "/repo/a"));
    usePlanStore.getState().enqueue(dirEdit("q-2", "/repo/b"));

    await expect(usePlanStore.getState().applySome(["q-1"])).resolves.toEqual([
      { id: "q-1", ok: true },
    ]);
    expect(mocks.createDir).toHaveBeenCalledTimes(1);
    expect(mocks.createDir).toHaveBeenCalledWith("/repo/a", "/repo");

    const remaining = usePlanStore.getState().queue.map((q) => q.id);
    expect(remaining).toEqual(["q-2"]);
  });

  it("keeps a failed edit in the queue for retry", async () => {
    usePlanStore.getState().enqueue(dirEdit("q-1", "/repo/a"));
    mocks.createDir.mockRejectedValueOnce(new Error("boom"));

    const [result] = await usePlanStore.getState().applySome(["q-1"]);
    expect(result.ok).toBe(false);
    expect(usePlanStore.getState().queue.map((q) => q.id)).toEqual(["q-1"]);
  });
});

describe("plan sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlanStore.setState({ active: false, queue: [], sessions: {} });
    mocks.createDir.mockResolvedValue(undefined);
  });

  function dirEdit(id: string, path: string): QueuedEdit {
    return {
      id,
      kind: "create_directory",
      path,
      projectRoot: "/repo",
      originalContent: "",
      proposedContent: "",
      isNewFile: true,
    };
  }

  it("keeps active state and queued edits scoped to the chat session", async () => {
    const store = usePlanStore.getState();
    store.enable("chat-a");
    store.enqueue(dirEdit("q-a", "/repo/a"), "chat-a");
    store.enqueue(dirEdit("q-b", "/repo/b"), "chat-b");

    expect(store.isActive("chat-a")).toBe(true);
    expect(store.isActive("chat-b")).toBe(false);
    expect(store.queueFor("chat-a").map((q) => q.id)).toEqual(["q-a"]);
    expect(store.queueFor("chat-b").map((q) => q.id)).toEqual(["q-b"]);

    await expect(store.applyAll("chat-a")).resolves.toEqual([
      { id: "q-a", ok: true },
    ]);
    expect(mocks.createDir).toHaveBeenCalledWith("/repo/a", "/repo");
    expect(usePlanStore.getState().queueFor("chat-a")).toEqual([]);
    expect(usePlanStore.getState().queueFor("chat-b").map((q) => q.id)).toEqual([
      "q-b",
    ]);
  });
});
