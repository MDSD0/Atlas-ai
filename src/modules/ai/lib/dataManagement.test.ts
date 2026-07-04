import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  failingPath: null as string | null,
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    constructor(private readonly path: string) {}
    async entries() {
      if (this.path === mocks.failingPath) throw new Error("disk error");
      return [["key", "value"]] as Array<[string, unknown]>;
    }
    async clear() {
      if (this.path === mocks.failingPath) throw new Error("disk error");
    }
    async save() {}
  },
}));

import { AI_DATA_STORE_PATHS, clearAllAppData, exportAllAppData } from "@/modules/ai/lib/dataManagement";

afterEach(() => {
  mocks.failingPath = null;
});

describe("AI_DATA_STORE_PATHS (F-12)", () => {
  it("lists every AI data store exactly once, and none of app settings/themes", () => {
    expect(AI_DATA_STORE_PATHS.length).toBe(12);
    expect(new Set(AI_DATA_STORE_PATHS).size).toBe(AI_DATA_STORE_PATHS.length);
    for (const path of AI_DATA_STORE_PATHS) {
      expect(path).not.toBe("atlas-settings.json");
      expect(path).not.toBe("atlas-custom-themes.json");
    }
  });

  it("only references atlas-ai-* store files", () => {
    for (const path of AI_DATA_STORE_PATHS) {
      expect(path).toMatch(/^atlas-ai-.*\.json$/);
    }
  });
});

describe("error isolation (F-12 edge case)", () => {
  it("exportAllAppData continues past a failing store and reports it separately", async () => {
    mocks.failingPath = AI_DATA_STORE_PATHS[3];
    const result = await exportAllAppData();
    expect(Object.keys(result.stores)).toHaveLength(AI_DATA_STORE_PATHS.length - 1);
    expect(result.stores[AI_DATA_STORE_PATHS[3]]).toBeUndefined();
    expect(result.errors).toBeDefined();
    expect(Object.keys(result.errors!)).toEqual([AI_DATA_STORE_PATHS[3]]);
  });

  it("exportAllAppData omits `errors` entirely when every store succeeds", async () => {
    const result = await exportAllAppData();
    expect(result.errors).toBeUndefined();
    expect(Object.keys(result.stores)).toHaveLength(AI_DATA_STORE_PATHS.length);
  });

  it("clearAllAppData continues past a failing store instead of aborting the rest", async () => {
    mocks.failingPath = AI_DATA_STORE_PATHS[3];
    const result = await clearAllAppData();
    expect(result.cleared).toHaveLength(AI_DATA_STORE_PATHS.length - 1);
    expect(result.cleared).not.toContain(AI_DATA_STORE_PATHS[3]);
    expect(result.failed).toEqual([
      { path: AI_DATA_STORE_PATHS[3], error: expect.stringContaining("disk error") },
    ]);
  });

  it("clearAllAppData reports empty `failed` when every store clears successfully", async () => {
    const result = await clearAllAppData();
    expect(result.failed).toEqual([]);
    expect(result.cleared).toHaveLength(AI_DATA_STORE_PATHS.length);
  });
});
