import type { Tool } from "ai";
import type { AtlasLifecycleEvent } from "@/modules/ai/skills";

export type LifecycleObserver = (
  event: AtlasLifecycleEvent,
  payload: Record<string, unknown>,
) => Promise<void>;

export function wrapToolsWithLifecycle<T extends Record<string, Tool>>(
  tools: T,
  observe?: LifecycleObserver,
): T {
  if (!observe) return tools;
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, definition]) => {
      if (!definition.execute) return [toolName, definition];
      const execute = definition.execute;
      return [
        toolName,
        {
          ...definition,
          execute: async (...args: Parameters<typeof execute>) => {
            const input = (args[0] ?? {}) as Record<string, unknown>;
            // Fire-and-forget: journal writes and skill hooks must never delay
            // or fail the tool itself.
            void observe("before_tool", { toolName, input }).catch(() => {});
            try {
              const output = await execute(...args);
              void observe("after_tool", { toolName, input, output }).catch(() => {});
              return output;
            } catch (error) {
              void observe("after_tool", {
                toolName,
                input,
                error: String(error),
              }).catch(() => {});
              throw error;
            }
          },
        },
      ];
    }),
  ) as T;
}
