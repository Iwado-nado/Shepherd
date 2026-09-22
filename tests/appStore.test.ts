import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../src/store/appStore";

describe("Core store operations", () => {
  beforeEach(() => {
    useAppStore.getState().newProject("Store test");
  });

  it("creates Card and Placement as separate records in one history operation", () => {
    useAppStore.getState().createCardAtCenter();
    const state = useAppStore.getState();
    const canvas = state.projectFile.project.canvases[0];

    expect(state.projectFile.project.cards).toHaveLength(1);
    expect(canvas.placements).toHaveLength(1);
    expect(canvas.placements[0].cardId).toBe(state.projectFile.project.cards[0].id);
    expect(state.past).toHaveLength(1);

    state.undo();
    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(0);
    expect(useAppStore.getState().projectFile.project.canvases[0].placements).toHaveLength(0);
  });

  it("allows duplicate edges, blocks self edges, and restores deletion as one operation", () => {
    const store = useAppStore.getState();
    store.createCardAtCenter();
    store.createCardAtCenter();
    const placements = useAppStore.getState().projectFile.project.canvases[0].placements;
    const [source, target] = placements;

    useAppStore.getState().createEdge(source.id, source.id);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(0);

    useAppStore.getState().createEdge(source.id, target.id);
    useAppStore.getState().createEdge(source.id, target.id);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(2);

    useAppStore.getState().setSelection({ type: "placements", ids: [source.id] });
    useAppStore.getState().deleteSelection();
    expect(useAppStore.getState().projectFile.project.canvases[0].placements).toHaveLength(1);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(0);
    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(2);

    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.canvases[0].placements).toHaveLength(2);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(2);
  });

  it("preserves the current selection when creating an Edge", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const [source, target] = useAppStore.getState().projectFile.project.canvases[0].placements;
    useAppStore.getState().setSelection({ type: "placements", ids: [source.id] });
    const selection = useAppStore.getState().selection;

    useAppStore.getState().createEdge(source.id, target.id);

    expect(useAppStore.getState().selection).toBe(selection);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(1);
  });

  it("keeps viewport changes outside history and content dirty state", () => {
    const state = useAppStore.getState();
    state.markSaved("/tmp/test.storyflow", state.currentRevision);
    const canvas = useAppStore.getState().projectFile.project.canvases[0];
    const historyLength = useAppStore.getState().past.length;

    useAppStore.getState().updateViewport(canvas.id, { x: 40, y: -20, zoom: 1.25 });
    const updated = useAppStore.getState();
    expect(updated.past).toHaveLength(historyLength);
    expect(updated.contentDirty).toBe(false);
    expect(updated.workspaceDirty).toBe(true);
  });

  it("does not publish an unchanged React Flow selection", () => {
    useAppStore.getState().createCardAtCenter();
    const placementId = useAppStore.getState().projectFile.project.canvases[0].placements[0].id;
    useAppStore.getState().setSelection({ type: "placements", ids: [placementId] });
    const selection = useAppStore.getState().selection;
    let notifications = 0;
    const unsubscribe = useAppStore.subscribe(() => {
      notifications += 1;
    });

    useAppStore.getState().setSelection({ type: "placements", ids: [placementId] });
    unsubscribe();

    expect(useAppStore.getState().selection).toBe(selection);
    expect(notifications).toBe(0);
  });

  it("keeps the active Canvas valid when undoing Canvas creation", () => {
    useAppStore.getState().addCanvas();
    expect(useAppStore.getState().projectFile.project.canvases).toHaveLength(2);
    useAppStore.getState().undo();
    const state = useAppStore.getState();
    expect(state.projectFile.project.canvases).toHaveLength(1);
    expect(state.projectFile.workspace.lastOpenedCanvasId).toBe(
      state.projectFile.project.canvases[0].id,
    );
  });

  it("registers shared tags while editing a Card", () => {
    useAppStore.getState().createCardAtCenter();
    const card = useAppStore.getState().projectFile.project.cards[0];
    useAppStore.getState().updateCard(card.id, { tags: ["#Alice", "伏線", "Alice"] });
    const project = useAppStore.getState().projectFile.project;
    expect(project.cards[0].tags).toEqual(["Alice", "伏線"]);
    expect(project.tags).toEqual(["Alice", "伏線"]);
  });

  it("creates an Area from selected Placements and moves members as one operation", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const placements = useAppStore.getState().projectFile.project.canvases[0].placements;
    useAppStore.getState().setSelection({ type: "placements", ids: placements.map((item) => item.id) });
    useAppStore.getState().createArea();
    const canvas = useAppStore.getState().projectFile.project.canvases[0];
    const area = canvas.areas[0];
    expect(canvas.placements.every((item) => item.areaId === area.id)).toBe(true);

    const before = canvas.placements.map((item) => ({ ...item.position }));
    const historyBeforeMove = useAppStore.getState().past.length;
    useAppStore.getState().moveArea(area.id, { x: 48, y: -16 });
    const moved = useAppStore.getState().projectFile.project.canvases[0].placements;
    expect(moved[0].position).toEqual({ x: before[0].x + 48, y: before[0].y - 16 });
    expect(useAppStore.getState().past).toHaveLength(historyBeforeMove + 1);
  });

  it("copies and pastes Cards, Placements, and internal Edges in one operation", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const original = useAppStore.getState().projectFile.project.canvases[0].placements;
    useAppStore.getState().createEdge(original[0].id, original[1].id);
    useAppStore.getState().setSelection({ type: "placements", ids: original.map((item) => item.id) });
    useAppStore.getState().copySelection();
    const historyBeforePaste = useAppStore.getState().past.length;
    useAppStore.getState().pasteSelection();
    const project = useAppStore.getState().projectFile.project;
    expect(project.cards).toHaveLength(4);
    expect(project.canvases[0].placements).toHaveLength(4);
    expect(project.canvases[0].edges).toHaveLength(2);
    expect(useAppStore.getState().past).toHaveLength(historyBeforePaste + 1);
  });

  it("stores START and returns to its Canvas and Viewport", () => {
    useAppStore.getState().createCardAtCenter();
    const firstCanvas = useAppStore.getState().projectFile.project.canvases[0];
    const placement = firstCanvas.placements[0];
    useAppStore.getState().setSelection({ type: "placements", ids: [placement.id] });
    useAppStore.getState().setStart();
    useAppStore.getState().addCanvas();
    expect(useAppStore.getState().projectFile.workspace.lastOpenedCanvasId).not.toBe(firstCanvas.id);

    useAppStore.getState().goToStart();
    const state = useAppStore.getState();
    expect(state.projectFile.workspace.lastOpenedCanvasId).toBe(firstCanvas.id);
    expect(state.selection).toEqual({ type: "placements", ids: [placement.id] });
  });

  it("completely deletes a Card and all dependent data", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const canvas = useAppStore.getState().projectFile.project.canvases[0];
    const [removed, remaining] = canvas.placements;
    useAppStore.getState().createEdge(removed.id, remaining.id);
    useAppStore.getState().setSelection({ type: "placements", ids: [removed.id] });
    useAppStore.getState().setStart();
    useAppStore.getState().deleteCard(removed.cardId);
    const project = useAppStore.getState().projectFile.project;
    expect(project.cards).toHaveLength(1);
    expect(project.canvases[0].placements).toHaveLength(1);
    expect(project.canvases[0].edges).toHaveLength(0);
    expect(project.start).toBeUndefined();
  });

  it("creates an unplaced Card and places the same Card on multiple Canvases", () => {
    useAppStore.getState().createUnplacedCard();
    const card = useAppStore.getState().projectFile.project.cards[0];
    expect(useAppStore.getState().projectFile.project.canvases[0].placements).toHaveLength(0);

    useAppStore.getState().placeExistingCard(card.id, { x: 16, y: 32 });
    const firstCanvas = useAppStore.getState().projectFile.project.canvases[0];
    expect(firstCanvas.placements[0].cardId).toBe(card.id);

    useAppStore.getState().addCanvas();
    useAppStore.getState().placeExistingCard(card.id, { x: 80, y: 96 });
    const project = useAppStore.getState().projectFile.project;
    expect(project.cards).toHaveLength(1);
    expect(project.canvases[1].placements[0].cardId).toBe(card.id);

    useAppStore.getState().updateCard(card.id, { title: "Shared title" });
    expect(useAppStore.getState().projectFile.project.cards[0].title).toBe("Shared title");
    expect(project.canvases[0].placements[0]).not.toBe(project.canvases[1].placements[0]);
  });

  it("does not place the same Card twice on one Canvas", () => {
    useAppStore.getState().createUnplacedCard();
    const card = useAppStore.getState().projectFile.project.cards[0];
    useAppStore.getState().placeExistingCard(card.id);
    useAppStore.getState().placeExistingCard(card.id);
    expect(useAppStore.getState().projectFile.project.canvases[0].placements).toHaveLength(1);
  });

  it("moves shared Card Placements independently across Canvases and supports Undo/Redo", () => {
    useAppStore.getState().createUnplacedCard();
    const card = useAppStore.getState().projectFile.project.cards[0];
    useAppStore.getState().placeExistingCard(card.id, { x: 16, y: 32 });
    const firstCanvas = useAppStore.getState().projectFile.project.canvases[0];
    const firstPlacement = firstCanvas.placements[0];
    useAppStore.getState().addCanvas();
    useAppStore.getState().placeExistingCard(card.id, { x: 80, y: 96 });
    const secondCanvas = useAppStore.getState().projectFile.project.canvases[1];
    const secondPlacement = secondCanvas.placements[0];

    expect(secondPlacement.id).not.toBe(firstPlacement.id);
    useAppStore.getState().movePlacements([{ id: secondPlacement.id, position: { x: 240, y: 320 } }]);
    useAppStore.getState().placeExistingCard(card.id);
    let state = useAppStore.getState();
    expect(state.projectFile.project.canvases[0].placements[0].position).toEqual({ x: 16, y: 32 });
    expect(state.projectFile.project.canvases[1].placements).toHaveLength(1);
    expect(state.projectFile.project.canvases[1].placements[0].position).toEqual({ x: 240, y: 320 });

    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.canvases[1].placements[0].position).toEqual({ x: 80, y: 96 });
    useAppStore.getState().redo();
    state = useAppStore.getState();
    expect(state.projectFile.project.canvases[1].placements[0].position).toEqual({ x: 240, y: 320 });
  });

  it("navigates Back and Forward between Canvas locations without affecting Undo history", () => {
    useAppStore.getState().createCardAtCenter();
    const firstCanvas = useAppStore.getState().projectFile.project.canvases[0];
    const firstPlacement = firstCanvas.placements[0];
    useAppStore.getState().addCanvas();
    const secondCanvas = useAppStore.getState().projectFile.project.canvases[1];
    const undoCount = useAppStore.getState().past.length;

    useAppStore.getState().focusPlacement(firstCanvas.id, firstPlacement.id);
    expect(useAppStore.getState().projectFile.workspace.lastOpenedCanvasId).toBe(firstCanvas.id);
    expect(useAppStore.getState().past).toHaveLength(undoCount);

    useAppStore.getState().navigateBack();
    expect(useAppStore.getState().projectFile.workspace.lastOpenedCanvasId).toBe(secondCanvas.id);
    expect(useAppStore.getState().navigationForward).toHaveLength(1);

    useAppStore.getState().navigateForward();
    const state = useAppStore.getState();
    expect(state.projectFile.workspace.lastOpenedCanvasId).toBe(firstCanvas.id);
    expect(state.selection).toEqual({ type: "placements", ids: [firstPlacement.id] });
  });

  it("focuses, moves, switches Canvas, and creates an Edge without replacing unrelated Node inputs", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const before = useAppStore.getState();
    const firstCanvas = before.projectFile.project.canvases[0];
    const [source, target] = firstCanvas.placements;
    const cards = before.projectFile.project.cards;
    let notifications = 0;
    const unsubscribe = useAppStore.subscribe(() => {
      notifications += 1;
    });

    useAppStore.getState().setSelection({ type: "card", id: cards[0].id });
    useAppStore.getState().focusPlacement(firstCanvas.id, source.id);

    const focused = useAppStore.getState();
    const focusedCanvas = focused.projectFile.project.canvases[0];
    expect(focused.selection).toEqual({ type: "placements", ids: [source.id] });
    expect(focusedCanvas.placements).toBe(firstCanvas.placements);
    expect(focusedCanvas.areas).toBe(firstCanvas.areas);
    expect(focused.projectFile.project.cards).toBe(cards);

    useAppStore.getState().movePlacements([{ id: source.id, position: { x: 64, y: 80 } }]);
    useAppStore.getState().addCanvas();
    useAppStore.getState().switchCanvas(firstCanvas.id);
    useAppStore.getState().createEdge(source.id, target.id);
    unsubscribe();

    const restored = useAppStore.getState().projectFile.project.canvases[0];
    expect(restored.placements[0].position).toEqual({ x: 64, y: 80 });
    expect(restored.edges).toHaveLength(1);
    expect(notifications).toBeLessThan(12);
  });

  it("clears Forward navigation after a new Canvas jump", () => {
    useAppStore.getState().addCanvas();
    const [firstCanvas, secondCanvas] = useAppStore.getState().projectFile.project.canvases;
    useAppStore.getState().navigateBack();
    expect(useAppStore.getState().navigationForward).toHaveLength(1);
    useAppStore.getState().switchCanvas(secondCanvas.id);
    expect(useAppStore.getState().projectFile.workspace.lastOpenedCanvasId).toBe(secondCanvas.id);
    expect(useAppStore.getState().navigationForward).toHaveLength(0);
    expect(firstCanvas.id).not.toBe(secondCanvas.id);
  });

  it("switches every Placement between standard and compact sizes as one operation", () => {
    useAppStore.getState().createCardAtCenter();
    const historyBefore = useAppStore.getState().past.length;

    useAppStore.getState().setDisplayMode("compact");
    let canvas = useAppStore.getState().projectFile.project.canvases[0];
    expect(canvas.displayMode).toBe("compact");
    expect(canvas.placements[0].size).toEqual({ width: 220, height: 80 });
    expect(useAppStore.getState().past).toHaveLength(historyBefore + 1);

    useAppStore.getState().undo();
    canvas = useAppStore.getState().projectFile.project.canvases[0];
    expect(canvas.displayMode).toBe("standard");
    expect(canvas.placements[0].size).toEqual({ width: 264, height: 156 });
  });

  it("duplicates a Canvas while remapping all Canvas-local IDs", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    let source = useAppStore.getState().projectFile.project.canvases[0];
    useAppStore.getState().setSelection({ type: "placements", ids: source.placements.map((item) => item.id) });
    useAppStore.getState().createArea();
    source = useAppStore.getState().projectFile.project.canvases[0];
    useAppStore.getState().createEdge(source.placements[0].id, source.placements[1].id);

    useAppStore.getState().duplicateCanvas(source.id);
    const state = useAppStore.getState();
    const duplicate = state.projectFile.project.canvases[1];
    expect(duplicate.title).toBe(`${source.title} Copy`);
    expect(duplicate.placements).toHaveLength(2);
    expect(duplicate.edges).toHaveLength(1);
    expect(duplicate.areas).toHaveLength(1);
    expect(duplicate.placements[0].id).not.toBe(source.placements[0].id);
    expect(duplicate.placements[0].cardId).toBe(source.placements[0].cardId);
    expect(duplicate.edges[0].sourcePlacementId).toBe(duplicate.placements[0].id);
    expect(duplicate.placements[0].areaId).toBe(duplicate.areas[0].id);
    expect(state.projectFile.workspace.lastOpenedCanvasId).toBe(duplicate.id);
  });

  it("stores and restores a Bookmark location without adding Undo history", () => {
    useAppStore.getState().createCardAtCenter();
    const canvas = useAppStore.getState().projectFile.project.canvases[0];
    const placement = canvas.placements[0];
    useAppStore.getState().setSelection({ type: "placements", ids: [placement.id] });
    useAppStore.getState().addBookmark("Opening beat");
    const bookmark = useAppStore.getState().projectFile.project.bookmarks[0];
    useAppStore.getState().addCanvas();
    const historyBeforeNavigation = useAppStore.getState().past.length;

    useAppStore.getState().goToBookmark(bookmark.id);
    const state = useAppStore.getState();
    expect(state.projectFile.workspace.lastOpenedCanvasId).toBe(canvas.id);
    expect(state.selection).toEqual({ type: "placements", ids: [placement.id] });
    expect(state.past).toHaveLength(historyBeforeNavigation);
  });
});
