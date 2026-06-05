import { describe, expect, it } from "vitest";
import { todosEquivalent } from "./todo";
import type { Todo } from "../lib/todos";

describe("todosEquivalent", () => {
  it("ignores id churn and harmless whitespace", () => {
    const a: Todo[] = [
      { id: "a", title: "Inspect files", status: "completed" },
      {
        id: "b",
        title: "Run tests",
        description: "focused suite",
        status: "in_progress",
      },
    ];
    const b: Todo[] = [
      { id: "new-a", title: " Inspect   files ", status: "completed" },
      {
        id: "new-b",
        title: "Run tests",
        description: " focused   suite ",
        status: "in_progress",
      },
    ];
    expect(todosEquivalent(a, b)).toBe(true);
  });

  it("treats status movement as a meaningful update", () => {
    const a: Todo[] = [{ id: "a", title: "Run tests", status: "pending" }];
    const b: Todo[] = [{ id: "a", title: "Run tests", status: "completed" }];
    expect(todosEquivalent(a, b)).toBe(false);
  });
});
