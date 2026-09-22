import { applyPatches, enablePatches, produce, produceWithPatches, type Draft, type Patch } from "immer";
import { create } from "zustand";
import { getAreaBounds } from "../domain/area";
import {
  COMPACT_CARD_HEIGHT,
  COMPACT_CARD_WIDTH,
  type AreaId,
  type CanvasId,
  type CardDisplayMode,
  type Edge,
  type EdgeId,
  type Placement,
  type PlacementId,
  type Position,
  type ProjectData,
  type ProjectFile,
  type Viewport,
} from "../domain/models";
import { createCanvas, createId, createProjectFile, DEFAULT_CARD_SIZE } from "../domain/project";

enablePatches();

const HISTORY_LIMIT = 100;
const NAVIGATION_LIMIT = 100;
const AREA_COLORS = ["#7f9450", "#b46d55", "#557f91", "#8b6b9f", "#9a844d"];

export type Selection =
  | { type: "placements"; ids: PlacementId[] }
  | { type: "edge"; id: EdgeId }
  | { type: "area"; id: AreaId }
  | { type: "card"; id: string }
  | null;

interface ClipboardData {
  cards: Array<{ oldId: string; title: string; body: string; tags: string[] }>;
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
export type SearchMode = "canvas" | "project" | null;
export type FilterBehavior = "dim" | "hide";
export type TagFilterMode = "any" | "all";

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
  past: HistoryEntry[];
  future: HistoryEntry[];
  currentRevision: number;
  savedRevision: number | null;
  nextRevision: number;
  canvasSize: { width: number; height: number };
  viewportNonce: number;
  searchMode: SearchMode;
  searchQuery: string;
  activeTag: string | null;
  filterTags: string[];
  filterBehavior: FilterBehavior;
  tagFilterMode: TagFilterMode;
  filterPanelOpen: boolean;
  navigationBack: NavigationLocation[];
  navigationForward: NavigationLocation[];

  newProject: (title?: string) => void;
  loadProject: (projectFile: ProjectFile, path: string) => void;
  markSaved: (path: string, revision: number) => void;
  setSaveState: (state: SaveState, error?: string | null) => void;
  setAutoSavePaused: (paused: boolean) => void;
  setCanvasSize: (width: number, height: number) => void;
  setSelection: (selection: Selection) => void;
  openSearch: (mode: Exclude<SearchMode, null>) => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  setActiveTag: (tag: string | null) => void;
  toggleFilterTag: (tag: string) => void;
  setFilterBehavior: (behavior: FilterBehavior) => void;
  setTagFilterMode: (mode: TagFilterMode) => void;
  toggleFilterPanel: () => void;
  clearFilters: () => void;
  addCanvas: () => void;
  duplicateCanvas: (canvasId: CanvasId) => void;
  moveCanvas: (canvasId: CanvasId, direction: -1 | 1) => void;
  renameCanvas: (canvasId: CanvasId, title: string) => void;
  deleteCanvas: (canvasId: CanvasId) => void;
  switchCanvas: (canvasId: CanvasId) => void;
  updateViewport: (canvasId: CanvasId, viewport: Viewport) => void;
  setDisplayMode: (mode: CardDisplayMode) => void;
  focusPlacement: (canvasId: CanvasId, placementId: PlacementId) => void;
  focusArea: (canvasId: CanvasId, areaId: AreaId) => void;
  createCardAtCenter: () => void;
  createUnplacedCard: () => void;
  placeExistingCard: (cardId: string, position?: Position) => void;
  updateCard: (cardId: string, changes: { title?: string; body?: string; tags?: string[] }) => void;
  deleteCard: (cardId: string) => void;
  movePlacements: (moves: Array<{ id: PlacementId; position: Position }>, areaId?: AreaId | null) => void;
  createEdge: (sourcePlacementId: PlacementId, targetPlacementId: PlacementId) => void;
  updateEdgeLabel: (edgeId: EdgeId, label: string) => void;
  createArea: () => void;
  updateArea: (areaId: AreaId, changes: { title?: string; color?: string; tags?: string[] }) => void;
  toggleArea: (areaId: AreaId) => void;
  moveArea: (areaId: AreaId, delta: Position) => void;
  setStart: () => void;
  goToStart: () => void;
  addBookmark: (title: string) => void;
  deleteBookmark: (bookmarkId: string) => void;
  goToBookmark: (bookmarkId: string) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
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
    past: [],
    future: [],
    currentRevision: 0,
    savedRevision: null,
    nextRevision: 1,
    canvasSize: { width: 800, height: 600 },
    viewportNonce: 0,
    searchMode: null,
    searchQuery: "",
    activeTag: null,
    filterTags: [],
    filterBehavior: "dim",
    tagFilterMode: "any",
    filterPanelOpen: false,
    navigationBack: [],
    navigationForward: [],

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
      past: [],
      future: [],
      currentRevision: 0,
      savedRevision: null,
      nextRevision: 1,
      viewportNonce: 0,
      searchMode: null,
      searchQuery: "",
      activeTag: null,
      filterTags: [],
      filterBehavior: "dim",
      tagFilterMode: "any",
      filterPanelOpen: false,
      navigationBack: [],
      navigationForward: [],
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
      past: [],
      future: [],
      currentRevision: 0,
      savedRevision: 0,
      nextRevision: 1,
      viewportNonce: 0,
      searchMode: null,
      searchQuery: "",
      activeTag: null,
      filterTags: [],
      filterBehavior: "dim",
      tagFilterMode: "any",
      filterPanelOpen: false,
      navigationBack: [],
      navigationForward: [],
    }),

    markSaved: (path, revision) => {
      const state = get();
      set({
        currentFilePath: path,
        savedRevision: revision,
        contentDirty: state.currentRevision !== revision,
        workspaceDirty: false,
        saveState: "idle",
        lastError: null,
      });
    },

    setSaveState: (saveState, error = null) => set({ saveState, lastError: error }),
    setAutoSavePaused: (autoSavePaused) => set({ autoSavePaused }),
    setCanvasSize: (width, height) => set({ canvasSize: { width, height } }),
    setSelection: (selection) => {
      if (!selectionsEqual(get().selection, selection)) set({ selection });
    },
    openSearch: (searchMode) => set({ searchMode, searchQuery: "" }),
    closeSearch: () => set({ searchMode: null, searchQuery: "" }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setActiveTag: (activeTag) => set({ activeTag }),
    toggleFilterTag: (tag) => {
      const tags = get().filterTags;
      set({ filterTags: tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag] });
    },
    setFilterBehavior: (filterBehavior) => set({ filterBehavior }),
    setTagFilterMode: (tagFilterMode) => set({ tagFilterMode }),
    toggleFilterPanel: () => set((state) => ({ filterPanelOpen: !state.filterPanelOpen })),
    clearFilters: () => set({ activeTag: null, filterTags: [], filterBehavior: "dim", tagFilterMode: "any" }),

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
      set({ projectFile: { ...state.projectFile, project }, workspaceDirty: true });
    },

    setDisplayMode: (mode) => {
      const canvasId = get().projectFile.workspace.lastOpenedCanvasId;
      const canvas = get().projectFile.project.canvases.find((item) => item.id === canvasId);
      if (!canvas || canvas.displayMode === mode) return;
      const size = cardSizeForMode(mode);
      commitProject("Change card display mode", (project) => {
        const target = project.canvases.find((item) => item.id === canvasId);
        if (!target) return;
        target.displayMode = mode;
        for (const placement of target.placements) placement.size = { ...size };
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
      const canvasId = state.projectFile.workspace.lastOpenedCanvasId;
      const canvas = state.projectFile.project.canvases.find((item) => item.id === canvasId);
      if (!canvas) return;
      const now = new Date().toISOString();
      const cardId = createId();
      const placementId = createId();
      const size = cardSizeForMode(canvas.displayMode);
      const position = {
        x: (state.canvasSize.width / 2 - canvas.viewport.x) / canvas.viewport.zoom - size.width / 2,
        y: (state.canvasSize.height / 2 - canvas.viewport.y) / canvas.viewport.zoom - size.height / 2,
      };
      if (commitProject("Create card", (project) => {
        project.cards.push({ id: cardId, title: "Untitled Card", body: "", tags: [], createdAt: now, updatedAt: now });
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
      if (title === card.title && body === card.body && tags.join("\0") === card.tags.join("\0")) return;
      commitProject("Edit card", (project) => {
        const target = project.cards.find((item) => item.id === cardId);
        if (!target) return;
        target.title = title;
        target.body = body;
        target.tags = tags;
        target.updatedAt = new Date().toISOString();
        for (const tag of tags) if (!project.tags.includes(tag)) project.tags.push(tag);
      });
    },

    deleteCard: (cardId) => {
      if (!get().projectFile.project.cards.some((card) => card.id === cardId)) return;
      commitProject("Delete card", (project) => {
        project.cards = project.cards.filter((card) => card.id !== cardId);
        for (const canvas of project.canvases) {
          const removed = new Set(
            canvas.placements.filter((placement) => placement.cardId === cardId).map((item) => item.id),
          );
          canvas.placements = canvas.placements.filter((placement) => placement.cardId !== cardId);
          canvas.edges = canvas.edges.filter(
            (edge) => !removed.has(edge.sourcePlacementId) && !removed.has(edge.targetPlacementId),
          );
          if (project.start && removed.has(project.start.placementId)) project.start = undefined;
          for (const bookmark of project.bookmarks) {
            if (bookmark.targetPlacementId && removed.has(bookmark.targetPlacementId)) {
              bookmark.targetPlacementId = undefined;
            }
          }
        }
      });
      set({ selection: null });
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
      commitProject("Create edge", (project) => {
        project.canvases.find((item) => item.id === canvasId)?.edges.push({
          id: createId(),
          canvasId,
          sourcePlacementId,
          targetPlacementId,
          label: "",
          direction: "directed",
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
          color: AREA_COLORS[(target?.areas.length ?? 0) % AREA_COLORS.length],
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
        viewportNonce: state.viewportNonce + 1,
      });
    },

    copySelection: () => {
      const state = get();
      if (state.selection?.type !== "placements" || state.selection.ids.length === 0) return;
      const canvas = getActiveCanvas(state);
      if (!canvas) return;
      const ids = new Set(state.selection.ids);
      const placements = canvas.placements.filter((item) => ids.has(item.id));
      const cardIds = new Set(placements.map((item) => item.cardId));
      set({
        clipboard: {
          cards: state.projectFile.project.cards
            .filter((card) => cardIds.has(card.id))
            .map((card) => ({ oldId: card.id, title: card.title, body: card.body, tags: [...card.tags] })),
          placements: placements.map((item) => ({ ...item, position: { ...item.position }, size: { ...item.size } })),
          edges: canvas.edges.filter((edge) => ids.has(edge.sourcePlacementId) && ids.has(edge.targetPlacementId)),
        },
      });
    },

    pasteSelection: () => {
      const state = get();
      const clipboard = state.clipboard;
      if (!clipboard) return;
      const canvasId = state.projectFile.workspace.lastOpenedCanvasId;
      const cardMap = new Map(clipboard.cards.map((card) => [card.oldId, createId()]));
      const placementMap = new Map(clipboard.placements.map((item) => [item.id, createId()]));
      const now = new Date().toISOString();
      const newPlacementIds = [...placementMap.values()];
      if (commitProject("Paste", (project) => {
        for (const card of clipboard.cards) {
          project.cards.push({
            id: cardMap.get(card.oldId)!,
            title: card.title,
            body: card.body,
            tags: [...card.tags],
            createdAt: now,
            updatedAt: now,
          });
        }
        const canvas = project.canvases.find((item) => item.id === canvasId);
        const targetSize = cardSizeForMode(canvas?.displayMode ?? "standard");
        for (const placement of clipboard.placements) {
          canvas?.placements.push({
            ...placement,
            id: placementMap.get(placement.id)!,
            cardId: cardMap.get(placement.cardId)!,
            canvasId,
            position: { x: placement.position.x + 32, y: placement.position.y + 32 },
            size: { ...targetSize },
            areaId: undefined,
          });
        }
        for (const edge of clipboard.edges) {
          canvas?.edges.push({
            ...edge,
            id: createId(),
            canvasId,
            sourcePlacementId: placementMap.get(edge.sourcePlacementId)!,
            targetPlacementId: placementMap.get(edge.targetPlacementId)!,
          });
        }
      })) set({ selection: { type: "placements", ids: newPlacementIds } });
    },

    deleteSelection: () => {
      const state = get();
      const selection = state.selection;
      if (!selection) return;
      if (selection.type === "card") {
        get().deleteCard(selection.id);
        return;
      }
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
            for (const canvas of project.canvases) {
              canvas.placements = canvas.placements.filter((item) => !ids.has(item.id));
              canvas.edges = canvas.edges.filter(
                (edge) => !ids.has(edge.sourcePlacementId) && !ids.has(edge.targetPlacementId),
              );
            }
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
