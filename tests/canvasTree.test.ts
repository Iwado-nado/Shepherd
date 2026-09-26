import { beforeEach, describe, expect, it } from "vitest";
import { canvasTree } from "../src/features/project/canvasTree";
import { cardMatchesFilters, searchCardPlacements } from "../src/features/search/searchCardPlacements";
import { toFlowNodes } from "../src/features/canvas/flowAdapter";
import { useAppStore } from "../src/store/appStore";

describe("Canvas tree and combined search", () => {
  beforeEach(() => useAppStore.getState().newProject("Tree test"));

  it("nests Area members below their Area and restores hierarchy after Undo", () => {
    for (let index = 0; index < 3; index += 1) useAppStore.getState().createCardAtCenter();
    const canvas = useAppStore.getState().projectFile.project.canvases[0];
    const [first, second, third] = canvas.placements;
    useAppStore.getState().setSelection({ type: "placements", ids: [first.id, second.id] });
    useAppStore.getState().createArea();
    let project = useAppStore.getState().projectFile.project;
    let tree = canvasTree(project.canvases[0], project.cards);

    expect(tree.ungrouped.map(({ placement }) => placement.id)).toEqual([third.id]);
    expect(tree.areas).toHaveLength(1);
    expect(tree.areas[0].cards.map(({ placement }) => placement.id)).toEqual([first.id, second.id]);
    const areaId = tree.areas[0].area.id;

    useAppStore.getState().deleteSelection();
    project = useAppStore.getState().projectFile.project;
    tree = canvasTree(project.canvases[0], project.cards);
    expect(tree.areas).toEqual([]);
    expect(tree.ungrouped).toHaveLength(3);
    useAppStore.getState().undo();
    tree = canvasTree(useAppStore.getState().projectFile.project.canvases[0], useAppStore.getState().projectFile.project.cards);
    expect(tree.areas[0].area.id).toBe(areaId);
    expect(tree.areas[0].cards).toHaveLength(2);
  });

  it("lists only matching Cards in Tree/results while dimming nonmatches on the Canvas", () => {
    for (let index = 0; index < 3; index += 1) useAppStore.getState().createCardAtCenter();
    const project = useAppStore.getState().projectFile.project;
    const [first, second, third] = project.cards;
    useAppStore.getState().updateCard(first.id, { title: "Hero opening", tags: ["plot"] });
    useAppStore.getState().updateCard(second.id, { title: "Hero side story", tags: ["draft"] });
    useAppStore.getState().updateCard(third.id, { title: "Villain", tags: ["plot"] });
    useAppStore.getState().setSidebarSearchQuery("hero");
    useAppStore.getState().toggleFilterTag("plot");
    const state = useAppStore.getState();
    const current = state.projectFile.project.canvases[0];
    const cards = state.projectFile.project.cards;

    expect(searchCardPlacements(cards, [current], state.sidebarSearchQuery, state.filterTags, state.tagFilterMode)
      .map((result) => result.cardId)).toEqual([first.id]);
    expect(canvasTree(current, cards, (card) => cardMatchesFilters(card, state.sidebarSearchQuery, state.filterTags, state.tagFilterMode))
      .ungrouped.map(({ card }) => card.id)).toEqual([first.id]);
    const nodes = toFlowNodes(current, cards, [], null, "hero", ["plot"], "any", "dim");
    expect(nodes.map((node) => node.id)).toEqual(current.placements.map((placement) => placement.id));
    expect(nodes.map((node) => node.className)).toEqual([undefined, "is-dimmed", "is-dimmed"]);
    expect(useAppStore.getState().past).toHaveLength(6); // Only Card creation and edits enter Domain history.

    state.toggleSidebarSearchScope();
    expect(useAppStore.getState().sidebarSearchScope).toBe("canvas");
    expect(useAppStore.getState().sidebarSearchQuery).toBe("hero");
  });
});
