import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  planActive: false,
  canonicalize: vi.fn(async (path: string) => path),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../lib/native", () => ({
  agentNative: {
    canonicalize: mocks.canonicalize,
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
  },
}));

vi.mock("../store/planStore", () => ({
  newQueuedEditId: () => "q-1",
  usePlanStore: {
    getState: () => ({
      active: mocks.planActive,
      enqueue: mocks.enqueue,
    }),
  },
}));

import { applyEdits } from "./edit";
import { fingerprintText, STALE_READ_ERROR } from "./fingerprint";

describe("agent edit freshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.planActive = false;
  });

  it("rejects an external modification before writing", async () => {
    const path = "/repo/value.ts";
    const readCache = new Map([[path, fingerprintText("export const VALUE = 1;\n")]]);
    mocks.readFile.mockResolvedValue({
      kind: "text",
      content: "export const VALUE = 2;\n",
      size: 24,
    });

    await expect(
      applyEdits(
        path,
        "/repo",
        [{ old_string: "VALUE = 2", new_string: "VALUE = 3" }],
        "edit",
        readCache,
      ),
    ).resolves.toEqual({
      error: STALE_READ_ERROR,
      code: "stale_read",
      path,
    });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("accepts unchanged non-ASCII content and stores a UTF-8 fingerprint", async () => {
    const path = "/repo/value.ts";
    const original = 'export const MESSAGE = "café";\n';
    const proposed = 'export const MESSAGE = "cafés";\n';
    const readCache = new Map([[path, fingerprintText(original)]]);
    mocks.readFile.mockResolvedValue({
      kind: "text",
      content: original,
      size: fingerprintText(original).size,
    });
    mocks.writeFile.mockResolvedValue(undefined);

    await expect(
      applyEdits(
        path,
        "/repo",
        [{ old_string: '"café"', new_string: '"cafés"' }],
        "edit",
        readCache,
      ),
    ).resolves.toMatchObject({ ok: true, path });
    expect(mocks.writeFile).toHaveBeenCalledWith(path, proposed, "/repo");
    expect(readCache.get(path)).toEqual(fingerprintText(proposed));
  });

  it("keeps binary refusal intact", async () => {
    const path = "/repo/value.bin";
    const readCache = new Map([[path, fingerprintText("prior")]]);
    mocks.readFile.mockResolvedValue({ kind: "binary", size: 5 });

    await expect(
      applyEdits(
        path,
        "/repo",
        [{ old_string: "prior", new_string: "next" }],
        "edit",
        readCache,
      ),
    ).resolves.toEqual({ error: "binary file refused", path });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
