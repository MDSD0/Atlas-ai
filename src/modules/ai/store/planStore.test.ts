import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDir: vi.fn(),
  canonicalize: vi.fn(async (path: string) => path),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../lib/native", () => ({
  agentNative: {
    canonicalize: mocks.canonicalize,
    createDir: mocks.createDir,
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
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
    usePlanStore.setState({ active: false, queue: [] });
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
  });
});
