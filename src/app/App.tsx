import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CanvasView } from "../features/canvas/CanvasView";
import { deleteSelectionByKey, isEditableTarget, isMutedShortcut, shouldHandleSelectionDelete } from "../features/canvas/selectionCommands";
import { Inspector } from "../features/editor/Inspector";
import { StoryEditor } from "../features/editor/StoryEditor";
import { CanvasSidebar } from "../features/project/CanvasSidebar";
import { ProjectToolbar } from "../features/project/ProjectToolbar";
import { RecoveryChoiceDialog } from "../features/project/RecoveryChoiceDialog";
import {
  autosaveRecovery,
  completeCloseRequest,
  listRecoveryCandidates,
  saveProject,
  type RecoveryCandidate,
} from "../features/project/projectPersistence";
import { CommandPalette } from "../features/search/CommandPalette";
import { useAppStore } from "../store/appStore";

export function App() {
  const [startupRecovery, setStartupRecovery] = useState<RecoveryCandidate | null>(null);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const copySelection = useAppStore((state) => state.copySelection);
  const pasteSelection = useAppStore((state) => state.pasteSelection);
  const duplicateSelection = useAppStore((state) => state.duplicateSelection);
  const toggleMutedSelection = useAppStore((state) => state.toggleMutedSelection);
  const openSearch = useAppStore((state) => state.openSearch);
  const navigateBack = useAppStore((state) => state.navigateBack);
  const navigateForward = useAppStore((state) => state.navigateForward);
  const contentDirty = useAppStore((state) => state.contentDirty);
  const workspaceDirty = useAppStore((state) => state.workspaceDirty);
  const focusedEditorDirty = useAppStore((state) => Boolean(state.storyEditor?.dirty));
  const currentFilePath = useAppStore((state) => state.currentFilePath);
  const currentRevision = useAppStore((state) => state.currentRevision);
  const workspaceRevision = useAppStore((state) => state.workspaceRevision);
  const saveState = useAppStore((state) => state.saveState);
  const autoSavePaused = useAppStore((state) => state.autoSavePaused);
  const lastError = useAppStore((state) => state.lastError);
  const setSaveState = useAppStore((state) => state.setSaveState);
  const setAutosaveState = useAppStore((state) => state.setAutosaveState);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject(event.shiftKey);
        return;
      }
      if (isEditableTarget(event.target)) return;
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
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch("project");
        return;
      }
      if (modifier && event.key.toLowerCase() === "f") {
        event.preventDefault();
        document.getElementById("sidebar-search")?.focus();
        return;
      }
      if (modifier && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if (isMutedShortcut(event)) {
        const state = useAppStore.getState();
        if (!state.storyEditor && !state.searchMode && (state.selection?.type === "card" || state.selection?.type === "placements")) {
          event.preventDefault();
          toggleMutedSelection();
          return;
        }
      }
      if (shouldHandleSelectionDelete(event.key, event.target)) {
        event.preventDefault();
        void deleteSelectionByKey(event.key);
        return;
      }
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
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
  }, [copySelection, duplicateSelection, navigateBack, navigateForward, openSearch, pasteSelection, redo, toggleMutedSelection, undo]);

  useEffect(() => {
    if (autoSavePaused || (!contentDirty && !workspaceDirty && !focusedEditorDirty) || saveState === "saving") return;
    const timer = window.setTimeout(() => {
      if (!useAppStore.getState().autoSavePaused) void autosaveRecovery();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [autoSavePaused, contentDirty, currentFilePath, currentRevision, focusedEditorDirty, saveState, workspaceDirty, workspaceRevision]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    useAppStore.getState().setAutoSavePaused(true);
    void listRecoveryCandidates().then((candidates) => {
      const unsaved = candidates.find((candidate) => candidate.originalFilePath === null);
      if (unsaved) setStartupRecovery(unsaved);
      else useAppStore.getState().setAutoSavePaused(false);
    }).catch((error: unknown) => {
      useAppStore.getState().setAutoSavePaused(false);
      useAppStore.getState().setAutosaveState("error", error instanceof Error ? error.message : String(error));
    });
  }, []);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void appWindow
      .onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          await completeCloseRequest(() => appWindow.destroy());
        } catch (error) {
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
      {lastError ? (
        <div className="error-banner" role="alert">
          <strong>Project operation failed</strong>
          <span>{lastError}</span>
          <button type="button" onClick={() => { setSaveState("idle"); setAutosaveState("idle"); }}>Dismiss</button>
        </div>
      ) : null}
      <main className="workspace">
        <CanvasSidebar />
        <CanvasView />
        <Inspector />
      </main>
      <StoryEditor />
      {startupRecovery ? (
        <RecoveryChoiceDialog candidate={startupRecovery} onClose={() => {
          setStartupRecovery(null);
          useAppStore.getState().setAutoSavePaused(false);
        }} />
      ) : null}
    </div>
  );
}
