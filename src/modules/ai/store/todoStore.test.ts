import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTodosStore } from "./todoStore";

vi.mock("../lib/todos", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/todos")>();
  return {
    ...actual,
    saveTodos: vi.fn(),
    loadTodos: vi.fn(async () => []),
    deleteTodos: vi.fn(),
  };
});

describe("todoStore completion reconciliation", () => {
  beforeEach(() => {
    useTodosStore.setState({ bySession: {}, hydrated: new Set() });
  });

  it("completes the final in-progress todo when no pending work remains", () => {
    useTodosStore.getState().setTodos("s1", [
      { id: "a", title: "Inspect files", status: "completed" },
      { id: "b", title: "Write files", status: "completed" },
      { id: "c", title: "Run preview", status: "in_progress" },
    ]);

    useTodosStore.getState().completeTerminalInProgressTodo("s1");

    expect(useTodosStore.getState().bySession.s1).toEqual([
      { id: "a", title: "Inspect files", status: "completed" },
      { id: "b", title: "Write files", status: "completed" },
      { id: "c", title: "Run preview", status: "completed" },
    ]);
  });

  it("does not hide genuinely unfinished pending work", () => {
    useTodosStore.getState().setTodos("s1", [
      { id: "a", title: "Write files", status: "completed" },
      { id: "b", title: "Run preview", status: "in_progress" },
      { id: "c", title: "Verify interactions", status: "pending" },
    ]);

    useTodosStore.getState().completeTerminalInProgressTodo("s1");

    expect(useTodosStore.getState().bySession.s1).toEqual([
      { id: "a", title: "Write files", status: "completed" },
      { id: "b", title: "Run preview", status: "in_progress" },
      { id: "c", title: "Verify interactions", status: "pending" },
    ]);
  });
});
