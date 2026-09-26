import { beforeEach, describe, expect, it } from "vitest";
import { cardDestinations, unplacedCards } from "../src/domain/cardPlacements";
import { parseProjectFile, serializeProjectFile } from "../src/domain/projectFile";
import { searchCardPlacements } from "../src/features/search/searchCardPlacements";
import { useAppStore } from "../src/store/appStore";

describe("Canvas search and Card destinations", () => {
  beforeEach(() => useAppStore.getState().newProject("Search test"));

  it("finds each shared Card Placement by title or Tag, with its Canvas name", () => {
    useAppStore.getState().createCardAtCenter();
    const first = useAppStore.getState().projectFile.project.canvases[0];
    const card = useAppStore.getState().projectFile.project.cards[0];
    useAppStore.getState().updateCard(card.id, { title: "Shared", tags: ["plot"], body: "body-only-word" });
    useAppStore.getState().updateCard(card.id, { color: "sage" });
    useAppStore.getState().toggleMutedSelection();
    useAppStore.getState().addCanvas();
    useAppStore.getState().placeExistingCard(card.id);
    const second = useAppStore.getState().projectFile.project.canvases[1];
    const { cards, canvases } = useAppStore.getState().projectFile.project;

    expect(searchCardPlacements(cards, [first], "Shared").map((result) => result.placementId))
      .toEqual([first.placements[0].id]);
    expect(searchCardPlacements(cards, canvases, "#PLOT").map((result) =>
      [result.placementId, result.canvasTitle]))
      .toEqual([[first.placements[0].id, first.title], [second.placements[0].id, second.title]]);
    expect(searchCardPlacements(cards, canvases, "body-only-word")).toEqual([]);
    expect(searchCardPlacements(cards, canvases, "Shared")).toEqual([
      expect.objectContaining({ color: "sage", muted: true, placementId: first.placements[0].id }),
      expect.objectContaining({ color: "sage", muted: true, placementId: second.placements[0].id }),
    ]);
  });

  it("switches search scope without clearing the query or creating history, then jumps to a Placement", () => {
    useAppStore.getState().createCardAtCenter();
    const first = useAppStore.getState().projectFile.project.canvases[0];
    const placement = first.placements[0];
    useAppStore.getState().addCanvas();
    useAppStore.getState().openSearch("project");
    useAppStore.getState().setSearchQuery("title");
    const historyLength = useAppStore.getState().past.length;
    useAppStore.getState().setSearchScope("canvas");
    expect(useAppStore.getState().searchMode).toBe("canvas");
    expect(useAppStore.getState().searchQuery).toBe("title");
    expect(useAppStore.getState().past).toHaveLength(historyLength);

    useAppStore.getState().focusPlacement(first.id, placement.id);
    const state = useAppStore.getState();
    const viewport = state.projectFile.project.canvases[0].viewport;
    expect(state.projectFile.workspace.lastOpenedCanvasId).toBe(first.id);
    expect(state.selection).toEqual({ type: "placements", ids: [placement.id] });
    expect(state.searchMode).toBeNull();
    expect(viewport.x).toBeCloseTo(state.canvasSize.width / 2 -
      (placement.position.x + placement.size.width / 2) * viewport.zoom);
    expect(viewport.y).toBeCloseTo(state.canvasSize.height / 2 -
      (placement.position.y + placement.size.height / 2) * viewport.zoom);
    expect(state.past).toHaveLength(historyLength);
  });

  it("updates Unplaced and Used In after placement removal, Undo/Redo, Save/Open and restore", () => {
    useAppStore.getState().createUnplacedCard();
    const card = useAppStore.getState().projectFile.project.cards[0];
    let state = useAppStore.getState();
    expect(unplacedCards(state.projectFile.project.cards, state.projectFile.project.canvases).map((item) => item.id))
      .toEqual([card.id]);
    expect(cardDestinations(card.id, state.projectFile.project.canvases)).toEqual([]);

    state.placeExistingCard(card.id);
    const first = useAppStore.getState().projectFile.project.canvases[0];
    useAppStore.getState().placeExistingCard(card.id);
    expect(useAppStore.getState().projectFile.project.canvases[0].placements).toHaveLength(1);
    useAppStore.getState().addCanvas();
    useAppStore.getState().placeExistingCard(card.id);
    state = useAppStore.getState();
    expect(cardDestinations(card.id, state.projectFile.project.canvases).map((destination) => destination.canvasId))
      .toEqual(state.projectFile.project.canvases.map((canvas) => canvas.id));
    expect(unplacedCards(state.projectFile.project.cards, state.projectFile.project.canvases)).toEqual([]);

    const destination = cardDestinations(card.id, state.projectFile.project.canvases)[0];
    state.focusPlacement(destination.canvasId, destination.placementId);
    expect(useAppStore.getState().projectFile.workspace.lastOpenedCanvasId).toBe(first.id);
    expect(useAppStore.getState().selection).toEqual({ type: "placements", ids: [first.placements[0].id] });
    useAppStore.getState().switchCanvas(state.projectFile.project.canvases[1].id);

    useAppStore.getState().setSelection({ type: "placements", ids: [state.projectFile.project.canvases[1].placements[0].id] });
    useAppStore.getState().deleteSelection();
    state = useAppStore.getState();
    expect(cardDestinations(card.id, state.projectFile.project.canvases)).toHaveLength(1);
    state.undo();
    expect(cardDestinations(card.id, useAppStore.getState().projectFile.project.canvases)).toHaveLength(2);
    useAppStore.getState().redo();
    expect(cardDestinations(card.id, useAppStore.getState().projectFile.project.canvases)).toHaveLength(1);

    useAppStore.getState().switchCanvas(first.id);
    useAppStore.getState().setSelection({ type: "placements", ids: [first.placements[0].id] });
    useAppStore.getState().deleteSelection();
    state = useAppStore.getState();
    expect(unplacedCards(state.projectFile.project.cards, state.projectFile.project.canvases).map((item) => item.id))
      .toEqual([card.id]);
    const saved = serializeProjectFile(state.projectFile);
    state.loadProject(parseProjectFile(saved), "/tmp/search.storyflow");
    state = useAppStore.getState();
    expect(unplacedCards(state.projectFile.project.cards, state.projectFile.project.canvases)).toHaveLength(1);
    state.restoreProject(parseProjectFile(saved), "/tmp/search.storyflow");
    state = useAppStore.getState();
    expect(cardDestinations(card.id, state.projectFile.project.canvases)).toEqual([]);
    state.deleteCard(card.id);
    state = useAppStore.getState();
    expect(unplacedCards(state.projectFile.project.cards, state.projectFile.project.canvases)).toEqual([]);
  });
});
