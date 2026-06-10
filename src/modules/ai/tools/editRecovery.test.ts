import { describe, expect, it } from "vitest";
import { closestSnippet } from "./edit";

// Fixture from a real failed run: Gemini Flash tried to edit
// `from .persistence import ...` while the file actually contained absolute
// imports, then retried the identical wrong old_string. closest_match must
// hand the model the real lines so it can correct in one step.
const MAIN_PY = `from task_manager.src.persistence import load_tasks, save_tasks
from task_manager.src.task import Task
from datetime import datetime

class TaskManager:
    def __init__(self):
        self.tasks = load_tasks()
`;

describe("closestSnippet (old_string_not_found recovery)", () => {
  it("finds the real import lines for a near-miss old_string", () => {
    const snippet = closestSnippet(
      MAIN_PY,
      "from .persistence import load_tasks, save_tasks\nfrom .task import Task",
    );
    expect(snippet).toBeTruthy();
    expect(snippet!).toContain(
      "from task_manager.src.persistence import load_tasks, save_tasks",
    );
  });

  it("returns null when nothing in the file is close", () => {
    expect(closestSnippet(MAIN_PY, "SELECT * FROM users WHERE banana")).toBeNull();
  });

  it("returns null for whitespace-only old_string", () => {
    expect(closestSnippet(MAIN_PY, "  \n\t")).toBeNull();
  });

  it("caps the snippet length", () => {
    const long = `x = "${"a ".repeat(600)}"\ny = 1\n`;
    const snippet = closestSnippet(long, 'x = "a a a a a a WRONG');
    if (snippet) expect(snippet.length).toBeLessThanOrEqual(400);
  });
});
