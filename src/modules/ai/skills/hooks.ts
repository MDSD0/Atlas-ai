import { boundText } from "@/modules/ai/proof/contracts";
import type { AtlasLifecycleEvent } from "@/modules/ai/skills/contracts";

export const LIFECYCLE_HOOK_TIMEOUT_MS = 250;
export const LIFECYCLE_HOOK_OUTPUT_BYTES = 1024;

export type LifecycleHookInput = {
  event: AtlasLifecycleEvent;
  payload: Record<string, unknown>;
};

export type LifecycleHook = {
  id: string;
  events: readonly AtlasLifecycleEvent[];
  enabled: boolean;
  run: (input: LifecycleHookInput) => Promise<string | void> | string | void;
};

export type LifecycleHookResult = {
  hookId: string;
  event: AtlasLifecycleEvent;
  status: "ok" | "failed" | "timed_out";
  detail: string;
};

export class LifecycleHookRunner {
  constructor(
    private readonly hooks: readonly LifecycleHook[],
    private readonly timeoutMs = LIFECYCLE_HOOK_TIMEOUT_MS,
  ) {}

  async run(
    event: AtlasLifecycleEvent,
    payload: Record<string, unknown> = {},
  ): Promise<LifecycleHookResult[]> {
    const selected = this.hooks.filter(
      (hook) => hook.enabled && hook.events.includes(event),
    );
    const results: LifecycleHookResult[] = [];
    for (const hook of selected) {
      results.push(await this.runOne(hook, event, payload));
    }
    return results;
  }

  private async runOne(
    hook: LifecycleHook,
    event: AtlasLifecycleEvent,
    payload: Record<string, unknown>,
  ): Promise<LifecycleHookResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const detail = await Promise.race([
        Promise.resolve(hook.run({ event, payload })),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("hook timed out")), this.timeoutMs);
        }),
      ]);
      return {
        hookId: hook.id,
        event,
        status: "ok",
        detail: boundText(String(detail ?? "completed"), LIFECYCLE_HOOK_OUTPUT_BYTES)
          .preview,
      };
    } catch (error) {
      const detail = String(error);
      return {
        hookId: hook.id,
        event,
        status: detail.includes("hook timed out") ? "timed_out" : "failed",
        detail: boundText(detail, LIFECYCLE_HOOK_OUTPUT_BYTES).preview,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

export const lifecycleHookRunner = new LifecycleHookRunner([]);
