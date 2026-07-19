import { Download as DownloadIcon, Trash2 as Delete02Icon } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { native } from "@/modules/ai/lib/native";
import { clearAllAppData, exportAllAppData } from "@/modules/ai/lib/dataManagement";
import { SectionHeader } from "../components/SectionHeader";
import { MemoryDataManager } from "../components/MemoryDataManager";

const CLEARED_STORES_LABEL =
  "chat sessions, todos, memory, skills, MCP configuration, work packets, metrics, and traces";

function parentDir(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

export function PrivacyDataSection() {
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const onExport = async () => {
    setExporting(true);
    try {
      const defaultPath = `atlas-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      const path = await save({
        defaultPath,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await native.workspaceAuthorize(parentDir(path));
      const data = await exportAllAppData();
      await native.writeFile(path, JSON.stringify(data, null, 2));
      if (data.errors) {
        const failedStores = Object.keys(data.errors).join(", ");
        toast.warning("Export completed with some stores skipped", {
          description: `Couldn't read: ${failedStores}. The rest was still exported to ${path}.`,
        });
      } else {
        toast.success("Export complete", { description: path });
      }
    } catch (error) {
      toast.error("Export failed", { description: String(error) });
    } finally {
      setExporting(false);
    }
  };

  const onClearAll = async () => {
    setClearDialogOpen(false);
    setClearing(true);
    try {
      const result = await clearAllAppData();
      if (result.failed.length > 0) {
        const failedStores = result.failed.map((f) => f.path).join(", ");
        toast.error("Some data could not be cleared", {
          description: `Failed: ${failedStores}. ${result.cleared.length} store(s) were cleared successfully.`,
        });
        setClearing(false);
        return;
      }
      toast.success("All app data cleared", {
        description: "Reloading…",
      });
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      toast.error("Clear failed", { description: String(error) });
      setClearing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Privacy & Data"
        description="Atlas stores chat history, tool output, memory, skills, MCP configuration, and related app data as local files. API keys are stored separately in your OS keychain, not here."
      />

      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/60 p-5">
        <span className="text-[13px] font-medium">Export all data</span>
        <p className="text-[11.5px] text-muted-foreground">
          Download everything Atlas has stored ({CLEARED_STORES_LABEL}) as one JSON file.
        </p>
        <div>
          <Button size="sm" onClick={() => void onExport()} disabled={exporting} className="gap-1.5">
            <DownloadIcon size={12} strokeWidth={1.5} />
            {exporting ? "Exporting…" : "Export as JSON"}
          </Button>
        </div>
      </div>

      <MemoryDataManager />

      <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <span className="text-[13px] font-medium text-destructive">Clear all data</span>
        <p className="text-[11.5px] text-muted-foreground">
          Permanently deletes {CLEARED_STORES_LABEL}. Does not affect app preferences, themes,
          keyboard shortcuts, or API keys. This cannot be undone.
        </p>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClearDialogOpen(true)}
            disabled={clearing}
            className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <Delete02Icon size={12} strokeWidth={1.5} />
            {clearing ? "Clearing…" : "Clear all data"}
          </Button>
        </div>
      </div>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all app data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {CLEARED_STORES_LABEL}. App preferences, themes, keyboard
              shortcuts, and API keys are not affected. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void onClearAll()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear all data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
