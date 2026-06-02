import { lazy, Suspense } from "react";
import type { AgentRunBridgeProps } from "./AgentRunBridge";
import type { SelectionAskAiProps } from "./SelectionAskAi";
import {
  AiInputBar as AiInputBarDirect,
  AiInputBarConnect as AiInputBarConnectDirect,
} from "./AiInputBar";

const AgentRunBridgeInner = lazy(() =>
  import("./AgentRunBridge").then((m) => ({ default: m.AgentRunBridge })),
);

const AiMiniWindowInner = lazy(() =>
  import("./AiMiniWindow").then((m) => ({ default: m.AiMiniWindow })),
);

const AiDockedPanelInner = lazy(() =>
  import("./AiMiniWindow").then((m) => ({ default: m.AiDockedPanel })),
);

const SelectionAskAiInner = lazy(() =>
  import("./SelectionAskAi").then((m) => ({ default: m.SelectionAskAi })),
);

export function AgentRunBridge(props: AgentRunBridgeProps) {
  return (
    <Suspense fallback={null}>
      <AgentRunBridgeInner {...props} />
    </Suspense>
  );
}

export function AiMiniWindow() {
  return (
    <Suspense fallback={null}>
      <AiMiniWindowInner />
    </Suspense>
  );
}

export function AiDockedPanel() {
  return (
    <Suspense fallback={null}>
      <AiDockedPanelInner />
    </Suspense>
  );
}

export function AiInputBar() {
  return <AiInputBarDirect />;
}

export function AiInputBarConnect({ onAdd }: { onAdd: () => void }) {
  return <AiInputBarConnectDirect onAdd={onAdd} />;
}

export function SelectionAskAi(props: SelectionAskAiProps) {
  return (
    <Suspense fallback={null}>
      <SelectionAskAiInner {...props} />
    </Suspense>
  );
}
