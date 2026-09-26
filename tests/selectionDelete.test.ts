import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Edge as FlowEdge } from "@xyflow/react";
import {
  deleteSelectionByKey,
  isMutedShortcut,
  shouldHandleSelectionDelete,
} from "../src/features/canvas/selectionCommands";
import {
  MULTI_SELECTION_KEY_CODES,
  selectionFromFlowElements,
} from "../src/features/canvas/flowSelection";
import type { ShepherdFlowNode } from "../src/features/canvas/flowAdapter";
import { useAppStore } from "../src/store/appStore";

const mocks = vi.hoisted(() => ({ confirm: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: mocks.confirm }));

function createTwoCardsAndEdge() {
  useAppStore.getState().createCardAtCenter();
  useAppStore.getState().createCardAtCenter();
  const canvas = useAppStore.getState().projectFile.project.canvases[0];
  useAppStore.getState().createEdge(canvas.placements[0].id, canvas.placements[1].id);
  return useAppStore.getState().projectFile.project.canvases[0];
}

function createSharedCard() {
  useAppStore.getState().createUnplacedCard();
  const card = useAppStore.getState().projectFile.project.cards[0];
  useAppStore.getState().updateCard(card.id, { title: "Shared hero" });
  const firstCanvas = useAppStore.getState().projectFile.project.canvases[0];
  useAppStore.getState().placeExistingCard(card.id, { x: 10, y: 20 });
  const firstPlacement = useAppStore.getState().projectFile.project.canvases[0].placements[0];
  useAppStore.getState().addCanvas();
  const secondCanvas = useAppStore.getState().projectFile.project.canvases[1];
  useAppStore.getState().placeExistingCard(card.id, { x: 30, y: 40 });
  const secondPlacement = useAppStore.getState().projectFile.project.canvases[1].placements[0];
  return { cardId: card.id, firstCanvas, firstPlacement, secondCanvas, secondPlacement };
}

describe("Selection and delete commands", () => {
  beforeEach(() => {
    mocks.confirm.mockReset().mockResolvedValue(true);
    useAppStore.getState().newProject("Selection test");
  });

  it("only recognizes an unmodified, non-repeating 0 key for Muted", () => {
    const event = { key: "0", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false };
    expect(isMutedShortcut(event)).toBe(true);
    expect(isMutedShortcut({ ...event, ctrlKey: true })).toBe(false);
    expect(isMutedShortcut({ ...event, shiftKey: true })).toBe(false);
    expect(isMutedShortcut({ ...event, repeat: true })).toBe(false);
    expect(isMutedShortcut({ ...event, isComposing: true })).toBe(false);
    expect(isMutedShortcut({ ...event, key: "1" })).toBe(false);
  });

  it("selects a React Flow Edge and deletes its Domain Edge with Delete", async () => {
    const canvas = createTwoCardsAndEdge();
    const edge = canvas.edges[0];
    const selection = selectionFromFlowElements([], [{ id: edge.id } as FlowEdge]);
    useAppStore.getState().setSelection(selection);

    await deleteSelectionByKey("Delete");

    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toEqual([]);
    expect(useAppStore.getState().selection).toBeNull();
  });

  it("restores and re-deletes an Edge with Undo and Redo", async () => {
    const edge = createTwoCardsAndEdge().edges[0];
    useAppStore.getState().setSelection({ type: "edge", id: edge.id });
    await deleteSelectionByKey("Delete");

    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.canvases[0].edges[0].id).toBe(edge.id);
    expect(useAppStore.getState().selection).toBeNull();

    useAppStore.getState().redo();
    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toEqual([]);
    expect(useAppStore.getState().selection).toBeNull();
  });

  it("deletes a selected Domain Edge with Backspace", async () => {
    const edge = createTwoCardsAndEdge().edges[0];
    useAppStore.getState().setSelection({ type: "edge", id: edge.id });

    await deleteSelectionByKey("Backspace");

    expect(useAppStore.getState().projectFile.project.canvases[0].edges).toEqual([]);
    expect(useAppStore.getState().selection).toBeNull();
  });

  it("removes only the selected Placement with Backspace and keeps the Card", async () => {
    useAppStore.getState().createCardAtCenter();
    const state = useAppStore.getState();
    const card = state.projectFile.project.cards[0];
    const placement = state.projectFile.project.canvases[0].placements[0];
    state.setSelection({ type: "placements", ids: [placement.id] });

    await deleteSelectionByKey("Backspace");

    expect(useAppStore.getState().projectFile.project.cards.map((item) => item.id)).toContain(card.id);
    expect(useAppStore.getState().projectFile.project.canvases[0].placements).toEqual([]);
  });

  it("removes a shared Card Placement only from the active Canvas with Backspace", async () => {
    const shared = createSharedCard();
    useAppStore.getState().switchCanvas(shared.firstCanvas.id);
    useAppStore.getState().setSelection({ type: "placements", ids: [shared.firstPlacement.id] });

    await deleteSelectionByKey("Backspace");

    const project = useAppStore.getState().projectFile.project;
    expect(project.cards.some((card) => card.id === shared.cardId)).toBe(true);
    expect(project.canvases[0].placements).toEqual([]);
    expect(project.canvases[1].placements[0].id).toBe(shared.secondPlacement.id);
  });

  it("deletes a Card, all of its Placements, and dependent Edges as one undoable operation", async () => {
    const firstCanvas = createTwoCardsAndEdge();
    const removedPlacement = firstCanvas.placements[0];
    const removedCardId = removedPlacement.cardId;
    const edgeId = firstCanvas.edges[0].id;
    useAppStore.getState().addCanvas();
    useAppStore.getState().placeExistingCard(removedCardId, { x: 80, y: 90 });
    useAppStore.getState().switchCanvas(firstCanvas.id);
    useAppStore.getState().setSelection({ type: "placements", ids: [removedPlacement.id] });

    await deleteSelectionByKey("Delete");

    let project = useAppStore.getState().projectFile.project;
    expect(project.cards.some((card) => card.id === removedCardId)).toBe(false);
    expect(project.canvases.every((canvas) => canvas.placements.every((item) => item.cardId !== removedCardId))).toBe(true);
    expect(project.canvases.every((canvas) => canvas.edges.every((edge) => edge.id !== edgeId))).toBe(true);
    expect(useAppStore.getState().selection).toBeNull();

    useAppStore.getState().undo();
    project = useAppStore.getState().projectFile.project;
    expect(project.cards.some((card) => card.id === removedCardId)).toBe(true);
    expect(project.canvases.filter((canvas) => canvas.placements.some((item) => item.cardId === removedCardId))).toHaveLength(2);
    expect(project.canvases[0].edges.some((edge) => edge.id === edgeId)).toBe(true);
    expect(useAppStore.getState().selection).toBeNull();

    useAppStore.getState().redo();
    project = useAppStore.getState().projectFile.project;
    expect(project.cards.some((card) => card.id === removedCardId)).toBe(false);
    expect(project.canvases.every((canvas) => canvas.placements.every((item) => item.cardId !== removedCardId))).toBe(true);
    expect(project.canvases[0].edges).toEqual([]);
  });

  it("asks for confirmation with Card name and Canvas count before deleting a shared Card", async () => {
    const shared = createSharedCard();
    useAppStore.getState().setSelection({ type: "placements", ids: [shared.secondPlacement.id] });
    mocks.confirm.mockResolvedValue(false);

    await deleteSelectionByKey("Delete");

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.stringMatching(/Shared hero[\s\S]*2 Canvas/),
      expect.objectContaining({ kind: "warning" }),
    );
    expect(useAppStore.getState().projectFile.project.cards.some((card) => card.id === shared.cardId)).toBe(true);
  });

  it("does not delete selected content when Backspace or Delete targets an editable field", async () => {
    useAppStore.getState().createCardAtCenter();
    const placement = useAppStore.getState().projectFile.project.canvases[0].placements[0];
    useAppStore.getState().setSelection({ type: "placements", ids: [placement.id] });
    const input = { tagName: "INPUT", isContentEditable: false } as unknown as EventTarget;
    const textarea = { tagName: "TEXTAREA", isContentEditable: false } as unknown as EventTarget;
    const contentEditableChild = {
      tagName: "SPAN",
      isContentEditable: false,
      closest: () => ({ tagName: "DIV" }),
    } as unknown as EventTarget;

    expect(shouldHandleSelectionDelete("Backspace", input)).toBe(false);
    expect(shouldHandleSelectionDelete("Delete", textarea)).toBe(false);
    expect(shouldHandleSelectionDelete("Delete", contentEditableChild)).toBe(false);
    expect(shouldHandleSelectionDelete("Delete", null)).toBe(true);
    if (shouldHandleSelectionDelete("Backspace", input)) await deleteSelectionByKey("Backspace");
    if (shouldHandleSelectionDelete("Delete", textarea)) await deleteSelectionByKey("Delete");
    expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].id).toBe(placement.id);
    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(1);
  });

  it("maps Control/Meta multi-selection to one Domain Placement selection", () => {
    const selectedNodes = [
      { id: "placement-a", type: "card" },
      { id: "placement-b", type: "card" },
    ] as ShepherdFlowNode[];

    expect(MULTI_SELECTION_KEY_CODES).toEqual(["Control", "Meta"]);
    expect(selectionFromFlowElements(selectedNodes, [])).toEqual({
      type: "placements",
      ids: ["placement-a", "placement-b"],
    });
    expect(selectionFromFlowElements(selectedNodes.slice(1), [])).toEqual({
      type: "placements",
      ids: ["placement-b"],
    });
  });

  it("maps an empty React Flow selection from a pane click to null", () => {
    expect(selectionFromFlowElements([], [])).toBeNull();
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().setSelection(null);
    expect(useAppStore.getState().selection).toBeNull();
  });

  it("keeps selection and Edge endpoints valid after deletion and Canvas switching", async () => {
    const firstCanvas = createTwoCardsAndEdge();
    const removedPlacement = firstCanvas.placements[0];
    useAppStore.getState().addCanvas();
    const secondCanvas = useAppStore.getState().projectFile.project.canvases[1];
    useAppStore.getState().switchCanvas(firstCanvas.id);
    useAppStore.getState().setSelection({ type: "placements", ids: [removedPlacement.id] });

    await deleteSelectionByKey("Backspace");
    useAppStore.getState().switchCanvas(secondCanvas.id);

    const state = useAppStore.getState();
    expect(state.selection).toBeNull();
    for (const canvas of state.projectFile.project.canvases) {
      const placementIds = new Set(canvas.placements.map((placement) => placement.id));
      expect(canvas.edges.every((edge) => (
        placementIds.has(edge.sourcePlacementId) && placementIds.has(edge.targetPlacementId)
      ))).toBe(true);
    }
  });

  it("restores Placement and dependent Edge together with Undo", async () => {
    const canvas = createTwoCardsAndEdge();
    const placement = canvas.placements[0];
    const edge = canvas.edges[0];
    useAppStore.getState().setSelection({ type: "placements", ids: [placement.id] });

    await deleteSelectionByKey("Backspace");
    useAppStore.getState().undo();

    const restored = useAppStore.getState().projectFile.project.canvases[0];
    expect(restored.placements.some((item) => item.id === placement.id)).toBe(true);
    expect(restored.edges.some((item) => item.id === edge.id)).toBe(true);
    expect(useAppStore.getState().selection).toBeNull();
  });
});
