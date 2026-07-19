import type { AiDiffTab, Tab } from "@/modules/tabs";
import { AiDiffPane } from "./AiDiffPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  onAccept: (approvalId: string) => void;
  onAcceptAmended: (approvalId: string, path: string, mergedContent: string) => void;
  onReject: (approvalId: string) => void;
  onRejectWithFeedback: (approvalId: string, path: string, note: string) => void;
};

export function AiDiffStack({
  tabs,
  activeId,
  onAccept,
  onAcceptAmended,
  onReject,
  onRejectWithFeedback,
}: Props) {
  const active = tabs.find(
    (t): t is AiDiffTab => t.kind === "ai-diff" && t.id === activeId,
  );
  if (!active) return null;
  return (
    <div className="h-full w-full">
      <AiDiffPane
        key={active.id}
        path={active.path}
        originalContent={active.originalContent}
        proposedContent={active.proposedContent}
        status={active.status}
        isNewFile={active.isNewFile}
        onAccept={() => onAccept(active.approvalId)}
        onAcceptAmended={(merged) =>
          onAcceptAmended(active.approvalId, active.path, merged)
        }
        onReject={() => onReject(active.approvalId)}
        onRejectWithFeedback={(note) =>
          onRejectWithFeedback(active.approvalId, active.path, note)
        }
      />
    </div>
  );
}
