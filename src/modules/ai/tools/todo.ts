import { tool } from "ai";
import { z } from "zod";
import { newTodoId, validateTodos, type Todo } from "../lib/todos";
import { getTodos, useTodosStore } from "../store/todoStore";
import type { ToolContext } from "./context";

const TodoStatus = z.enum(["pending", "in_progress", "completed"]);
const MAX_TODOS = 8;

function normalizeText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function todosEquivalent(a: readonly Todo[], b: readonly Todo[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((todo, i) => {
    const other = b[i];
    return (
      normalizeText(todo.title) === normalizeText(other.title) &&
      normalizeText(todo.description) === normalizeText(other.description) &&
      todo.status === other.status
    );
  });
}

export function buildTodoTools(ctx: ToolContext) {
  return {
    todo_write: tool({
      description:
        "Replace your current task list. Use only for genuinely multi-phase tasks, not one-file fixes or run/open/preview requests. Keep 2-8 high-signal items. Mark at most one item `in_progress`. The tool replaces the previous list; always pass the FULL list, not a delta. Auto-executes (no approval).",
      inputSchema: z.object({
        todos: z
          .array(
            z.object({
              id: z
                .string()
                .optional()
                .describe(
                  "Stable id; generated if omitted. Reuse ids across calls to keep UI stable.",
                ),
              title: z.string().min(1),
              description: z.string().optional(),
              status: TodoStatus,
            }),
          )
          .describe("The complete list of todos for this task."),
      }),
      execute: async ({ todos }) => {
        const sessionId = ctx.getSessionId();
        if (!sessionId)
          return { error: "no active session; cannot persist todos" };
        if (todos.length > MAX_TODOS) {
          return {
            error: `too many todos (${todos.length}); keep the task list to ${MAX_TODOS} or fewer high-signal items`,
          };
        }
        if (todos.length === 1) {
          return {
            ok: true,
            count: 0,
            unchanged: true,
            note: "single-item todo lists are ignored; do the step directly",
          };
        }

        const normalized: Todo[] = todos.map((t) => ({
          id: t.id ?? newTodoId(),
          title: t.title.trim(),
          description: t.description?.trim() || undefined,
          status: t.status,
        }));

        const err = validateTodos(normalized);
        if (err) return { error: err };
        if (todosEquivalent(getTodos(sessionId), normalized)) {
          return {
            ok: true,
            count: normalized.length,
            unchanged: true,
            inProgress:
              normalized.find((t) => t.status === "in_progress")?.title ?? null,
          };
        }

        useTodosStore.getState().setTodos(sessionId, normalized);

        return {
          ok: true,
          count: normalized.length,
          inProgress:
            normalized.find((t) => t.status === "in_progress")?.title ?? null,
        };
      },
    }),
  } as const;
}
