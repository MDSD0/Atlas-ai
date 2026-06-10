import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInvokeShim, ensureProjectDir } from "./tauriInvokeShim";

describe("tauriInvokeShim (headless harness seam)", () => {
  let dir: string;
  let invoke: ReturnType<typeof createInvokeShim>;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "shim-"));
    ensureProjectDir(dir);
    invoke = createInvokeShim(dir);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("writes and reads a file through agent_fs commands", async () => {
    await invoke("agent_fs_write_file", { path: "index.html", content: "<button>x</button>" });
    const read = (await invoke("agent_fs_read_file", { path: "index.html" })) as {
      kind: string;
      content: string;
    };
    expect(read.kind).toBe("text");
    expect(read.content).toContain("<button>");
  });

  it("lists directory entries", async () => {
    const entries = (await invoke("agent_fs_read_dir", { path: dir })) as Array<{
      name: string;
      kind: string;
    }>;
    expect(entries.some((e) => e.name === "index.html" && e.kind === "file")).toBe(true);
  });

  it("greps file contents", async () => {
    const res = (await invoke("agent_fs_grep", { pattern: "button", root: dir })) as {
      hits: Array<{ rel: string }>;
    };
    expect(res.hits.length).toBeGreaterThan(0);
  });

  it("runs a shell command and reports exit code", async () => {
    const out = (await invoke("shell_run_command", {
      command: process.platform === "win32" ? "echo hi" : "echo hi",
    })) as { stdout: string; exit_code: number };
    expect(out.stdout).toContain("hi");
    expect(out.exit_code).toBe(0);
  });

  it("caps shell output so benchmark context cannot explode", async () => {
    const command =
      process.platform === "win32"
        ? "node -e \"console.log('x'.repeat(70000))\""
        : "node -e \"console.log('x'.repeat(70000))\"";
    const out = (await invoke("shell_run_command", { command })) as {
      stdout: string;
      truncated: boolean;
    };
    expect(out.truncated).toBe(true);
    expect(out.stdout.length).toBeLessThan(66_000);
    expect(out.stdout).toContain("truncated by benchmark shim");
  });

  it("throws on unhandled commands so gaps are visible", async () => {
    await expect(invoke("some_unknown_command", {})).rejects.toThrow(/unhandled/);
  });
});
