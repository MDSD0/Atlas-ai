import {
  asSchema,
  type FlexibleSchema,
  type ModelMessage,
  type ToolSet,
} from "ai";

export const CONTEXT_LEDGER_ITEMS = 32;

export type PackedContextItemStatus = "loaded" | "not_loaded";
export type PackedContextPressure = "healthy" | "warning" | "critical";

export type PackedContextSource = {
  id: string;
  label: string;
  source: string;
  content: string | null | undefined;
  detail?: string;
};

export type PackedContextItem = {
  id: string;
  label: string;
  source: string;
  status: PackedContextItemStatus;
  bytes: number;
  tokenEstimate: number;
  detail: string | null;
};

export type PackedContextSnapshot = {
  projectId: string;
  sessionId: string;
  modelId: string;
  activeFile: string | null;
  capturedAt: number;
  contextLimit: number;
  estimatedBytes: number;
  estimatedTokens: number;
  pressure: PackedContextPressure;
  compacted: boolean;
  droppedCount: number;
  items: PackedContextItem[];
};

export type BuildPackedContextInput = {
  projectId: string;
  sessionId: string;
  modelId: string;
  activeFile: string | null;
  contextLimit: number;
  stableSources: readonly PackedContextSource[];
  sessionBinding: string;
  planModePrompt?: string | null;
  compactedHistory: readonly ModelMessage[];
  compacted: boolean;
  droppedCount: number;
  tools: ToolSet;
  capturedAt?: number;
};

const encoder = new TextEncoder();

function bytes(value: string): number {
  return encoder.encode(value).byteLength;
}

function tokens(byteLength: number): number {
  return Math.ceil(byteLength / 4);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function item(
  source: Omit<PackedContextSource, "content"> & {
    content?: string | null;
  },
): PackedContextItem {
  const byteLength = source.content ? bytes(source.content) : 0;
  return itemFromBytes(source, byteLength);
}

function itemFromBytes(
  source: Omit<PackedContextSource, "content">,
  byteLength: number,
): PackedContextItem {
  return {
    id: source.id,
    label: source.label,
    source: source.source,
    status: byteLength > 0 ? "loaded" : "not_loaded",
    bytes: byteLength,
    tokenEstimate: tokens(byteLength),
    detail: source.detail ?? null,
  };
}

function withoutBinding(text: string, sessionBinding: string): string {
  if (!sessionBinding) return text;
  if (text.startsWith(`${sessionBinding}\n\n`)) {
    return text.slice(sessionBinding.length + 2);
  }
  if (text.startsWith(sessionBinding)) {
    return text.slice(sessionBinding.length);
  }
  return text;
}

function historyBytes(
  messages: readonly ModelMessage[],
  sessionBinding: string,
): { conversation: number; toolResults: number } {
  let conversation = 0;
  let toolResults = 0;
  for (const message of messages) {
    if (typeof message.content === "string") {
      conversation += bytes(withoutBinding(message.content, sessionBinding));
      continue;
    }
    if (!Array.isArray(message.content)) {
      conversation += bytes(safeJson(message.content));
      continue;
    }
    for (const rawPart of message.content) {
      const part = rawPart as {
        type?: string;
        text?: unknown;
        output?: unknown;
      };
      if (part.type === "tool-result") {
        toolResults += bytes(safeJson(part.output ?? ""));
      } else if (
        (part.type === "text" || part.type === "reasoning") &&
        typeof part.text === "string"
      ) {
        conversation += bytes(withoutBinding(part.text, sessionBinding));
      } else {
        conversation += bytes(safeJson(part));
      }
    }
  }
  return { conversation, toolResults };
}

async function toolDefinitionsItem(tools: ToolSet): Promise<PackedContextItem> {
  const definitions: unknown[] = [];
  for (const [name, rawTool] of Object.entries(tools)) {
    const definition = rawTool as {
      type?: string;
      description?: string;
      inputSchema?: unknown;
      id?: string;
      args?: unknown;
    };
    if (definition.type === "provider") {
      definitions.push({
        type: "provider",
        name,
        id: definition.id,
        args: definition.args,
      });
      continue;
    }
    definitions.push({
      type: "function",
      name,
      description: definition.description,
      inputSchema: await asSchema(
        definition.inputSchema as FlexibleSchema<unknown>,
      ).jsonSchema,
    });
  }
  return item({
    id: "tool_definitions",
    label: "Tool definitions",
    source: "AI SDK prepared function schemas",
    content: safeJson(definitions),
    detail: `${definitions.length} tool schema(s); provider framing excluded`,
  });
}

function pressureFor(
  estimatedTokens: number,
  contextLimit: number,
): PackedContextPressure {
  if (estimatedTokens >= contextLimit * 0.7) return "critical";
  if (estimatedTokens >= contextLimit * 0.55) return "warning";
  return "healthy";
}

export async function buildPackedContextSnapshot(
  input: BuildPackedContextInput,
): Promise<PackedContextSnapshot> {
  const history = historyBytes(input.compactedHistory, input.sessionBinding);
  const items = [
    ...input.stableSources.map(item),
    item({
      id: "session_binding",
      label: "Session binding",
      source: "<atlas_context>",
      content: input.sessionBinding,
      detail: input.activeFile
        ? `active file path only: ${input.activeFile}`
        : "no active file; binding contains project paths only",
    }),
    item({
      id: "plan_mode",
      label: "Plan mode",
      source: "Atlas plan-mode system prompt",
      content: input.planModePrompt,
    }),
    itemFromBytes({
      id: "conversation_history",
      label: "Conversation history",
      source: "retained compacted model messages",
      detail: "payload estimate after Atlas compaction; provider framing excluded",
    }, history.conversation),
    itemFromBytes({
      id: "tool_results",
      label: "Tool results",
      source: "retained compacted tool observations",
      detail: "payload estimate after Atlas compaction; output bodies are not retained here",
    }, history.toolResults),
    await toolDefinitionsItem(input.tools),
  ].slice(0, CONTEXT_LEDGER_ITEMS);
  const estimatedBytes = items.reduce((sum, entry) => sum + entry.bytes, 0);
  const estimatedTokens = tokens(estimatedBytes);
  return {
    projectId: input.projectId,
    sessionId: input.sessionId,
    modelId: input.modelId,
    activeFile: input.activeFile,
    capturedAt: input.capturedAt ?? Date.now(),
    contextLimit: input.contextLimit,
    estimatedBytes,
    estimatedTokens,
    pressure: pressureFor(estimatedTokens, input.contextLimit),
    compacted: input.compacted,
    droppedCount: input.droppedCount,
    items,
  };
}
