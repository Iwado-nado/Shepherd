import { applyPatches, enablePatches, produce, produceWithPatches, type Draft, type Patch } from "immer";
import { create } from "zustand";
import { getAreaBounds } from "../domain/area";
import { connectsPlacementPair } from "../domain/edges";
import {
  COMPACT_CARD_HEIGHT,
  COMPACT_CARD_WIDTH,
  type AreaId,
  type CanvasId,
  type CardDisplayMode,
  type Edge,
  type EdgeDirection,
  type EdgeId,
  type EdgeLineStyle,
  type Placement,
  type PlacementId,
  type Position,
  type ProjectData,
  type ProjectFile,
  type Viewport,
} from "../domain/models";
import { clampCardSize } from "../domain/cardSize";
import { createCanvas, createId, createProjectFile, DEFAULT_CARD_SIZE } from "../domain/project";

enablePatches();

const HISTORY_LIMIT = 100;
const NAVIGATION_LIMIT = 100;

export type Selection =
  | { type: "placements"; ids: PlacementId[] }
  | { type: "edge"; id: EdgeId }
  | { type: "area"; id: AreaId }
  | { type: "card"; id: string }
  | null;

interface ClipboardData {
  cards: Array<{ oldId: string; title: string; body: string; tags: string[]; color: string; muted: boolean }>;
  placements: Placement[];
  edges: Edge[];
}

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  beforeRevision: number;
  afterRevision: number;
}

export interface NavigationLocation {
  canvasId: CanvasId;
  viewport: Viewport;
  selection: Selection;
}

export type SaveState = "idle" | "saving" | "error";
export type AutosaveState = "idle" | "saving" | "error";
export type SearchMode = "canvas" | "project" | null;
export type FilterBehavior = "dim" | "hide";
export type TagFilterMode = "any" | "all";

export interface StoryEditorSession {
  cardId: string;
  title: string;
  tags: string[];
  tagInput: string;
  body: string;
  dirty: boolean;
}

interface AppState {
  projectFile: ProjectFile;
  currentFilePath: string | null;
  selection: Selection;
  clipboard: ClipboardData | null;
  contentDirty: boolean;
  workspaceDirty: boolean;
  saveState: SaveState;
  lastError: string | null;
  autoSavePaused: boolean;
  autosaveState: AutosaveState;
  autosavedRevision: number | null;
  autosavedWorkspaceRevision: number | null;
  lastAutosavedAt: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  currentRevision: number;
  savedRevision: number | null;
  nextRevision: number;
  workspaceRevision: number;
  canvasSize: { width: number; height: number };
  viewportNonce: number;
  searchMode: SearchMode;
  searchQuery: string;
  sidebarSearchQuery: string;
  sidebarSearchScope: Exclude<SearchMode, null>;
  activeTag: string | null;
  filterTags: string[];
  filterBehavior: FilterBehavior;
  tagFilterMode: TagFilterMode;
  filterPanelOpen: boolean;
  navigationBack: NavigationLocation[];
  navigationForward: NavigationLocation[];
  storyEditor: StoryEditorSession | null;

  newProject: (title?: string) => void;
  loadProject: (projectFile: ProjectFile, path: string) => void;
  restoreProject: (projectFile: ProjectFile, path: string | null) => void;
  markSaved: (path: string, revision: number, workspaceRevision: number) => void;
  markAutosaved: (projectId: string, revision: number, workspaceRevision: number, autosavedAt: string) => void;
  setSaveState: (state: SaveState, error?: string | null) => void;
  setAutosaveState: (state: AutosaveState, error?: string | null) => void;
  setAutoSavePaused: (paused: boolean) => void;
  setCanvasSize: (width: number, height: number) => void;
  setSelection: (selection: Selection) => void;
  openStoryEditor: (cardId: string) => void;
  updateStoryEditorTitle: (title: string) => void;
  updateStoryEditorTags: (tags: string[]) => void;
  updateStoryEditorTagInput: (value: string) => void;
  updateStoryEditorBody: (body: string) => void;
  commitStoryEditor: () => void;
  closeStoryEditor: () => void;
  openSearch: (mode: Exclude<SearchMode, null>) => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  setSearchScope: (scope: Exclude<SearchMode, null>) => void;
  setSidebarSearchQuery: (query: string) => void;
  toggleSidebarSearchScope: () => void;
  setActiveTag: (tag: string | null) => void;
  toggleFilterTag: (tag: string) => void;
  setFilterBehavior: (behavior: FilterBehavior) => void;
  setTagFilterMode: (mode: TagFilterMode) => void;
  toggleFilterPanel: () => void;
  clearFilters: () => void;
  deleteTag: (tag: string) => void;
  addCanvas: () => void;
  duplicateCanvas: (canvasId: CanvasId) => void;
  moveCanvas: (canvasId: CanvasId, direction: -1 | 1) => void;
  renameCanvas: (canvasId: CanvasId, title: string) => void;
  deleteCanvas: (canvasId: CanvasId) => void;
  switchCanvas: (canvasId: CanvasId) => void;
  updateViewport: (canvasId: CanvasId, viewport: Viewport) => void;
  setDisplayMode: (mode: CardDisplayMode) => void;
  resizePlacement: (placementId: PlacementId, size: Placement["size"]) => void;
  focusPlacement: (canvasId: CanvasId, placementId: PlacementId) => void;
  focusArea: (canvasId: CanvasId, areaId: AreaId) => void;
  createCardAtCenter: () => void;
  createCardAt: (position: Position) => void;
  createUnplacedCard: () => void;
  placeExistingCard: (cardId: string, position?: Position) => void;
  updateCard: (cardId: string, changes: { title?: string; body?: string; tags?: string[]; color?: string }) => void;
  updateSelectedCardsColor: (color: string) => void;
  toggleMutedSelection: () => void;
  deleteCard: (cardId: string) => void;
  deleteCards: (cardIds: string[]) => void;
  movePlacements: (moves: Array<{ id: PlacementId; position: Position }>, areaId?: AreaId | null) => void;
  createEdge: (sourcePlacementId: PlacementId, targetPlacementId: PlacementId) => void;
  updateEdgeLabel: (edgeId: EdgeId, label: string) => void;
  updateEdgeDirection: (edgeId: EdgeId, direction: EdgeDirection) => void;
  updateEdgeLineStyle: (edgeId: EdgeId, lineStyle: EdgeLineStyle) => void;
  createArea: () => void;
  updateArea: (areaId: AreaId, changes: { title?: string; color?: string; tags?: string[] }) => void;
  toggleArea: (areaId: AreaId) => void;
  moveArea: (areaId: AreaId, delta: Position) => void;
  setStart: () => void;
  toggleStartForPlacement: (placementId: PlacementId) => void;
  goToStart: () => void;
  addBookmark: (title: string) => void;
  toggleBookmarkForPlacement: (placementId: PlacementId) => void;
  deleteBookmark: (bookmarkId: string) => void;
  goToBookmark: (bookmarkId: string) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  duplicateSelection: () => void;
  deleteSelection: () => void;
  undo: () => void;
  redo: () => void;
}

const initialProject = createProjectFile();

function positionsEqual(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function viewportsEqual(a: Viewport, b: Viewport): boolean {
  return positionsEqual(a, b) && Math.abs(a.zoom - b.zoom) < 0.0001;
}

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#+/, "")).filter(Boolean))];
}

export function tagsFromInput(value: string): string[] {
  return normalizeTags(value.split(/[#,，\s\u3000]+/u));
}

function centeredViewport(
  position: Position,
  size: { width: number; height: number },
  zoom: number,
  canvasSize: { width: number; height: number },
): Viewport {
  return {
    x: canvasSize.width / 2 - (position.x + size.width / 2) * zoom,
    y: canvasSize.height / 2 - (position.y + size.height / 2) * zoom,
    zoom,
  };
}

function cardSizeForMode(mode: CardDisplayMode) {
  return mode === "compact"
    ? { width: COMPACT_CARD_WIDTH, height: COMPACT_CARD_HEIGHT }
    : { ...DEFAULT_CARD_SIZE };
}

function cloneSelection(selection: Selection): Selection {
  return selection?.type === "placements"
    ? { type: "placements", ids: [...selection.ids] }
    : selection ? { ...selection } : null;
}

function selectionsEqual(a: Selection, b: Selection): boolean {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === "placements" && b.type === "placements") {
    return a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id));
  }
  if (a.type === "placements" || b.type === "placements") return false;
  return a.id === b.id;
}

function currentNavigationLocation(state: AppState): NavigationLocation {
  const canvasId = state.projectFile.workspace.lastOpenedCanvasId;
  const canvas = state.projectFile.project.canvases.find((item) => item.id === canvasId)!;
  return {
    canvasId,
    viewport: { ...canvas.viewport },
    selection: cloneSelection(state.selection),
  };
}

function validSelectionForCanvas(
  project: ProjectData,
  canvasId: CanvasId,
  selection: Selection,
): Selection {
  const canvas = project.canvases.find((item) => item.id === canvasId);
  if (!canvas || !selection) return null;
  if (selection.type === "placements") {
    const ids = selection.ids.filter((id) => canvas.placements.some((item) => item.id === id));
    return ids.length ? { type: "placements", ids } : null;
  }
  if (selection.type === "area") {
    return canvas.areas.some((item) => item.id === selection.id) ? selection : null;
  }
  if (selection.type === "edge") {
    return canvas.edges.some((item) => item.id === selection.id) ? selection : null;
  }
  return project.cards.some((item) => item.id === selection.id) ? selection : null;
}

export const useAppStore = create<AppState>((set, get) => {
  const commitProject = (
    label: string,
    recipe: (project: Draft<ProjectData>) => void,
  ): boolean => {
    const state = get();
    const [project, patches, inversePatches] = produceWithPatches(
      state.projectFile.project,
      (draft) => {
        recipe(draft);
        draft.updatedAt = new Date().toISOString();
      },
    );
    if (patches.length === 0) return false;

    const afterRevision = state.nextRevision;
    const entry: HistoryEntry = {
      label,
      patches,
      inversePatches,
      beforeRevision: state.currentRevision,
      afterRevision,
    };
    set({
      projectFile: { ...state.projectFile, project },
      past: [...state.past, entry].slice(-HISTORY_LIMIT),
      future: [],
      currentRevision: afterRevision,
      nextRevision: afterRevision + 1,
      contentDirty: state.savedRevision !== afterRevision,
      saveState: "idle",
      lastError: null,
    });
    return true;
  };

  const selectedCardClipboard = (state: AppState): ClipboardData | null => {
    const canvas = getActiveCanvas(state);
    const selection = state.selection;
    if (!canvas || !selection) return null;
    let placements: Placement[];
    if (selection.type === "placements") {
      const ids = new Set(selection.ids);
      placements = canvas.placements.filter((placement) => ids.has(placement.id));
    } else if (selection.type === "card") {
      const card = state.projectFile.project.cards.find((item) => item.id === selection.id);
      if (!card) return null;
      const local = canvas.placements.find((placement) => placement.cardId === card.id);
      const other = state.projectFile.project.canvases.flatMap((item) => item.placements)
        .find((placement) => placement.cardId === card.id);
      const size = local?.size ?? other?.size ?? cardSizeForMode(canvas.displayMode);
      placements = local ? [local] : [{
        id: createId(),
        cardId: card.id,
        canvasId: canvas.id,
        position: {
          x: (state.canvasSize.width / 2 - canvas.viewport.x) / canvas.viewport.zoom - size.width / 2 - 32,
          y: (state.canvasSize.height / 2 - canvas.viewport.y) / canvas.viewport.zoom - size.height / 2 - 32,
        },
        size,
      }];
    } else return null;
    if (!placements.length) return null;
    const ids = new Set(placements.map((placement) => placement.id));
    const cardIds = new Set(placements.map((placement) => placement.cardId));
    return {
      cards: state.projectFile.project.cards
        .filter((card) => cardIds.has(card.id))
        .map((card) => ({ oldId: card.id, title: card.title, body: card.body, tags: [...card.tags], color: card.color, muted: card.muted })),
      placements: placements.map((placement) => ({
        ...placement, position: { ...placement.position }, size: { ...placement.size },
      })),
      edges: canvas.edges.filter((edge) => ids.has(edge.sourcePlacementId) && ids.has(edge.targetPlacementId)),
    };
  };

  const pasteClipboard = (clipboard: ClipboardData | null, label: string) => {
    const canvasId = get().projectFile.workspace.lastOpenedCanvasId;
    if (!clipboard?.cards.length || !clipboard.placements.length ||
        !get().projectFile.project.canvases.some((canvas) => canvas.id === canvasId)) return;
    const cardMap = new Map(clipboard.cards.map((card) => [card.oldId, createId()]));
    const placements = clipboard.placements.filter((placement) => cardMap.has(placement.cardId));
    if (!placements.length) return;
    const placementMap = new Map(placements.map((placement) => [placement.id, createId()]));
    const now = new Date().toISOString();
    if (commitProject(label, (project) => {
      for (const card of clipboard.cards) {
        project.cards.push({
          id: cardMap.get(card.oldId)!,
          title: card.title,
          body: card.body,
          tags: [...card.tags],
          color: card.color,
          muted: card.muted,
          createdAt: now,
          updatedAt: now,
        });
        for (const tag of card.tags) if (!project.tags.includes(tag)) project.tags.push(tag);
      }
      const canvas = project.canvases.find((item) => item.id === canvasId);
      if (!canvas) return;
      for (const placement of placements) {
        canvas.placements.push({
          ...placement,
          id: placementMap.get(placement.id)!,
          cardId: cardMap.get(placement.cardId)!,
          canvasId,
          position: { x: placement.position.x + 32, y: placement.position.y + 32 },
          size: { ...placement.size },
          areaId: undefined,
        });
      }
      for (const edge of clipboard.edges) {
        const sourcePlacementId = placementMap.get(edge.sourcePlacementId);
        const targetPlacementId = placementMap.get(edge.targetPlacementId);
        if (sourcePlacementId && targetPlacementId) canvas.edges.push({
          ...edge,
          id: createId(),
          canvasId,
          sourcePlacementId,
          targetPlacementId,
        });
      }
    })) set({ selection: { type: "placements", ids: [...placementMap.values()] } });
  };

  const focusViewport = (
    canvasId: CanvasId,
    selection: Selection,
    position: Position,
    size: { width: number; height: number },
  ) => {
    const state = get();
    const origin = currentNavigationLocation(state);
    const project = produce(state.projectFile.project, (draft) => {
      const canvas = draft.canvases.find((item) => item.id === canvasId);
      if (canvas) {
        canvas.viewport = centeredViewport(position, size, canvas.viewport.zoom, state.canvasSize);
      }
    });
    set({
      projectFile: {
        ...state.projectFile,
        project,
        workspace: { lastOpenedCanvasId: canvasId },
      },
      selection,
      workspaceDirty: true,
      workspaceRevision: state.workspaceRevision + 1,
      viewportNonce: state.viewportNonce + 1,
      searchMode: null,
      navigationBack: [...state.navigationBack, origin].slice(-NAVIGATION_LIMIT),
      navigationForward: [],
    });
  };

  return {
    projectFile: initialProject,
    currentFilePath: null,
    selection: null,
    clipboard: null,
    contentDirty: true,
    workspaceDirty: false,
    saveState: "idle",
    lastError: null,
    autoSavePaused: false,
    autosaveState: "idle",
    autosavedRevision: null,
    autosavedWorkspaceRevision: null,
    lastAutosavedAt: null,
    past: [],
    future: [],
    currentRevision: 0,
    savedRevision: null,
    nextRevision: 1,
    workspaceRevision: 0,
    canvasSize: { width: 800, height: 600 },
    viewportNonce: 0,
    searchMode: null,
    searchQuery: "",
    sidebarSearchQuery: "",
    sidebarSearchScope: "project",
    activeTag: null,
    filterTags: [],
    filterBehavior: "dim",
    tagFilterMode: "any",
    filterPanelOpen: false,
    navigationBack: [],
    navigationForward: [],
    storyEditor: null,

    newProject: (title) => set({
      projectFile: createProjectFile(title),
      currentFilePath: null,
      selection: null,
      clipboard: null,
      contentDirty: true,
      workspaceDirty: false,
      saveState: "idle",
      lastError: null,
      autoSavePaused: false,
      autosaveState: "idle",
      autosavedRevision: null,
      autosavedWorkspaceRevision: null,
      lastAutosavedAt: null,
      past: [],
      future: [],
      currentRevision: 0,
      savedRevision: null,
      nextRevision: 1,
      workspaceRevision: 0,
      viewportNonce: 0,
      searchMode: null,
      searchQuery: "",
      sidebarSearchQuery: "",
      sidebarSearchScope: "project",
      activeTag: null,
      filterTags: [],
      filterBehavior: "dim",
      tagFilterMode: "any",
      filterPanelOpen: false,
      navigationBack: [],
      navigationForward: [],
      storyEditor: null,
    }),

    loadProject: (projectFile, path) => set({
      projectFile,
      currentFilePath: path,
      selection: null,
      clipboard: null,
      contentDirty: false,
      workspaceDirty: false,
      saveState: "idle",
      lastError: null,
      autoSavePaused: false,
      autosaveState: "idle",
      autosavedRevision: null,
      autosavedWorkspaceRevision: null,
      lastAutosavedAt: null,
      past: [],
      future: [],
      currentRevision: 0,
      savedRevision: 0,
      nextRevision: 1,
      workspaceRevision: 0,
      viewportNonce: 0,
      searchMode: null,
      searchQuery: "",
      sidebarSearchQuery: "",
      sidebarSearchScope: "project",
      activeTag: null,
      filterTags: [],
      filterBehavior: "dim",
      tagFilterMode: "any",
      filterPanelOpen: false,
      navigationBack: [],
      navigationForward: [],
      storyEditor: null,
    }),

    restoreProject: (projectFile, path) => {
      const state = get();
      const revision = state.nextRevision;
      set({
        projectFile,
        currentFilePath: path,
        selection: null,
        clipboard: null,
        contentDirty: true,
        workspaceDirty: true,
        saveState: "idle",
        lastError: null,
        autosaveState: "idle",
        autosavedRevision: null,
        autosavedWorkspaceRevision: null,
        lastAutosavedAt: null,
        past: [],
        future: [],
        currentRevision: revision,
        savedRevision: null,
        nextRevision: revision + 1,
        workspaceRevision: state.workspaceRevision + 1,
        viewportNonce: state.viewportNonce + 1,
        searchMode: null,
        searchQuery: "",
        sidebarSearchQuery: "",
        sidebarSearchScope: "project",
        navigationBack: [],
        navigationForward: [],
        storyEditor: null,
      });
    },

    markSaved: (path, revision, workspaceRevision) => {
      const state = get();
      set({
        currentFilePath: path,
        savedRevision: revision,
        contentDirty: state.currentRevision !== revision,
        workspaceDirty: state.workspaceRevision !== workspaceRevision,
        saveState: "idle",
        lastError: null,
        autosaveState: "idle",
        autosavedRevision: null,
        autosavedWorkspaceRevision: null,
        lastAutosavedAt: null,
      });
    },

    markAutosaved: (projectId, revision, workspaceRevision, autosavedAt) => {
      if (get().projectFile.project.id !== projectId) return;
      set({
        autosavedRevision: revision,
        autosavedWorkspaceRevision: workspaceRevision,
        lastAutosavedAt: autosavedAt,
        autosaveState: "idle",
        lastError: null,
      });
    },

    setSaveState: (saveState, error = null) => set({ saveState, lastError: error }),
    setAutosaveState: (autosaveState, error = null) => set({ autosaveState, lastError: error }),
    setAutoSavePaused: (autoSavePaused) => set({ autoSavePaused }),
    setCanvasSize: (width, height) => set({ canvasSize: { width, height } }),
    setSelection: (selection) => {
      if (!selectionsEqual(get().selection, selection)) set({ selection });
    },
    openStoryEditor: (cardId) => {
      const state = get();
      const card = state.projectFile.project.cards.find((item) => item.id === cardId);
      if (!card) return;
      if (state.storyEditor?.cardId === cardId) return;
      if (state.storyEditor) get().commitStoryEditor();
      set({
        storyEditor: {
          cardId,
          title: card.title,
          tags: [...card.tags],
          tagInput: "",
          body: card.body,
          dirty: false,
        },
      });
    },
    updateStoryEditorTitle: (title) => {
      const state = get();
      const session = state.storyEditor;
      if (!session || session.title === title) return;
      const card = state.projectFile.project.cards.find((item) => item.id === session.cardId);
      set({
        storyEditor: {
          ...session,
          title,
          dirty: !card || title !== card.title || session.body !== card.body ||
            session.tags.join("\0") !== card.tags.join("\0") || Boolean(session.tagInput.trim()),
        },
      });
    },
    updateStoryEditorTags: (tags) => {
      const state = get();
      const session = state.storyEditor;
      if (!session) return;
      const normalized = normalizeTags(tags);
      if (session.tags.join("\0") === normalized.join("\0")) return;
      const card = state.projectFile.project.cards.find((item) => item.id === session.cardId);
      set({
        storyEditor: {
          ...session,
          tags: normalized,
          dirty: !card || session.title !== card.title || session.body !== card.body ||
            normalized.join("\0") !== card.tags.join("\0") || Boolean(session.tagInput.trim()),
        },
      });
    },
    updateStoryEditorTagInput: (tagInput) => {
      const state = get();
      const session = state.storyEditor;
      if (!session || session.tagInput === tagInput) return;
      const card = state.projectFile.project.cards.find((item) => item.id === session.cardId);
      set({
        storyEditor: {
          ...session,
          tagInput,
          dirty: !card || session.title !== card.title || session.body !== card.body ||
            session.tags.join("\0") !== card.tags.join("\0") || Boolean(tagInput.trim()),
        },
      });
    },
    updateStoryEditorBody: (body) => {
      const state = get();
      const session = state.storyEditor;
      if (!session || session.body === body) return;
      const card = state.projectFile.project.cards.find((item) => item.id === session.cardId);
      set({
        storyEditor: {
          ...session,
          body,
          dirty: !card || session.title !== card.title || body !== card.body ||
            session.tags.join("\0") !== card.tags.join("\0") || Boolean(session.tagInput.trim()),
        },
      });
    },
    commitStoryEditor: () => {
      const session = get().storyEditor;
      if (!session?.dirty) return;
      const pendingTags = tagsFromInput(session.tagInput);
      const tags = normalizeTags([...session.tags, ...pendingTags]);
      get().updateCard(session.cardId, {
        title: session.title,
        tags,
        body: session.body,
      });
      const current = get().storyEditor;
      if (current?.cardId === session.cardId) {
        set({ storyEditor: { ...current, tags, tagInput: "", dirty: false } });
      }
    },
    closeStoryEditor: () => {
      get().commitStoryEditor();
      set({ storyEditor: null });
    },
    openSearch: (searchMode) => set({ searchMode, searchQuery: "" }),
    closeSearch: () => set({ searchMode: null, searchQuery: "" }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setSearchScope: (searchMode) => {
      if (get().searchMode) set({ searchMode });
    },
    setSidebarSearchQuery: (sidebarSearchQuery) => set({ sidebarSearchQuery }),
    toggleSidebarSearchScope: () => set((state) => ({
      sidebarSearchScope: state.sidebarSearchScope === "project" ? "canvas" : "project",
    })),
    setActiveTag: (activeTag) => set({ activeTag }),
    toggleFilterTag: (tag) => {
      const tags = get().filterTags;
      set({ filterTags: tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag] });
    },
    setFilterBehavior: (filterBehavior) => set({ filterBehavior }),
    setTagFilterMode: (tagFilterMode) => set({ tagFilterMode }),
    toggleFilterPanel: () => set((state) => ({ filterPanelOpen: !state.filterPanelOpen })),
    clearFilters: () => set({ activeTag: null, filterTags: [], filterBehavior: "dim", tagFilterMode: "any" }),
    deleteTag: (tag) => {
      const state = get();
      if (!state.projectFile.project.tags.includes(tag)) return;
      const now = new Date().toISOString();
      if (!commitProject("Delete tag", (project) => {
        project.tags = project.tags.filter((item) => item !== tag);
        for (const card of project.cards) {
          if (!card.tags.includes(tag)) continue;
          card.tags = card.tags.filter((item) => item !== tag);
          card.updatedAt = now;
        }
        for (const canvas of project.canvases) {
          for (const area of canvas.areas) area.tags = area.tags.filter((item) => item !== tag);
        }
      })) return;
      const next = get();
      const session = next.storyEditor;
      const card = session
        ? next.projectFile.project.cards.find((item) => item.id === session.cardId)
        : undefined;
      const editorTags = session?.tags.filter((item) => item !== tag) ?? [];
      const editorTagInput = session
        ? tagsFromInput(session.tagInput).filter((item) => item !== tag).join(", ")
        : "";
      set({
        activeTag: next.activeTag === tag ? null : next.activeTag,
        filterTags: next.filterTags.filter((item) => item !== tag),
        storyEditor: session && card
          ? {
              ...session,
              tags: editorTags,
              tagInput: editorTagInput,
              dirty: session.title !== card.title || session.body !== card.body ||
                editorTags.join("\0") !== card.tags.join("\0") || Boolean(editorTagInput),
            }
          : session,
      });
    },

    addCanvas: () => {
      const origin = currentNavigationLocation(get());
      const number = get().projectFile.project.canvases.length + 1;
      const canvas = createCanvas(`Canvas ${number}`);
      if (commitProject("Create canvas", (project) => void project.canvases.push(canvas))) {
        const state = get();
        set({
          projectFile: { ...state.projectFile, workspace: { lastOpenedCanvasId: canvas.id } },
          selection: null,
          workspaceDirty: true,
          workspaceRevision: state.workspaceRevision + 1,
          viewportNonce: state.viewportNonce + 1,
          navigationBack: [...state.navigationBack, origin].slice(-NAVIGATION_LIMIT),
          navigationForward: [],
        });
      }
    },

    duplicateCanvas: (canvasId) => {
      const state = get();
      const sourceIndex = state.projectFile.project.canvases.findIndex((item) => item.id === canvasId);
      const source = state.projectFile.project.canvases[sourceIndex];
      if (!source) return;
      const origin = currentNavigationLocation(state);
      const duplicateId = createId();
      const areaIds = new Map(source.areas.map((area) => [area.id, createId()]));
      const placementIds = new Map(source.placements.map((placement) => [placement.id, createId()]));
      if (commitProject("Duplicate canvas", (project) => {
        project.canvases.splice(sourceIndex + 1, 0, {
          id: duplicateId,
          title: `${source.title} Copy`,
          displayMode: source.displayMode,
          viewport: { ...source.viewport },
          areas: source.areas.map((area) => ({
            ...area,
            id: areaIds.get(area.id)!,
            canvasId: duplicateId,
            tags: [...area.tags],
          })),
          placements: source.placements.map((placement) => ({
            ...placement,
            id: placementIds.get(placement.id)!,
            canvasId: duplicateId,
            position: { ...placement.position },
            size: { ...placement.size },
            areaId: placement.areaId ? areaIds.get(placement.areaId) : undefined,
          })),
          edges: source.edges.map((edge) => ({
            ...edge,
            id: createId(),
            canvasId: duplicateId,
            sourcePlacementId: placementIds.get(edge.sourcePlacementId)!,
            targetPlacementId: placementIds.get(edge.targetPlacementId)!,
          })),
        });
      })) {
        const next = get();
        set({
          projectFile: { ...next.projectFile, workspace: { lastOpenedCanvasId: duplicateId } },
          selection: null,
          workspaceDirty: true,
          workspaceRevision: next.workspaceRevision + 1,
          viewportNonce: next.viewportNonce + 1,
          navigationBack: [...next.navigationBack, origin].slice(-NAVIGATION_LIMIT),
          navigationForward: [],
        });
      }
    },

    moveCanvas: (canvasId, direction) => {
      const canvases = get().projectFile.project.canvases;
      const index = canvases.findIndex((item) => item.id === canvasId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= canvases.length) return;
      commitProject("Reorder canvas", (project) => {
        const [canvas] = project.canvases.splice(index, 1);
        project.canvases.splice(targetIndex, 0, canvas);
      });
    },

    renameCanvas: (canvasId, title) => {
      const cleanTitle = title.trim();
      const canvas = get().projectFile.project.canvases.find((item) => item.id === canvasId);
      if (!canvas || !cleanTitle || canvas.title === cleanTitle) return;
      commitProject("Rename canvas", (project) => {
        const target = project.canvases.find((item) => item.id === canvasId);
        if (target) target.title = cleanTitle;
      });
    },

    deleteCanvas: (canvasId) => {
      const state = get();
      if (state.projectFile.project.canvases.length <= 1) return;
      const index = state.projectFile.project.canvases.findIndex((item) => item.id === canvasId);
      if (index < 0) return;
      commitProject("Delete canvas", (project) => {
        project.canvases.splice(index, 1);
        if (project.start?.canvasId === canvasId) project.start = undefined;
        project.bookmarks = project.bookmarks.filter((bookmark) => bookmark.canvasId !== canvasId);
      });
      const nextState = get();
      const navigationBack = nextState.navigationBack.filter((item) => item.canvasId !== canvasId);
      const navigationForward = nextState.navigationForward.filter((item) => item.canvasId !== canvasId);
      if (nextState.projectFile.workspace.lastOpenedCanvasId === canvasId) {
        const fallback = nextState.projectFile.project.canvases[Math.max(0, index - 1)];
        set({
          projectFile: {
            ...nextState.projectFile,
            workspace: { lastOpenedCanvasId: fallback.id },
          },
          selection: null,
          workspaceDirty: true,
          workspaceRevision: nextState.workspaceRevision + 1,
          viewportNonce: nextState.viewportNonce + 1,
          navigationBack,
          navigationForward,
        });
      } else {
        set({ navigationBack, navigationForward });
      }
    },

    switchCanvas: (canvasId) => {
      const state = get();
      if (
        canvasId === state.projectFile.workspace.lastOpenedCanvasId ||
        !state.projectFile.project.canvases.some((canvas) => canvas.id === canvasId)
      ) return;
      const origin = currentNavigationLocation(state);
      set({
        projectFile: { ...state.projectFile, workspace: { lastOpenedCanvasId: canvasId } },
        selection: null,
        workspaceDirty: true,
        workspaceRevision: state.workspaceRevision + 1,
        viewportNonce: state.viewportNonce + 1,
        navigationBack: [...state.navigationBack, origin].slice(-NAVIGATION_LIMIT),
        navigationForward: [],
      });
    },

    updateViewport: (canvasId, viewport) => {
      const state = get();
      const current = state.projectFile.project.canvases.find((canvas) => canvas.id === canvasId);
      if (!current || viewportsEqual(current.viewport, viewport)) return;
      const project = produce(state.projectFile.project, (draft) => {
        const canvas = draft.canvases.find((item) => item.id === canvasId);
        if (canvas) canvas.viewport = viewport;
      });
      set({
        projectFile: { ...state.projectFile, project },
        workspaceDirty: true,
        workspaceRevision: state.workspaceRevision + 1,
      });
    },

    setDisplayMode: (mode) => {
      const canvasId = get().projectFile.workspace.lastOpenedCanvasId;
      const canvas = get().projectFile.project.canvases.find((item) => item.id === canvasId);
      if (!canvas || canvas.displayMode === mode) return;
      const previousSize = cardSizeForMode(canvas.displayMode);
      const size = cardSizeForMode(mode);
      commitProject("Change card display mode", (project) => {
        const target = project.canvases.find((item) => item.id === canvasId);
        if (!target) return;
        target.displayMode = mode;
        for (const placement of target.placements) {
          if (placement.size.width === previousSize.width && placement.size.height === previousSize.height) {
            placement.size = { ...size };
          }
        }
      });
    },

    resizePlacement: (placementId, size) => {
      if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) return;
      const canvasId = get().projectFile.workspace.lastOpenedCanvasId;
      const placement = get().projectFile.project.canvases
        .find((canvas) => canvas.id === canvasId)?.placements.find((item) => item.id === placementId);
      if (!placement) return;
      const nextSize = clampCardSize(size);
      if (placement.size.width === nextSize.width && placement.size.height === nextSize.height) return;
      commitProject("Resize card", (project) => {
        const target = project.canvases.find((canvas) => canvas.id === canvasId)
          ?.placements.find((item) => item.id === placementId);
        if (target) target.size = nextSize;
      });
    },

    focusPlacement: (canvasId, placementId) => {
      const canvas = get().projectFile.project.canvases.find((item) => item.id === canvasId);
      const placement = canvas?.placements.find((item) => item.id === placementId);
      if (placement) {
        focusViewport(canvasId, { type: "placements", ids: [placementId] }, placement.position, placement.size);
      }
    },

    focusArea: (canvasId, areaId) => {
      const canvas = get().projectFile.project.canvases.find((item) => item.id === canvasId);
      const area = canvas?.areas.find((item) => item.id === areaId);
      if (!canvas || !area) return;
      const bounds = getAreaBounds(area, canvas.placements);
      focusViewport(canvasId, { type: "area", id: areaId }, bounds, bounds);
    },

    createCardAtCenter: () => {
      const state = get();
      const canvas = getActiveCanvas(state);
      if (!canvas) return;
      get().createCardAt({
        x: (state.canvasSize.width / 2 - canvas.viewport.x) / canvas.viewport.zoom,
        y: (state.canvasSize.height / 2 - canvas.viewport.y) / canvas.viewport.zoom,
      });
    },

    createCardAt: (center) => {
      const state = get();
      const canvasId = state.projectFile.workspace.lastOpenedCanvasId;
      const canvas = state.projectFile.project.canvases.find((item) => item.id === canvasId);
      if (!canvas) return;
      const now = new Date().toISOString();
      const cardId = createId();
      const placementId = createId();
      const size = cardSizeForMode(canvas.displayMode);
      const position = { x: center.x - size.width / 2, y: center.y - size.height / 2 };
      if (commitProject("Create card", (project) => {
        project.cards.push({ id: cardId, title: "Untitled Card", body: "", tags: [], color: "default", muted: false, createdAt: now, updatedAt: now });
        project.canvases.find((item) => item.id === canvasId)?.placements.push({
          id: placementId,
          cardId,
          canvasId,
          position,
          size,
        });
      })) set({ selection: { type: "placements", ids: [placementId] } });
    },

    createUnplacedCard: () => {
      const now = new Date().toISOString();
      const cardId = createId();
      if (commitProject("Create unplaced card", (project) => {
        project.cards.push({
          id: cardId,
          title: "Untitled Card",
          body: "",
          tags: [],
          color: "default",
          muted: false,
          createdAt: now,
          updatedAt: now,
        });
      })) set({ selection: { type: "card", id: cardId } });
    },

    placeExistingCard: (cardId, position) => {
      const state = get();
      const canvasId = state.projectFile.workspace.lastOpenedCanvasId;
      const canvas = state.projectFile.project.canvases.find((item) => item.id === canvasId);
      if (!canvas || !state.projectFile.project.cards.some((card) => card.id === cardId)) return;
      const existing = canvas.placements.find((placement) => placement.cardId === cardId);
      if (existing) {
        get().focusPlacement(canvasId, existing.id);
        return;
      }
      const placementId = createId();
      const size = cardSizeForMode(canvas.displayMode);
      const fallback = {
        x: (state.canvasSize.width / 2 - canvas.viewport.x) / canvas.viewport.zoom - size.width / 2,
        y: (state.canvasSize.height / 2 - canvas.viewport.y) / canvas.viewport.zoom - size.height / 2,
      };
      if (commitProject("Place existing card", (project) => {
        project.canvases.find((item) => item.id === canvasId)?.placements.push({
          id: placementId,
          cardId,
          canvasId,
          position: position ?? fallback,
          size,
        });
      })) set({ selection: { type: "placements", ids: [placementId] } });
    },

    updateCard: (cardId, changes) => {
      const card = get().projectFile.project.cards.find((item) => item.id === cardId);
      if (!card) return;
      const title = changes.title ?? card.title;
      const body = changes.body ?? card.body;
      const tags = changes.tags ? normalizeTags(changes.tags) : card.tags;
      const color = changes.color ?? card.color;
      if (title === card.title && body === card.body && tags.join("\0") === card.tags.join("\0") && color === card.color) return;
      commitProject("Edit card", (project) => {
        const target = project.cards.find((item) => item.id === cardId);
        if (!target) return;
        target.title = title;
        target.body = body;
        target.tags = tags;
        target.color = color;
        target.updatedAt = new Date().toISOString();
        for (const tag of tags) if (!project.tags.includes(tag)) project.tags.push(tag);
      });
    },

    updateSelectedCardsColor: (color) => {
      const state = get();
      const canvas = getActiveCanvas(state);
      const selection = state.selection;
      if (!canvas || selection?.type !== "placements" || selection.ids.length < 2) return;
      const placementIds = new Set(selection.ids);
      const cardIds = new Set(canvas.placements.filter((placement) => placementIds.has(placement.id)).map((placement) => placement.cardId));
      if (![...cardIds].some((id) => state.projectFile.project.cards.some((card) => card.id === id && card.color !== color))) return;
      const now = new Date().toISOString();
      commitProject("Change selected card colors", (project) => {
        for (const card of project.cards) {
          if (!cardIds.has(card.id) || card.color === color) continue;
          card.color = color;
          card.updatedAt = now;
        }
      });
    },

    toggleMutedSelection: () => {
      const state = get();
      const selection = state.selection;
      const canvas = getActiveCanvas(state);
      const cardIds = selection?.type === "card"
        ? [selection.id]
        : selection?.type === "placements"
          ? selection.ids.flatMap((id) => {
              const cardId = canvas?.placements.find((placement) => placement.id === id)?.cardId;
              return cardId ? [cardId] : [];
            })
          : [];
      const ids = new Set(cardIds);
      const selected = state.projectFile.project.cards.filter((card) => ids.has(card.id));
      if (!selected.length) return;
      const muted = selected.some((card) => !card.muted);
      const now = new Date().toISOString();
      commitProject(muted ? "Mute cards" : "Unmute cards", (project) => {
        for (const card of project.cards) {
          if (!ids.has(card.id) || card.muted === muted) continue;
          card.muted = muted;
          card.updatedAt = now;
        }
      });
    },

    deleteCard: (cardId) => get().deleteCards([cardId]),

    deleteCards: (cardIds) => {
      const ids = new Set(cardIds);
      if (!get().projectFile.project.cards.some((card) => ids.has(card.id))) return;
      if (commitProject(cardIds.length > 1 ? "Delete cards" : "Delete card", (project) => {
        const removedPlacementIds = new Set<PlacementId>();
        project.cards = project.cards.filter((card) => !ids.has(card.id));
        for (const canvas of project.canvases) {
          for (const placement of canvas.placements) {
            if (ids.has(placement.cardId)) removedPlacementIds.add(placement.id);
          }
          canvas.placements = canvas.placements.filter((placement) => !ids.has(placement.cardId));
        }
        for (const canvas of project.canvases) {
          canvas.edges = canvas.edges.filter(
            (edge) => !removedPlacementIds.has(edge.sourcePlacementId) && !removedPlacementIds.has(edge.targetPlacementId),
          );
        }
        if (project.start && removedPlacementIds.has(project.start.placementId)) project.start = undefined;
        for (const bookmark of project.bookmarks) {
          if (bookmark.targetPlacementId && removedPlacementIds.has(bookmark.targetPlacementId)) {
            bookmark.targetPlacementId = undefined;
          }
        }
      })) set({ selection: null });
    },

    movePlacements: (moves, areaId) => {
      if (moves.length === 0) return;
      const current = get().projectFile.project.canvases.flatMap((canvas) => canvas.placements);
      const changed = moves.some((move) => {
        const placement = current.find((item) => item.id === move.id);
        return placement && (
          !positionsEqual(placement.position, move.position) ||
          (areaId !== undefined && placement.areaId !== (areaId ?? undefined))
        );
      });
      if (!changed) return;
      commitProject(moves.length > 1 ? "Move cards" : "Move card", (project) => {
        const moveMap = new Map(moves.map((move) => [move.id, move.position]));
        for (const canvas of project.canvases) {
          for (const placement of canvas.placements) {
            const position = moveMap.get(placement.id);
            if (!position) continue;
            placement.position = position;
            if (areaId !== undefined) placement.areaId = areaId ?? undefined;
          }
        }
      });
    },

    createEdge: (sourcePlacementId, targetPlacementId) => {
      if (sourcePlacementId === targetPlacementId) return;
      const state = get();
      const canvasId = state.projectFile.workspace.lastOpenedCanvasId;
      const canvas = state.projectFile.project.canvases.find((item) => item.id === canvasId);
      if (!canvas?.placements.some((item) => item.id === sourcePlacementId) ||
          !canvas.placements.some((item) => item.id === targetPlacementId)) return;
      const existing = canvas.edges.filter((edge) => connectsPlacementPair(edge, sourcePlacementId, targetPlacementId));
      if (existing.length > 1) return; // Ambiguous legacy duplicates cannot be merged without losing data.
      if (existing.length === 1) {
        const edge = existing[0];
        if (edge.direction === "undirected" || edge.sourcePlacementId === sourcePlacementId) return;
        commitProject("Make edge bidirectional", (project) => {
          const target = project.canvases.find((item) => item.id === canvasId)
            ?.edges.find((item) => item.id === edge.id);
          if (target) target.direction = "undirected";
        });
        return;
      }
      commitProject("Create edge", (project) => {
        project.canvases.find((item) => item.id === canvasId)?.edges.push({
          id: createId(),
          canvasId,
          sourcePlacementId,
          targetPlacementId,
          label: "",
          direction: "directed",
          lineStyle: "solid",
        });
      });
    },

    updateEdgeLabel: (edgeId, label) => {
      const current = get().projectFile.project.canvases.flatMap((canvas) => canvas.edges).find((edge) => edge.id === edgeId);
      if (!current || current.label === label) return;
      commitProject("Edit edge label", (project) => {
        const edge = project.canvases.flatMap((canvas) => canvas.edges).find((item) => item.id === edgeId);
        if (edge) edge.label = label;
      });
    },

    updateEdgeDirection: (edgeId, direction) => {
      const current = get().projectFile.project.canvases.flatMap((canvas) => canvas.edges).find((edge) => edge.id === edgeId);
      if (!current || current.direction === direction) return;
      commitProject("Change edge direction", (project) => {
        const edge = project.canvases.flatMap((canvas) => canvas.edges).find((item) => item.id === edgeId);
        if (edge) edge.direction = direction;
      });
    },

    updateEdgeLineStyle: (edgeId, lineStyle) => {
      const current = get().projectFile.project.canvases.flatMap((canvas) => canvas.edges).find((edge) => edge.id === edgeId);
      if (!current || current.lineStyle === lineStyle) return;
      commitProject("Change edge line style", (project) => {
        const edge = project.canvases.flatMap((canvas) => canvas.edges).find((item) => item.id === edgeId);
        if (edge) edge.lineStyle = lineStyle;
      });
    },

    createArea: () => {
      const state = get();
      const canvasId = state.projectFile.workspace.lastOpenedCanvasId;
      const canvas = state.projectFile.project.canvases.find((item) => item.id === canvasId);
      if (!canvas) return;
      const selectedIds = state.selection?.type === "placements" ? state.selection.ids : [];
      const selected = canvas.placements.filter((item) => selectedIds.includes(item.id));
      const anchor = selected.length
        ? { x: Math.min(...selected.map((item) => item.position.x)) - 44, y: Math.min(...selected.map((item) => item.position.y)) - 68 }
        : {
            x: (state.canvasSize.width / 2 - canvas.viewport.x) / canvas.viewport.zoom - 88,
            y: (state.canvasSize.height / 2 - canvas.viewport.y) / canvas.viewport.zoom - 24,
          };
      const areaId = createId();
      if (commitProject("Create area", (project) => {
        const target = project.canvases.find((item) => item.id === canvasId);
        target?.areas.push({
          id: areaId,
          canvasId,
          title: `Area ${(target?.areas.length ?? 0) + 1}`,
          color: "default",
          tags: [],
          anchorX: anchor.x,
          anchorY: anchor.y,
          collapsed: false,
        });
        for (const placement of target?.placements ?? []) {
          if (selectedIds.includes(placement.id)) placement.areaId = areaId;
        }
      })) set({ selection: { type: "area", id: areaId } });
    },

    updateArea: (areaId, changes) => {
      const area = get().projectFile.project.canvases.flatMap((canvas) => canvas.areas).find((item) => item.id === areaId);
      if (!area) return;
      const title = changes.title ?? area.title;
      const color = changes.color ?? area.color;
      const tags = changes.tags ? normalizeTags(changes.tags) : area.tags;
      if (title === area.title && color === area.color && tags.join("\0") === area.tags.join("\0")) return;
      commitProject("Edit area", (project) => {
        const target = project.canvases.flatMap((canvas) => canvas.areas).find((item) => item.id === areaId);
        if (!target) return;
        target.title = title;
        target.color = color;
        target.tags = tags;
        for (const tag of tags) if (!project.tags.includes(tag)) project.tags.push(tag);
      });
    },

    toggleArea: (areaId) => commitProject("Toggle area", (project) => {
      const area = project.canvases.flatMap((canvas) => canvas.areas).find((item) => item.id === areaId);
      if (area) area.collapsed = !area.collapsed;
    }),

    moveArea: (areaId, delta) => {
      if (positionsEqual(delta, { x: 0, y: 0 })) return;
      commitProject("Move area", (project) => {
        const canvas = project.canvases.find((item) => item.areas.some((area) => area.id === areaId));
        const area = canvas?.areas.find((item) => item.id === areaId);
        if (!canvas || !area) return;
        const members = canvas.placements.filter((placement) => placement.areaId === areaId);
        if (members.length === 0) {
          area.anchorX += delta.x;
          area.anchorY += delta.y;
        } else {
          for (const placement of members) {
            placement.position.x += delta.x;
            placement.position.y += delta.y;
          }
        }
      });
    },

    setStart: () => {
      const state = get();
      const id = state.selection?.type === "placements" ? state.selection.ids[0] : undefined;
      if (!id) return;
      const canvas = state.projectFile.project.canvases.find((item) => item.placements.some((placement) => placement.id === id));
      const placement = canvas?.placements.find((item) => item.id === id);
      if (!canvas || !placement) return;
      const viewport = centeredViewport(placement.position, placement.size, canvas.viewport.zoom, state.canvasSize);
      commitProject("Set START", (project) => {
        project.start = { canvasId: canvas.id, placementId: placement.id, viewport };
      });
    },

    toggleStartForPlacement: (placementId) => {
      const state = get();
      const canvas = getActiveCanvas(state);
      const placement = canvas?.placements.find((item) => item.id === placementId);
      if (!canvas || !placement) return;
      if (state.projectFile.project.start?.canvasId === canvas.id && state.projectFile.project.start.placementId === placementId) {
        commitProject("Clear START", (project) => { project.start = undefined; });
        return;
      }
      const viewport = centeredViewport(placement.position, placement.size, canvas.viewport.zoom, state.canvasSize);
      commitProject("Set START", (project) => {
        project.start = { canvasId: canvas.id, placementId, viewport };
      });
    },

    goToStart: () => {
      const state = get();
      const start = state.projectFile.project.start;
      if (!start) return;
      const sourceCanvas = state.projectFile.project.canvases.find((item) => item.id === start.canvasId);
      const placement = sourceCanvas?.placements.find((item) => item.id === start.placementId);
      const viewport = placement
        ? centeredViewport(placement.position, placement.size, start.viewport.zoom, state.canvasSize)
        : start.viewport;
      const origin = currentNavigationLocation(state);
      const project = produce(state.projectFile.project, (draft) => {
        const canvas = draft.canvases.find((item) => item.id === start.canvasId);
        if (canvas) canvas.viewport = viewport;
      });
      set({
        projectFile: { ...state.projectFile, project, workspace: { lastOpenedCanvasId: start.canvasId } },
        selection: { type: "placements", ids: [start.placementId] },
        workspaceDirty: true,
        workspaceRevision: state.workspaceRevision + 1,
        viewportNonce: state.viewportNonce + 1,
        navigationBack: [...state.navigationBack, origin].slice(-NAVIGATION_LIMIT),
        navigationForward: [],
      });
    },

    addBookmark: (title) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) return;
      const state = get();
      const canvasId = state.projectFile.workspace.lastOpenedCanvasId;
      const canvas = state.projectFile.project.canvases.find((item) => item.id === canvasId);
      if (!canvas) return;
      const targetPlacementId = state.selection?.type === "placements" && state.selection.ids.length === 1
        ? state.selection.ids[0]
        : undefined;
      commitProject("Create bookmark", (project) => {
        project.bookmarks.push({
          id: createId(),
          title: cleanTitle,
          canvasId,
          ...(targetPlacementId ? { targetPlacementId } : {}),
          viewport: { ...canvas.viewport },
        });
      });
    },

    toggleBookmarkForPlacement: (placementId) => {
      const state = get();
      const canvas = getActiveCanvas(state);
      const placement = canvas?.placements.find((item) => item.id === placementId);
      if (!canvas || !placement) return;
      const existing = state.projectFile.project.bookmarks.filter((bookmark) =>
        bookmark.canvasId === canvas.id && bookmark.targetPlacementId === placementId);
      if (existing.length) {
        commitProject("Remove card bookmarks", (project) => {
          project.bookmarks = project.bookmarks.filter((bookmark) =>
            bookmark.canvasId !== canvas.id || bookmark.targetPlacementId !== placementId);
        });
        return;
      }
      const card = state.projectFile.project.cards.find((item) => item.id === placement.cardId);
      commitProject("Create bookmark", (project) => {
        project.bookmarks.push({
          id: createId(),
          title: card?.title || "Untitled Card",
          canvasId: canvas.id,
          targetPlacementId: placementId,
          viewport: { ...canvas.viewport },
        });
      });
    },

    deleteBookmark: (bookmarkId) => {
      if (!get().projectFile.project.bookmarks.some((item) => item.id === bookmarkId)) return;
      commitProject("Delete bookmark", (project) => {
        project.bookmarks = project.bookmarks.filter((item) => item.id !== bookmarkId);
      });
    },

    goToBookmark: (bookmarkId) => {
      const state = get();
      const bookmark = state.projectFile.project.bookmarks.find((item) => item.id === bookmarkId);
      if (!bookmark) return;
      const canvas = state.projectFile.project.canvases.find((item) => item.id === bookmark.canvasId);
      if (!canvas) return;
      const placement = bookmark.targetPlacementId
        ? canvas.placements.find((item) => item.id === bookmark.targetPlacementId)
        : undefined;
      const viewport = placement
        ? centeredViewport(placement.position, placement.size, bookmark.viewport.zoom, state.canvasSize)
        : bookmark.viewport;
      const origin = currentNavigationLocation(state);
      const project = produce(state.projectFile.project, (draft) => {
        const target = draft.canvases.find((item) => item.id === bookmark.canvasId);
        if (target) target.viewport = viewport;
      });
      set({
        projectFile: { ...state.projectFile, project, workspace: { lastOpenedCanvasId: bookmark.canvasId } },
        selection: bookmark.targetPlacementId
          ? { type: "placements", ids: [bookmark.targetPlacementId] }
          : null,
        navigationBack: [...state.navigationBack, origin].slice(-NAVIGATION_LIMIT),
        navigationForward: [],
        workspaceDirty: true,
        workspaceRevision: state.workspaceRevision + 1,
        viewportNonce: state.viewportNonce + 1,
      });
    },

    navigateBack: () => {
      const state = get();
      const location = state.navigationBack.at(-1);
      if (!location || !state.projectFile.project.canvases.some((item) => item.id === location.canvasId)) return;
      const current = currentNavigationLocation(state);
      const project = produce(state.projectFile.project, (draft) => {
        const canvas = draft.canvases.find((item) => item.id === location.canvasId);
        if (canvas) canvas.viewport = location.viewport;
      });
      set({
        projectFile: { ...state.projectFile, project, workspace: { lastOpenedCanvasId: location.canvasId } },
        selection: validSelectionForCanvas(project, location.canvasId, location.selection),
        navigationBack: state.navigationBack.slice(0, -1),
        navigationForward: [current, ...state.navigationForward].slice(0, NAVIGATION_LIMIT),
        workspaceDirty: true,
        workspaceRevision: state.workspaceRevision + 1,
        viewportNonce: state.viewportNonce + 1,
      });
    },

    navigateForward: () => {
      const state = get();
      const [location, ...forward] = state.navigationForward;
      if (!location || !state.projectFile.project.canvases.some((item) => item.id === location.canvasId)) return;
      const current = currentNavigationLocation(state);
      const project = produce(state.projectFile.project, (draft) => {
        const canvas = draft.canvases.find((item) => item.id === location.canvasId);
        if (canvas) canvas.viewport = location.viewport;
      });
      set({
        projectFile: { ...state.projectFile, project, workspace: { lastOpenedCanvasId: location.canvasId } },
        selection: validSelectionForCanvas(project, location.canvasId, location.selection),
        navigationBack: [...state.navigationBack, current].slice(-NAVIGATION_LIMIT),
        navigationForward: forward,
        workspaceDirty: true,
        workspaceRevision: state.workspaceRevision + 1,
        viewportNonce: state.viewportNonce + 1,
      });
    },

    copySelection: () => {
      const clipboard = selectedCardClipboard(get());
      if (clipboard) set({ clipboard });
    },

    pasteSelection: () => pasteClipboard(get().clipboard, "Paste"),

    duplicateSelection: () => pasteClipboard(selectedCardClipboard(get()), "Duplicate cards"),

    deleteSelection: () => {
      const state = get();
      const selection = state.selection;
      if (!selection) return;
      if (selection.type === "card") return;
      commitProject(
        selection.type === "placements" ? "Remove cards from canvas" : `Delete ${selection.type}`,
        (project) => {
          if (selection.type === "edge") {
            for (const canvas of project.canvases) {
              canvas.edges = canvas.edges.filter((edge) => edge.id !== selection.id);
            }
          } else if (selection.type === "area") {
            for (const canvas of project.canvases) {
              canvas.areas = canvas.areas.filter((area) => area.id !== selection.id);
              for (const placement of canvas.placements) {
                if (placement.areaId === selection.id) placement.areaId = undefined;
              }
            }
          } else {
            const ids = new Set(selection.ids);
            const canvas = project.canvases.find(
              (item) => item.id === state.projectFile.workspace.lastOpenedCanvasId,
            );
            if (!canvas) return;
            canvas.placements = canvas.placements.filter((item) => !ids.has(item.id));
            canvas.edges = canvas.edges.filter(
              (edge) => !ids.has(edge.sourcePlacementId) && !ids.has(edge.targetPlacementId),
            );
            if (project.start && ids.has(project.start.placementId)) project.start = undefined;
            for (const bookmark of project.bookmarks) {
              if (bookmark.targetPlacementId && ids.has(bookmark.targetPlacementId)) {
                bookmark.targetPlacementId = undefined;
              }
            }
          }
        },
      );
      set({ selection: null });
    },

    undo: () => {
      const state = get();
      const entry = state.past.at(-1);
      if (!entry) return;
      const project = applyPatches(state.projectFile.project, entry.inversePatches);
      const activeCanvasId = project.canvases.some((canvas) => canvas.id === state.projectFile.workspace.lastOpenedCanvasId)
        ? state.projectFile.workspace.lastOpenedCanvasId
        : project.canvases[0].id;
      set({
        projectFile: { ...state.projectFile, project, workspace: { lastOpenedCanvasId: activeCanvasId } },
        past: state.past.slice(0, -1),
        future: [entry, ...state.future],
        currentRevision: entry.beforeRevision,
        contentDirty: state.savedRevision !== entry.beforeRevision,
        workspaceDirty: state.workspaceDirty || activeCanvasId !== state.projectFile.workspace.lastOpenedCanvasId,
        workspaceRevision: activeCanvasId !== state.projectFile.workspace.lastOpenedCanvasId
          ? state.workspaceRevision + 1
          : state.workspaceRevision,
        selection: null,
      });
    },

    redo: () => {
      const state = get();
      const [entry, ...future] = state.future;
      if (!entry) return;
      const project = applyPatches(state.projectFile.project, entry.patches);
      set({
        projectFile: { ...state.projectFile, project },
        past: [...state.past, entry].slice(-HISTORY_LIMIT),
        future,
        currentRevision: entry.afterRevision,
        contentDirty: state.savedRevision !== entry.afterRevision,
        selection: null,
      });
    },
  };
});

export function getActiveCanvas(state: AppState) {
  return state.projectFile.project.canvases.find(
    (canvas) => canvas.id === state.projectFile.workspace.lastOpenedCanvasId,
  );
}
