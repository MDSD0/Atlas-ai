import { describe, expect, it } from "vitest";
import { bindSessionToWorkspace, projectNameFromRoot } from "./sessions";

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
});
