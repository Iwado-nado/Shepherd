import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CanvasView } from "../features/canvas/CanvasView";
import { Inspector } from "../features/editor/Inspector";
import { CanvasSidebar } from "../features/project/CanvasSidebar";
import { ProjectToolbar } from "../features/project/ProjectToolbar";
import { confirmDiscardChanges, saveProject } from "../features/project/projectPersistence";
import { CommandPalette } from "../features/search/CommandPalette";
import { FilterPanel } from "../features/search/FilterPanel";
import { useAppStore } from "../store/appStore";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function App() {
  const deleteSelection = useAppStore((state) => state.deleteSelection);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const copySelection = useAppStore((state) => state.copySelection);
  const pasteSelection = useAppStore((state) => state.pasteSelection);
  const openSearch = useAppStore((state) => state.openSearch);
  const navigateBack = useAppStore((state) => state.navigateBack);
  const navigateForward = useAppStore((state) => state.navigateForward);
  const contentDirty = useAppStore((state) => state.contentDirty);
  const workspaceDirty = useAppStore((state) => state.workspaceDirty);
  const currentFilePath = useAppStore((state) => state.currentFilePath);
  const currentRevision = useAppStore((state) => state.currentRevision);
  const saveState = useAppStore((state) => state.saveState);
  const autoSavePaused = useAppStore((state) => state.autoSavePaused);
  const lastError = useAppStore((state) => state.lastError);
  const setSaveState = useAppStore((state) => state.setSaveState);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        navigateBack();
        return;
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        navigateForward();
        return;
      }
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject(event.shiftKey);
        return;
      }
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch("project");
        return;
      }
      if (modifier && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSearch("canvas");
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key === "Delete") {
        event.preventDefault();
        deleteSelection();
      } else if (modifier && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection();
      } else if (modifier && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copySelection, deleteSelection, navigateBack, navigateForward, openSearch, pasteSelection, redo, undo]);

  useEffect(() => {
    if (autoSavePaused || (!contentDirty && !workspaceDirty) || !currentFilePath || saveState === "saving") return;
    const timer = window.setTimeout(() => {
      if (!useAppStore.getState().autoSavePaused) void saveProject(false, false);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [autoSavePaused, contentDirty, currentFilePath, currentRevision, saveState, workspaceDirty]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void appWindow
      .onCloseRequested(async (event) => {
        event.preventDefault();
        useAppStore.getState().setAutoSavePaused(true);
        try {
          if (await confirmDiscardChanges()) await appWindow.destroy();
          else useAppStore.getState().setAutoSavePaused(false);
        } catch (error) {
          useAppStore.getState().setAutoSavePaused(false);
          useAppStore.getState().setSaveState(
            "error",
            error instanceof Error ? error.message : String(error),
          );
        }
      })
      .then((cleanup) => {
        unlisten = cleanup;
      });
    return () => unlisten?.();
  }, []);

  return (
    <div className="app-shell">
      <ProjectToolbar />
      <CommandPalette />
      <FilterPanel />
      {lastError ? (
        <div className="error-banner" role="alert">
          <strong>Project operation failed</strong>
          <span>{lastError}</span>
          <button type="button" onClick={() => setSaveState("idle")}>Dismiss</button>
        </div>
      ) : null}
      <main className="workspace">
        <CanvasSidebar />
        <CanvasView />
        <Inspector />
      </main>
    </div>
  );
}
