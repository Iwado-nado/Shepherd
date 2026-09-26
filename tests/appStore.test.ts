import { beforeEach, describe, expect, it } from "vitest";
import { tagsFromInput, useAppStore } from "../src/store/appStore";
import { CARD_SIZE_PRESETS } from "../src/domain/cardSize";
import { parseProjectFile, serializeProjectFile } from "../src/domain/projectFile";
import { getAreaBounds } from "../src/domain/area";

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

  it("creates and selects a Card centered at a flow position as one history operation", () => {
    useAppStore.getState().createCardAt({ x: 400, y: 300 });
    let state = useAppStore.getState();
    const placement = state.projectFile.project.canvases[0].placements[0];

    expect(placement.position).toEqual({ x: 268, y: 222 });
    expect(state.selection).toEqual({ type: "placements", ids: [placement.id] });
    expect(state.past).toHaveLength(1);

    state.undo();
    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(0);
    useAppStore.getState().redo();
    state = useAppStore.getState();
    expect(state.projectFile.project.cards).toHaveLength(1);
    expect(state.projectFile.project.canvases[0].placements[0].position).toEqual({ x: 268, y: 222 });
  });

  it("blocks duplicate and self Edges, and restores deletion as one operation", () => {
    const store = useAppStore.getState();
    store.createCardAtCenter();
    store.createCardAtCenter();
    const placements = useAppStore.getState().projectFile.project.canvases[0].placements;
    const [source, target] = placements;

    useAppStore.getState().createEdge(source.id, source.id);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(0);

    useAppStore.getState().createEdge(source.id, target.id);
    useAppStore.getState().createEdge(source.id, target.id);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(1);

    useAppStore.getState().setSelection({ type: "placements", ids: [source.id] });
    useAppStore.getState().deleteSelection();
    expect(useAppStore.getState().projectFile.project.canvases[0].placements).toHaveLength(1);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(0);
    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(2);

    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.canvases[0].placements).toHaveLength(2);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(1);
  });

  it("turns a reverse connection into one bidirectional Edge without changing its ID, label or style", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const [a, b] = useAppStore.getState().projectFile.project.canvases[0].placements;
    useAppStore.getState().createEdge(a.id, b.id);
    const edgeId = useAppStore.getState().projectFile.project.canvases[0].edges[0].id;
    useAppStore.getState().updateEdgeLabel(edgeId, "自動ブランチ");
    useAppStore.getState().updateEdgeLineStyle(edgeId, "dotted");
    const historyBefore = useAppStore.getState().past.length;

    useAppStore.getState().createEdge(a.id, b.id);
    expect(useAppStore.getState().past).toHaveLength(historyBefore);
    useAppStore.getState().createEdge(b.id, a.id);
    let state = useAppStore.getState();
    expect(state.past).toHaveLength(historyBefore + 1);
    expect(state.projectFile.project.canvases[0].edges).toEqual([expect.objectContaining({
      id: edgeId, sourcePlacementId: a.id, targetPlacementId: b.id,
      direction: "undirected", label: "自動ブランチ", lineStyle: "dotted",
    })]);

    state.createEdge(b.id, a.id);
    state.createEdge(a.id, b.id);
    expect(useAppStore.getState().past).toHaveLength(historyBefore + 1);
    state.undo();
    expect(useAppStore.getState().projectFile.project.canvases[0].edges[0]).toMatchObject({ id: edgeId, direction: "directed" });
    useAppStore.getState().redo();
    state = useAppStore.getState();
    expect(parseProjectFile(serializeProjectFile(state.projectFile)).project.canvases[0].edges)
      .toEqual([expect.objectContaining({ id: edgeId, direction: "undirected", lineStyle: "dotted" })]);

    state.setSelection({ type: "edge", id: edgeId });
    state.deleteSelection();
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(0);
    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(1);
  });

  it("does not add or alter Edges for a legacy pair with conflicting authored labels", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const [a, b] = useAppStore.getState().projectFile.project.canvases[0].placements;
    useAppStore.getState().createEdge(a.id, b.id);
    const legacy = structuredClone(useAppStore.getState().projectFile);
    const existing = legacy.project.canvases[0].edges[0];
    legacy.project.canvases[0].edges.push({ ...existing, id: `${existing.id}-other`, label: "異なる分岐" });
    useAppStore.getState().loadProject(parseProjectFile(serializeProjectFile(legacy)), "/tmp/legacy.storyflow");

    const state = useAppStore.getState();
    state.createEdge(a.id, b.id);
    state.createEdge(b.id, a.id);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toEqual(legacy.project.canvases[0].edges);
    expect(useAppStore.getState().past).toHaveLength(0);
  });

  it("preserves the current selection when creating an Edge and supports Undo/Redo", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const [source, target] = useAppStore.getState().projectFile.project.canvases[0].placements;
    useAppStore.getState().setSelection({ type: "placements", ids: [source.id] });
    const selection = useAppStore.getState().selection;

    useAppStore.getState().createEdge(source.id, target.id);

    expect(useAppStore.getState().selection).toBe(selection);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(1);

    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(0);
    useAppStore.getState().redo();
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toHaveLength(1);
  });

  it("changes Edge direction and line style independently with one Undo/Redo step each", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const [source, target] = useAppStore.getState().projectFile.project.canvases[0].placements;
    useAppStore.getState().createEdge(source.id, target.id);
    const edgeId = useAppStore.getState().projectFile.project.canvases[0].edges[0].id;
    useAppStore.getState().setSelection({ type: "edge", id: edgeId });
    const historyBefore = useAppStore.getState().past.length;

    useAppStore.getState().updateEdgeDirection(edgeId, "undirected");
    useAppStore.getState().updateEdgeLineStyle(edgeId, "dashed");
    let state = useAppStore.getState();
    expect(state.projectFile.project.canvases[0].edges[0]).toMatchObject({ direction: "undirected", lineStyle: "dashed" });
    expect(state.selection).toEqual({ type: "edge", id: edgeId });
    expect(state.past).toHaveLength(historyBefore + 2);
    state.updateEdgeLineStyle(edgeId, "dashed");
    expect(useAppStore.getState().past).toHaveLength(historyBefore + 2);

    state.undo();
    expect(useAppStore.getState().projectFile.project.canvases[0].edges[0]).toMatchObject({ direction: "undirected", lineStyle: "solid" });
    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.canvases[0].edges[0]).toMatchObject({ direction: "directed", lineStyle: "solid" });
    useAppStore.getState().redo();
    useAppStore.getState().redo();
    state = useAppStore.getState();
    expect(parseProjectFile(serializeProjectFile(state.projectFile)).project.canvases[0].edges[0])
      .toMatchObject({ id: edgeId, direction: "undirected", lineStyle: "dashed" });
  });

  it("keeps viewport changes outside history and content dirty state", () => {
    const state = useAppStore.getState();
    state.markSaved("/tmp/test.storyflow", state.currentRevision, state.workspaceRevision);
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

  it("persists Card and Area colors and shared Card Muted state through Undo/Redo and Save/Open", () => {
    useAppStore.getState().createUnplacedCard();
    const cardId = useAppStore.getState().projectFile.project.cards[0].id;
    useAppStore.getState().updateCard(cardId, { color: "sage" });
    useAppStore.getState().toggleMutedSelection();
    const historyAfterMute = useAppStore.getState().past.length;
    expect(useAppStore.getState().projectFile.project.cards[0]).toMatchObject({ color: "sage", muted: true });
    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.cards[0]).toMatchObject({ color: "sage", muted: false });
    useAppStore.getState().redo();
    expect(useAppStore.getState().projectFile.project.cards[0].muted).toBe(true);
    expect(useAppStore.getState().past).toHaveLength(historyAfterMute);

    useAppStore.getState().placeExistingCard(cardId);
    useAppStore.getState().addCanvas();
    useAppStore.getState().placeExistingCard(cardId);
    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(1);
    expect(useAppStore.getState().projectFile.project.canvases.map((canvas) => canvas.placements[0].cardId))
      .toEqual([cardId, cardId]);

    useAppStore.getState().createArea();
    const areaId = useAppStore.getState().projectFile.project.canvases[1].areas[0].id;
    expect(useAppStore.getState().projectFile.project.canvases[1].areas[0].color).toBe("default");
    useAppStore.getState().updateArea(areaId, { color: "clay" });
    expect(useAppStore.getState().projectFile.project.canvases[0].areas).toHaveLength(0);
    expect(useAppStore.getState().projectFile.project.canvases[1].areas[0].color).toBe("clay");
    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.canvases[1].areas[0].color).toBe("default");
    useAppStore.getState().redo();
    const persisted = parseProjectFile(serializeProjectFile(useAppStore.getState().projectFile));
    expect(persisted.project.cards[0]).toMatchObject({ color: "sage", muted: true });
    expect(persisted.project.canvases[1].areas[0].color).toBe("clay");
  });

  it("toggles all selected Cards Muted in a single history operation without changing selection", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const placements = useAppStore.getState().projectFile.project.canvases[0].placements;
    useAppStore.getState().setSelection({ type: "placements", ids: placements.map((placement) => placement.id) });
    const historyBefore = useAppStore.getState().past.length;
    useAppStore.getState().toggleMutedSelection();
    expect(useAppStore.getState().projectFile.project.cards.map((card) => card.muted)).toEqual([true, true]);
    expect(useAppStore.getState().past).toHaveLength(historyBefore + 1);
    expect(useAppStore.getState().selection).toEqual({ type: "placements", ids: placements.map((placement) => placement.id) });
    useAppStore.getState().toggleMutedSelection();
    expect(useAppStore.getState().projectFile.project.cards.map((card) => card.muted)).toEqual([false, false]);
    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.cards.map((card) => card.muted)).toEqual([true, true]);
  });

  it("parses Card and Area Tag inputs using commas and half/full-width spaces", () => {
    const parsed = tagsFromInput("#Alice,Bob　伏線 王都，Alice\n後半\t秘密");
    expect(parsed).toEqual(["Alice", "Bob", "伏線", "王都", "後半", "秘密"]);
    useAppStore.getState().createCardAtCenter();
    const cardId = useAppStore.getState().projectFile.project.cards[0].id;
    useAppStore.getState().updateCard(cardId, { tags: parsed });
    const placement = useAppStore.getState().projectFile.project.canvases[0].placements[0];
    useAppStore.getState().setSelection({ type: "placements", ids: [placement.id] });
    useAppStore.getState().createArea();
    const areaId = useAppStore.getState().projectFile.project.canvases[0].areas[0].id;
    useAppStore.getState().updateArea(areaId, { tags: tagsFromInput("前半 中盤，後半") });
    expect(useAppStore.getState().projectFile.project.cards[0].tags).toEqual(parsed);
    expect(useAppStore.getState().projectFile.project.canvases[0].areas[0].tags).toEqual(["前半", "中盤", "後半"]);
  });

  it("deletes a Project Tag and every reference as one undoable operation", () => {
    useAppStore.getState().createCardAtCenter();
    const card = useAppStore.getState().projectFile.project.cards[0];
    const placement = useAppStore.getState().projectFile.project.canvases[0].placements[0];
    useAppStore.getState().updateCard(card.id, { tags: ["shared", "keep"] });
    useAppStore.getState().setSelection({ type: "placements", ids: [placement.id] });
    useAppStore.getState().createArea();
    const area = useAppStore.getState().projectFile.project.canvases[0].areas[0];
    useAppStore.getState().updateArea(area.id, { tags: ["shared", "area"] });
    useAppStore.getState().setActiveTag("shared");
    useAppStore.getState().toggleFilterTag("shared");
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorTagInput("shared, draft");
    const historyBeforeDelete = useAppStore.getState().past.length;

    useAppStore.getState().deleteTag("shared");
    let state = useAppStore.getState();
    expect(state.projectFile.project.tags).toEqual(["keep", "area"]);
    expect(state.projectFile.project.cards[0].tags).toEqual(["keep"]);
    expect(state.projectFile.project.canvases[0].areas[0].tags).toEqual(["area"]);
    expect(state.activeTag).toBeNull();
    expect(state.filterTags).toEqual([]);
    expect(state.storyEditor?.tags).toEqual(["keep"]);
    expect(state.storyEditor?.tagInput).toBe("draft");
    expect(state.past).toHaveLength(historyBeforeDelete + 1);

    state.undo();
    state = useAppStore.getState();
    expect(state.projectFile.project.tags).toContain("shared");
    expect(state.projectFile.project.cards[0].tags).toContain("shared");
    expect(state.projectFile.project.canvases[0].areas[0].tags).toContain("shared");

    state.redo();
    state = useAppStore.getState();
    expect(state.projectFile.project.tags).not.toContain("shared");
    expect(state.projectFile.project.cards[0].tags).not.toContain("shared");
    expect(state.projectFile.project.canvases[0].areas[0].tags).not.toContain("shared");
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

  it("creates an Area around the multi-selection and changes all selected Card colors in one operation", () => {
    useAppStore.getState().createCardAt({ x: -160, y: -80 });
    useAppStore.getState().createCardAt({ x: 460, y: 330 });
    const placements = useAppStore.getState().projectFile.project.canvases[0].placements;
    useAppStore.getState().setSelection({ type: "placements", ids: placements.map((placement) => placement.id) });
    const before = useAppStore.getState().past.length;
    useAppStore.getState().updateSelectedCardsColor("mauve");
    expect(useAppStore.getState().past).toHaveLength(before + 1);
    expect(useAppStore.getState().projectFile.project.cards.map((card) => card.color)).toEqual(["mauve", "mauve"]);

    useAppStore.getState().createArea();
    const canvas = useAppStore.getState().projectFile.project.canvases[0];
    const area = canvas.areas[0];
    const bounds = getAreaBounds(area, canvas.placements);
    expect(canvas.placements.every((placement) => placement.areaId === area.id)).toBe(true);
    for (const placement of canvas.placements) {
      expect(placement.position.x).toBeGreaterThan(bounds.x);
      expect(placement.position.y).toBeGreaterThan(bounds.y);
      expect(placement.position.x + placement.size.width).toBeLessThan(bounds.x + bounds.width);
      expect(placement.position.y + placement.size.height).toBeLessThan(bounds.y + bounds.height);
    }
    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.canvases[0].areas).toHaveLength(0);
    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.cards.map((card) => card.color)).toEqual(["default", "default"]);
    useAppStore.getState().redo();
    useAppStore.getState().redo();
    expect(useAppStore.getState().projectFile.project.canvases[0].areas).toHaveLength(1);
  });

  it("copies and pastes Cards, Placements, and internal Edges in one operation", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const original = useAppStore.getState().projectFile.project.canvases[0].placements;
    useAppStore.getState().createEdge(original[0].id, original[1].id);
    const edgeId = useAppStore.getState().projectFile.project.canvases[0].edges[0].id;
    useAppStore.getState().updateEdgeDirection(edgeId, "undirected");
    useAppStore.getState().updateEdgeLineStyle(edgeId, "dotted");
    useAppStore.getState().setSelection({ type: "placements", ids: original.map((item) => item.id) });
    useAppStore.getState().copySelection();
    const historyBeforePaste = useAppStore.getState().past.length;
    useAppStore.getState().pasteSelection();
    const project = useAppStore.getState().projectFile.project;
    expect(project.cards).toHaveLength(4);
    expect(project.canvases[0].placements).toHaveLength(4);
    expect(project.canvases[0].edges).toHaveLength(2);
    expect(project.canvases[0].edges[1]).toMatchObject({ direction: "undirected", lineStyle: "dotted" });
    expect(project.canvases[0].edges[1].sourcePlacementId).toBe(project.canvases[0].placements[2].id);
    expect(useAppStore.getState().past).toHaveLength(historyBeforePaste + 1);
  });

  it("copies Card color and Muted state as independent data on Duplicate/Paste", () => {
    useAppStore.getState().createCardAtCenter();
    const original = useAppStore.getState().projectFile.project.cards[0];
    useAppStore.getState().updateCard(original.id, { color: "slate" });
    useAppStore.getState().toggleMutedSelection();
    useAppStore.getState().copySelection();
    useAppStore.getState().pasteSelection();
    const copy = useAppStore.getState().projectFile.project.cards[1];
    expect(copy).toMatchObject({ color: "slate", muted: true });
    useAppStore.getState().setSelection({ type: "card", id: copy.id });
    useAppStore.getState().toggleMutedSelection();
    expect(useAppStore.getState().projectFile.project.cards.find((card) => card.id === original.id)?.muted).toBe(true);
    expect(useAppStore.getState().projectFile.project.cards.find((card) => card.id === copy.id)?.muted).toBe(false);
  });

  it("duplicates multiple Cards and only their internal Edges with independent IDs and sizes", () => {
    for (let index = 0; index < 3; index += 1) useAppStore.getState().createCardAtCenter();
    const original = useAppStore.getState().projectFile.project.canvases[0].placements;
    const cards = useAppStore.getState().projectFile.project.cards;
    useAppStore.getState().updateCard(cards[0].id, { title: "Opening", body: "Original story", tags: ["plot"] });
    useAppStore.getState().resizePlacement(original[0].id, { width: 420, height: 310 });
    useAppStore.getState().createEdge(original[0].id, original[1].id);
    useAppStore.getState().createEdge(original[1].id, original[2].id);
    useAppStore.getState().setSelection({ type: "placements", ids: original.slice(0, 2).map((item) => item.id) });
    const clipboard = useAppStore.getState().clipboard;
    const historyBefore = useAppStore.getState().past.length;

    useAppStore.getState().duplicateSelection();
    let state = useAppStore.getState();
    const canvas = state.projectFile.project.canvases[0];
    const [firstCopy, secondCopy] = canvas.placements.slice(3);
    expect(state.past).toHaveLength(historyBefore + 1);
    expect(state.clipboard).toBe(clipboard);
    expect(state.projectFile.project.cards).toHaveLength(5);
    expect(canvas.placements).toHaveLength(5);
    expect(canvas.edges).toHaveLength(3);
    expect(firstCopy.id).not.toBe(original[0].id);
    expect(firstCopy.cardId).not.toBe(original[0].cardId);
    expect(firstCopy.size).toEqual({ width: 420, height: 310 });
    expect(firstCopy.position).toEqual({
      x: original[0].position.x + 32,
      y: original[0].position.y + 32,
    });
    expect(state.projectFile.project.cards.find((card) => card.id === firstCopy.cardId))
      .toMatchObject({ title: "Opening", body: "Original story", tags: ["plot"] });
    expect(canvas.edges[2]).toMatchObject({
      sourcePlacementId: firstCopy.id,
      targetPlacementId: secondCopy.id,
    });
    expect(state.selection).toEqual({ type: "placements", ids: [firstCopy.id, secondCopy.id] });

    state.updateCard(firstCopy.cardId, { title: "Independent", body: "Different" });
    expect(useAppStore.getState().projectFile.project.cards.find((card) => card.id === original[0].cardId))
      .toMatchObject({ title: "Opening", body: "Original story" });
    useAppStore.getState().undo(); // Edit copy
    useAppStore.getState().undo(); // Duplicate
    state = useAppStore.getState();
    expect(state.projectFile.project.cards).toHaveLength(3);
    expect(state.projectFile.project.canvases[0].edges).toHaveLength(2);
    state.redo();
    expect(useAppStore.getState().projectFile.project.canvases[0].placements[3].id).toBe(firstCopy.id);
    expect(useAppStore.getState().projectFile.project.canvases[0].edges[2].sourcePlacementId).toBe(firstCopy.id);
  });

  it("pastes independent Cards on another Canvas without resetting copied Placement sizes", () => {
    useAppStore.getState().createCardAtCenter();
    const original = useAppStore.getState().projectFile.project.canvases[0].placements[0];
    const originalCard = useAppStore.getState().projectFile.project.cards[0];
    useAppStore.getState().resizePlacement(original.id, { width: 264, height: 380 });
    useAppStore.getState().setSelection({ type: "placements", ids: [original.id] });
    useAppStore.getState().copySelection();
    useAppStore.getState().addCanvas();
    useAppStore.getState().setDisplayMode("compact");
    useAppStore.getState().pasteSelection();

    const state = useAppStore.getState();
    const pasted = state.projectFile.project.canvases[1].placements[0];
    expect(pasted.size).toEqual({ width: 264, height: 380 });
    expect(pasted.cardId).not.toBe(originalCard.id);
    expect(state.projectFile.project.canvases[0].placements[0].cardId).toBe(originalCard.id);
    expect(state.projectFile.project.cards).toHaveLength(2);
  });

  it("duplicates a selected unplaced Project Card into the active Canvas as a new Card", () => {
    useAppStore.getState().createUnplacedCard();
    const originalCard = useAppStore.getState().projectFile.project.cards[0];
    const historyBefore = useAppStore.getState().past.length;
    useAppStore.getState().duplicateSelection();
    const state = useAppStore.getState();
    const placement = state.projectFile.project.canvases[0].placements[0];
    expect(state.past).toHaveLength(historyBefore + 1);
    expect(state.projectFile.project.cards).toHaveLength(2);
    expect(placement.cardId).not.toBe(originalCard.id);
    expect(state.selection).toEqual({ type: "placements", ids: [placement.id] });
    expect(state.projectFile.project.cards[0].id).toBe(originalCard.id);
  });

  it("restores clipboard Tags when pasting after a Project Tag was deleted", () => {
    useAppStore.getState().createCardAtCenter();
    const card = useAppStore.getState().projectFile.project.cards[0];
    useAppStore.getState().updateCard(card.id, { tags: ["plot"] });
    useAppStore.getState().copySelection();
    useAppStore.getState().deleteTag("plot");
    useAppStore.getState().pasteSelection();

    const saved = parseProjectFile(serializeProjectFile(useAppStore.getState().projectFile));
    expect(saved.project.tags).toEqual(["plot"]);
    expect(saved.project.cards[0].tags).toEqual([]);
    expect(saved.project.cards[1].tags).toEqual(["plot"]);
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

  it("toggles START and Card Bookmarks for the active Placement without changing the Card", () => {
    useAppStore.getState().createCardAtCenter();
    const canvas = useAppStore.getState().projectFile.project.canvases[0];
    const placement = canvas.placements[0];
    const cardId = placement.cardId;
    const before = useAppStore.getState().past.length;

    useAppStore.getState().toggleStartForPlacement(placement.id);
    useAppStore.getState().toggleBookmarkForPlacement(placement.id);
    let state = useAppStore.getState();
    expect(state.past).toHaveLength(before + 2);
    expect(state.projectFile.project.start).toMatchObject({ canvasId: canvas.id, placementId: placement.id });
    expect(state.projectFile.project.bookmarks).toEqual([expect.objectContaining({
      canvasId: canvas.id, targetPlacementId: placement.id,
    })]);
    expect(state.projectFile.project.cards[0].id).toBe(cardId);

    state.toggleStartForPlacement(placement.id);
    state.toggleBookmarkForPlacement(placement.id);
    state = useAppStore.getState();
    expect(state.projectFile.project.start).toBeUndefined();
    expect(state.projectFile.project.bookmarks).toEqual([]);
    state.undo();
    expect(useAppStore.getState().projectFile.project.bookmarks).toHaveLength(1);
    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.start?.placementId).toBe(placement.id);
    expect(parseProjectFile(serializeProjectFile(useAppStore.getState().projectFile)).project.start?.placementId).toBe(placement.id);

    useAppStore.getState().addCanvas();
    useAppStore.getState().placeExistingCard(cardId);
    const historyBeforeWrongCanvas = useAppStore.getState().past.length;
    useAppStore.getState().toggleStartForPlacement(placement.id);
    useAppStore.getState().toggleBookmarkForPlacement(placement.id);
    expect(useAppStore.getState().past).toHaveLength(historyBeforeWrongCanvas);
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

  it("resizes each shared Card Placement independently in one Undo/Redo operation", () => {
    useAppStore.getState().createCardAtCenter();
    const card = useAppStore.getState().projectFile.project.cards[0];
    const first = useAppStore.getState().projectFile.project.canvases[0].placements[0];
    useAppStore.getState().addCanvas();
    useAppStore.getState().placeExistingCard(card.id);
    const second = useAppStore.getState().projectFile.project.canvases[1].placements[0];
    const historyBefore = useAppStore.getState().past.length;

    useAppStore.getState().resizePlacement(second.id, { width: 424, height: 320 });
    let state = useAppStore.getState();
    expect(state.past).toHaveLength(historyBefore + 1);
    expect(state.projectFile.project.canvases[0].placements[0].size).toEqual(first.size);
    expect(state.projectFile.project.canvases[1].placements[0].size).toEqual({ width: 424, height: 320 });
    expect(state.selection).toEqual({ type: "placements", ids: [second.id] });

    state.undo();
    expect(useAppStore.getState().projectFile.project.canvases[1].placements[0].size).toEqual({ width: 264, height: 156 });
    useAppStore.getState().redo();
    state = useAppStore.getState();
    expect(state.projectFile.project.canvases[1].placements[0].size).toEqual({ width: 424, height: 320 });

    state.updateCard(card.id, { title: "Shared", body: "Story", tags: ["plot"] });
    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(1);
    state.switchCanvas(first.canvasId);
    expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].size).toEqual(first.size);
    useAppStore.getState().resizePlacement(first.id, { width: 264, height: 440 });
    expect(useAppStore.getState().projectFile.project.canvases[1].placements[0].size).toEqual({ width: 424, height: 320 });
    useAppStore.getState().movePlacements([{ id: first.id, position: { x: 100, y: 80 } }]);
    expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].size).toEqual({ width: 264, height: 440 });
  });

  it("applies all five size presets per Placement, each as a single undoable change", () => {
    useAppStore.getState().createCardAtCenter();
    const placementId = useAppStore.getState().projectFile.project.canvases[0].placements[0].id;

    for (const size of Object.values(CARD_SIZE_PRESETS)) {
      const before = useAppStore.getState().projectFile.project.canvases[0].placements[0].size;
      const historyLength = useAppStore.getState().past.length;
      useAppStore.getState().resizePlacement(placementId, size);
      const changed = before.width !== size.width || before.height !== size.height;
      expect(useAppStore.getState().past).toHaveLength(historyLength + Number(changed));
      expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].size).toEqual(size);
      if (!changed) continue;
      useAppStore.getState().undo();
      expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].size).toEqual(before);
      useAppStore.getState().redo();
      expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].size).toEqual(size);
    }
  });

  it("keeps a custom Placement size when changing the Canvas display mode and focusing it", () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const canvas = useAppStore.getState().projectFile.project.canvases[0];
    const [custom, defaultSize] = canvas.placements;
    useAppStore.getState().resizePlacement(custom.id, CARD_SIZE_PRESETS.Tall);
    useAppStore.getState().setDisplayMode("compact");
    let updated = useAppStore.getState().projectFile.project.canvases[0];
    expect(updated.placements[0].size).toEqual(CARD_SIZE_PRESETS.Tall);
    expect(updated.placements[1].size).toEqual(CARD_SIZE_PRESETS.Compact);

    useAppStore.getState().focusPlacement(canvas.id, custom.id);
    updated = useAppStore.getState().projectFile.project.canvases[0];
    expect(updated.viewport.x).toBeCloseTo(
      useAppStore.getState().canvasSize.width / 2 -
      (custom.position.x + CARD_SIZE_PRESETS.Tall.width / 2) * updated.viewport.zoom,
    );
    expect(defaultSize.size).toEqual(CARD_SIZE_PRESETS.Standard);
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
