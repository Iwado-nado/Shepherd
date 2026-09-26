import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import { useTheme } from "../../app/theme";
import { ExportDialog } from "../export/ExportDialog";
import { RecoveryChoiceDialog } from "./RecoveryChoiceDialog";
import { SaveHistoryDialog } from "./SaveHistoryDialog";
import { createNewProject, openProject, saveProject, type PendingProjectOpen } from "./projectPersistence";
import shepherdIconUrl from "../../../assets/shepherd_Icon_透過.svg?url";

type ToolbarIconName = "card" | "area" | "start" | "bookmark" | "save" | "export";

function ToolbarIcon({ name }: { name: ToolbarIconName }) {
  return (
    <svg className="toolbar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "card" ? <><rect x="2.5" y="3" width="15" height="14" rx="2" /><path d="M6 7h8M6 10h6M6 13h4" /></> : null}
      {name === "area" ? <><path d="M3 4h14v12H3z" strokeDasharray="2 2" /><path d="M7 10h6M10 7v6" /></> : null}
      {name === "start" ? <path d="m10 2 2.4 5.2 5.6.7-4.1 3.9 1.1 5.5-5-2.7-5 2.7 1.1-5.5L2 7.9l5.6-.7z" fill="currentColor" stroke="none" /> : null}
      {name === "bookmark" ? <path d="M5 2.5h10v15l-5-3.5-5 3.5z" /> : null}
      {name === "save" ? <><path d="M3 2.5h12l2 2V17.5H3z" /><path d="M6 2.5v5h8v-5M6 17.5v-6h8v6" /></> : null}
      {name === "export" ? <><path d="M11 3h6v6M17 3l-9 9" /><path d="M15 12v5H3V5h5" /></> : null}
    </svg>
  );
}

export function ProjectToolbar() {
  const { preference, setPreference } = useTheme();
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<PendingProjectOpen | null>(null);
  const hasStart = useAppStore((state) => Boolean(state.projectFile.project.start));
  const contentDirty = useAppStore((state) => state.contentDirty);
  const workspaceDirty = useAppStore((state) => state.workspaceDirty);
  const focusedEditorDirty = useAppStore((state) => Boolean(state.storyEditor?.dirty));
  const currentFilePath = useAppStore((state) => state.currentFilePath);
  const saveState = useAppStore((state) => state.saveState);
  const autosaveState = useAppStore((state) => state.autosaveState);
  const lastAutosavedAt = useAppStore((state) => state.lastAutosavedAt);
  const createCard = useAppStore((state) => state.createCardAtCenter);
  const createArea = useAppStore((state) => state.createArea);
  const goToStart = useAppStore((state) => state.goToStart);
  const bookmarks = useAppStore((state) => state.projectFile.project.bookmarks);
  const canvases = useAppStore((state) => state.projectFile.project.canvases);
  const goToBookmark = useAppStore((state) => state.goToBookmark);

  const dirty = contentDirty || workspaceDirty || focusedEditorDirty || !currentFilePath;
  const status = saveState === "saving"
    ? "Saving..."
    : autosaveState === "saving"
      ? "Creating recovery..."
      : dirty && lastAutosavedAt
        ? `Recovery ${new Date(lastAutosavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : dirty ? "Unsaved changes" : "Saved";

  return (
    <header className="project-toolbar">
      <div className="brand-block">
        <button className="brand-mark" type="button" aria-label="Project menu" aria-expanded={projectMenuOpen} onClick={() => setProjectMenuOpen((open) => !open)}>
          <img src={shepherdIconUrl} alt="" aria-hidden="true" />
        </button>
        <div><strong>SHEPHERD</strong></div>
      </div>
      <nav className="toolbar-actions" aria-label="Project actions">
        <button className="primary-button" type="button" onClick={createCard}><ToolbarIcon name="card" />Card</button>
        <button type="button" onClick={createArea}><ToolbarIcon name="area" />Area</button>
        <button className="special-action start-action" type="button" disabled={!hasStart} onClick={goToStart}><ToolbarIcon name="start" />START</button>
        <button className="special-action" type="button" onClick={() => setBookmarksOpen((open) => !open)}><ToolbarIcon name="bookmark" />Bookmarks</button>
        <button type="button" onClick={() => void saveProject()}><ToolbarIcon name="save" />Save</button>
        <button type="button" onClick={() => setExportOpen(true)}><ToolbarIcon name="export" />Export</button>
      </nav>
      <select className="theme-select" aria-label="Theme" value={preference} onChange={(event) => setPreference(event.target.value as typeof preference)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <div className={`save-indicator ${dirty ? "is-dirty" : ""}`}><span />{status}</div>
      {projectMenuOpen ? (
        <section className="project-menu" aria-label="Project menu" onKeyDown={(event) => { if (event.key === "Escape") setProjectMenuOpen(false); }}>
          <button type="button" onClick={() => { setProjectMenuOpen(false); void createNewProject(); }}>New</button>
          <button type="button" onClick={() => { setProjectMenuOpen(false); void openProject().then(setPendingOpen); }}>Open</button>
          <button type="button" onClick={() => { setProjectMenuOpen(false); void saveProject(true); }}>Save As</button>
          <button type="button" onClick={() => { setProjectMenuOpen(false); setHistoryOpen(true); }}>History</button>
        </section>
      ) : null}
      {bookmarksOpen ? (
        <section className="bookmark-popover">
          <div className="popover-heading"><span>BOOKMARKS</span><button type="button" aria-label="Bookmarksを閉じる" onClick={() => setBookmarksOpen(false)}>×</button></div>
          {bookmarks.length ? bookmarks.map((bookmark) => (
            <div className="bookmark-row" key={bookmark.id}>
              <button type="button" onClick={() => { goToBookmark(bookmark.id); setBookmarksOpen(false); }}>
                <strong>{bookmark.title}</strong>
                <small>{canvases.find((canvas) => canvas.id === bookmark.canvasId)?.title}</small>
              </button>
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
