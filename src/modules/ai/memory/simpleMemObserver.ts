import { MEMORY_REPO_TRUTH_RULE } from "@/modules/ai/memory/contracts";
import { simpleMemConfig } from "@/modules/ai/memory/simpleMemConfig";
import type { SimpleMemAdapter } from "@/modules/ai/memory/simpleMem";
import { boundText } from "@/modules/ai/proof/contracts";

const SIMPLEMEM_CONTEXT_BYTES = 8 * 1024;

type SimpleMemObserverOptions = {
  workspaceRoot: string | null;
  contentSessionId: string;
  userPrompt: string;
  adapter?: SimpleMemAdapter;
};

export class SimpleMemRunObserver {
  private finished = false;

  private constructor(
    private readonly adapter: SimpleMemAdapter,
    private readonly memorySessionId: string,
    readonly context: string | null,
  ) {}

  static async start(
    options: SimpleMemObserverOptions,
  ): Promise<SimpleMemRunObserver | null> {
    if (!options.workspaceRoot) return null;
    const config = options.adapter ? null : await simpleMemConfig.get();
    if (config && !config.enabled) return null;
    const injectContext = options.adapter ? true : (config?.injectContext ?? false);
    const adapter = options.adapter ?? (await simpleMemConfig.adapter());
    const started = await adapter.startSession({
      tenantId: "atlas-local",
      contentSessionId: options.contentSessionId,
      project: options.workspaceRoot,
      userPrompt: options.userPrompt || undefined,
    });
    if (options.userPrompt) {
      await adapter.recordMessage(
        started.memory_session_id,
        options.userPrompt,
        "user",
      );
    }
    const bounded = boundText(started.context.trim(), SIMPLEMEM_CONTEXT_BYTES).preview;
    const context = injectContext && bounded
      ? [
          '<atlas_memory provider="simplemem-cross">',
          MEMORY_REPO_TRUTH_RULE,
          bounded,
          "</atlas_memory>",
        ].join("\n")
      : null;
    return new SimpleMemRunObserver(adapter, started.memory_session_id, context);
  }

  async recordTool(result: {
    toolName: string;
    input: unknown;
    output: unknown;
  }): Promise<void> {
    if (this.finished) return;
    await this.adapter.recordToolUse(
      this.memorySessionId,
      result.toolName,
      result.input,
      result.output,
    );
  }

  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    try {
      await this.adapter.stopSession(this.memorySessionId);
    } finally {
      await this.adapter.endSession(this.memorySessionId);
    }
  }
}
