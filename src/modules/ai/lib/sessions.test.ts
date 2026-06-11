import { describe, expect, it } from "vitest";
import {
  bindSessionToWorkspace,
  normalizeMessageHistory,
  projectNameFromRoot,
} from "./sessions";

describe("session project binding", () => {
  it("derives project name from workspace root", () => {
    expect(projectNameFromRoot("/Users/me/repo")).toBe("repo");
    expect(projectNameFromRoot("C:\\Users\\me\\repo")).toBe("repo");
    expect(projectNameFromRoot(null)).toBe("Unbound");
  });

  it("stores projectId and workspaceRoot together", () => {
    const session = bindSessionToWorkspace(
      {
        id: "s1",
        title: "New chat",
        createdAt: 1,
        updatedAt: 1,
      },
      "/repo",
    );

    expect(session).toMatchObject({
      projectId: "/repo",
      projectName: "repo",
      workspaceRoot: "/repo",
    });
  });

  it("dedupes replayed UI messages by id while preserving first position", () => {
    const messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "start" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "old" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "continue" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "new" }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", text: "done" }] },
    ] as any;

    expect(normalizeMessageHistory(messages).map((m) => [m.id, (m.parts[0] as any).text])).toEqual([
      ["u1", "start"],
      ["a1", "new"],
      ["u2", "continue"],
      ["a2", "done"],
    ]);
  });
});
