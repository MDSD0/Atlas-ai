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
            await observe("before_tool", { toolName, input });
            try {
              const output = await execute(...args);
              await observe("after_tool", { toolName, input, output });
              return output;
            } catch (error) {
              await observe("after_tool", {
                toolName,
                input,
                error: String(error),
              });
              throw error;
            }
          },
        },
      ];
    }),
  ) as T;
}
