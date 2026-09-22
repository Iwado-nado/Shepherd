import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import { ExportDialog } from "../export/ExportDialog";
import { RecoveryChoiceDialog } from "./RecoveryChoiceDialog";
import { SaveHistoryDialog } from "./SaveHistoryDialog";
import { createNewProject, openProject, saveProject, type PendingProjectOpen } from "./projectPersistence";

export function ProjectToolbar() {
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<PendingProjectOpen | null>(null);
  const title = useAppStore((state) => state.projectFile.project.title);
  const hasStart = useAppStore((state) => Boolean(state.projectFile.project.start));
  const canSetStart = useAppStore((state) => state.selection?.type === "placements" && state.selection.ids.length === 1);
  const contentDirty = useAppStore((state) => state.contentDirty);
  const workspaceDirty = useAppStore((state) => state.workspaceDirty);
  const currentFilePath = useAppStore((state) => state.currentFilePath);
  const saveState = useAppStore((state) => state.saveState);
  const autosaveState = useAppStore((state) => state.autosaveState);
  const lastAutosavedAt = useAppStore((state) => state.lastAutosavedAt);
  const pastCount = useAppStore((state) => state.past.length);
  const futureCount = useAppStore((state) => state.future.length);
  const createCard = useAppStore((state) => state.createCardAtCenter);
  const createArea = useAppStore((state) => state.createArea);
  const setStart = useAppStore((state) => state.setStart);
  const goToStart = useAppStore((state) => state.goToStart);
  const openSearch = useAppStore((state) => state.openSearch);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const navigateBack = useAppStore((state) => state.navigateBack);
  const navigateForward = useAppStore((state) => state.navigateForward);
  const backCount = useAppStore((state) => state.navigationBack.length);
  const forwardCount = useAppStore((state) => state.navigationForward.length);
  const displayMode = useAppStore((state) => {
    const id = state.projectFile.workspace.lastOpenedCanvasId;
    return state.projectFile.project.canvases.find((canvas) => canvas.id === id)?.displayMode ?? "standard";
  });
  const bookmarks = useAppStore((state) => state.projectFile.project.bookmarks);
  const canvases = useAppStore((state) => state.projectFile.project.canvases);
  const filterCount = useAppStore((state) => new Set([
    ...state.filterTags,
    ...(state.activeTag ? [state.activeTag] : []),
  ]).size);
  const setDisplayMode = useAppStore((state) => state.setDisplayMode);
  const toggleFilterPanel = useAppStore((state) => state.toggleFilterPanel);
  const addBookmark = useAppStore((state) => state.addBookmark);
  const deleteBookmark = useAppStore((state) => state.deleteBookmark);
  const goToBookmark = useAppStore((state) => state.goToBookmark);

  const dirty = contentDirty || workspaceDirty || !currentFilePath;
  const status = saveState === "saving"
    ? "Saving..."
    : autosaveState === "saving"
      ? "Creating recovery..."
      : dirty && lastAutosavedAt
        ? `Recovery ${new Date(lastAutosavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : dirty ? "Unsaved changes" : "Saved";

  return (
    <header className="project-toolbar">
      <div className="brand-block"><span className="brand-mark">S</span><div><strong>SHEPHERD</strong><span>{title}</span></div></div>
      <nav className="toolbar-actions" aria-label="Project actions">
        <button type="button" onClick={() => void createNewProject()}>New</button>
        <button type="button" onClick={() => void openProject().then((pending) => setPendingOpen(pending))}>Open</button>
        <button type="button" onClick={() => void saveProject()}>Save</button>
        <button type="button" onClick={() => void saveProject(true)}>Save As</button>
        <button type="button" onClick={() => setHistoryOpen(true)}>History</button>
        <span className="toolbar-rule" />
        <button className="primary-button" type="button" onClick={createCard}>+ Card</button>
        <button type="button" onClick={createArea}>+ Area</button>
        <button type="button" className={displayMode === "compact" ? "is-active" : ""} onClick={() => setDisplayMode(displayMode === "compact" ? "standard" : "compact")}>{displayMode === "compact" ? "Compact" : "Standard"}</button>
        <span className="toolbar-rule" />
        <button type="button" disabled={!canSetStart} onClick={setStart}>Set START</button>
        <button type="button" disabled={!hasStart} onClick={goToStart}>★ START</button>
        <button type="button" disabled={backCount === 0} onClick={navigateBack} title="Back (Alt+Left)">←</button>
        <button type="button" disabled={forwardCount === 0} onClick={navigateForward} title="Forward (Alt+Right)">→</button>
        <button type="button" onClick={() => setBookmarksOpen((open) => !open)}>Bookmarks</button>
        <span className="toolbar-rule" />
        <button type="button" onClick={() => openSearch("canvas")}>Find</button>
        <button type="button" onClick={() => openSearch("project")}>Search</button>
        <button type="button" className={filterCount ? "is-active" : ""} onClick={toggleFilterPanel}>Filter{filterCount ? ` ${filterCount}` : ""}</button>
        <button type="button" onClick={() => setExportOpen(true)}>Export</button>
        <span className="toolbar-rule" />
        <button type="button" onClick={undo} disabled={pastCount === 0} title="Undo (Ctrl/Cmd+Z)">Undo</button>
        <button type="button" onClick={redo} disabled={futureCount === 0} title="Redo (Ctrl/Cmd+Shift+Z)">Redo</button>
      </nav>
      <div className={`save-indicator ${dirty ? "is-dirty" : ""}`}><span />{status}</div>
      {bookmarksOpen ? (
        <section className="bookmark-popover">
          <div className="popover-heading"><span>BOOKMARKS</span><button type="button" onClick={() => {
            const name = window.prompt("Bookmark名", `Bookmark ${bookmarks.length + 1}`);
            if (name) addBookmark(name);
          }}>+ Add</button></div>
          {bookmarks.length ? bookmarks.map((bookmark) => (
            <div className="bookmark-row" key={bookmark.id}>
              <button type="button" onClick={() => { goToBookmark(bookmark.id); setBookmarksOpen(false); }}>
                <strong>{bookmark.title}</strong>
                <small>{canvases.find((canvas) => canvas.id === bookmark.canvasId)?.title}</small>
              </button>
              <button className="bookmark-delete" type="button" onClick={() => deleteBookmark(bookmark.id)}>×</button>
            </div>
          )) : <p>Bookmarkはまだありません。</p>}
        </section>
      ) : null}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <SaveHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
      {pendingOpen ? (
        <RecoveryChoiceDialog
          candidate={pendingOpen.recovery}
          pendingOpen={pendingOpen}
          onClose={() => setPendingOpen(null)}
        />
      ) : null}
    </header>
  );
}
