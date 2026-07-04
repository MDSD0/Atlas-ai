import { describe, expect, it } from "vitest";
import type { UIMessage } from "@ai-sdk/react";
import {
  bindSessionToWorkspace,
  normalizeMessageHistory,
  projectNameFromRoot,
  pruneMessages,
  pruneSessions,
  serializedMessagesBytes,
  type SessionMeta,
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

describe("retention caps (F-12)", () => {
  function session(id: string, updatedAt: number): SessionMeta {
    return { id, title: id, createdAt: updatedAt, updatedAt };
  }

  it("pruneSessions leaves a list under the cap untouched", () => {
    const sessions = [session("a", 1), session("b", 2)];
    expect(pruneSessions(sessions, 5)).toEqual(sessions);
  });

  it("pruneSessions keeps only the newest N by updatedAt", () => {
    const sessions = [session("old", 1), session("newest", 3), session("mid", 2)];
    const pruned = pruneSessions(sessions, 2);
    expect(pruned.map((s) => s.id)).toEqual(["newest", "mid"]);
  });

  it("pruneMessages leaves a list under the cap untouched", () => {
    const messages = [{ id: "1" }, { id: "2" }] as unknown as UIMessage[];
    expect(pruneMessages(messages, 5)).toBe(messages);
  });

  it("pruneMessages keeps only the newest N messages", () => {
    const messages = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }] as unknown as UIMessage[];
    const pruned = pruneMessages(messages, 2);
    expect(pruned.map((m) => m.id)).toEqual(["3", "4"]);
  });

  it("pruneMessages bounds serialized session bytes and keeps the newest fitting tail", () => {
    const messages = [
      { id: "1", role: "user", parts: [{ type: "text", text: "a".repeat(80) }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "b".repeat(80) }] },
      { id: "3", role: "user", parts: [{ type: "text", text: "small" }] },
    ] as UIMessage[];
    const pruned = pruneMessages(messages, 10, 180);
    expect(pruned.map((message) => message.id)).toEqual(["3"]);
    expect(serializedMessagesBytes(pruned)).toBeLessThanOrEqual(180);
  });

  it("pruneSessions does not prune when length exactly equals the cap (boundary)", () => {
    const sessions = [session("a", 1), session("b", 2), session("c", 3)];
    expect(pruneSessions(sessions, 3)).toBe(sessions);
  });

  it("pruneMessages does not prune when length exactly equals the cap (boundary)", () => {
    const messages = [{ id: "1" }, { id: "2" }, { id: "3" }] as unknown as UIMessage[];
    expect(pruneMessages(messages, 3)).toBe(messages);
  });

  it("pruneSessions prunes by exactly one when length is cap+1 (off-by-one boundary)", () => {
    const sessions = [session("old", 1), session("mid", 2), session("newest", 3)];
    const pruned = pruneSessions(sessions, 2);
    expect(pruned.map((s) => s.id)).toEqual(["newest", "mid"]);
  });
});
