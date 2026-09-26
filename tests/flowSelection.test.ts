import { beforeEach, describe, expect, it } from "vitest";
import type { EdgeChange, NodeChange } from "@xyflow/react";
import {
  selectionAfterEdgeChanges,
  selectionAfterNodeChanges,
  selectionFromFlowElements,
} from "../src/features/canvas/flowSelection";
import { toFlowEdges, toFlowNodes, type ShepherdFlowNode } from "../src/features/canvas/flowAdapter";
import { useAppStore, type Selection } from "../src/store/appStore";

function flowNodes(selection: Selection = useAppStore.getState().selection) {
  const state = useAppStore.getState();
  const canvas = state.projectFile.project.canvases.find(
    (item) => item.id === state.projectFile.workspace.lastOpenedCanvasId,
  )!;
  return toFlowNodes(
    canvas,
    state.projectFile.project.cards,
    selection?.type === "placements" ? selection.ids : [],
    selection?.type === "area" ? selection.id : null,
    "",
    [],
    "any",
    "dim",
  );
}

function nodeSelect(id: string, selected: boolean): NodeChange<ShepherdFlowNode> {
  return { type: "select", id, selected };
}

describe("Controlled React Flow selection", () => {
  beforeEach(() => {
    useAppStore.getState().newProject("Flow selection test");
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
  });

  it("selects only Node A from its controlled select change and projects selected=true", () => {
    const nodes = flowNodes(null);
    const selection = selectionAfterNodeChanges(null, nodes, [nodeSelect(nodes[0].id, true)]);
    const projected = flowNodes(selection);

    expect(selection).toEqual({ type: "placements", ids: [nodes[0].id] });
    expect(projected.find((node) => node.id === nodes[0].id)?.selected).toBe(true);
    expect(projected.find((node) => node.id === nodes[1].id)?.selected).toBe(false);
  });

  it("adds Node B to Node A for the Control/Meta select change", () => {
    const nodes = flowNodes(null);
    const first = selectionAfterNodeChanges(null, nodes, [nodeSelect(nodes[0].id, true)]);
    const second = selectionAfterNodeChanges(first, nodes, [nodeSelect(nodes[1].id, true)]);
    const projected = flowNodes(second);

    expect(second).toEqual({ type: "placements", ids: [nodes[0].id, nodes[1].id] });
    expect(projected.filter((node) => node.selected).map((node) => node.id)).toEqual([
      nodes[0].id,
      nodes[1].id,
    ]);
  });

  it("keeps every Card in a marquee even when React Flow also selects their connecting Edge", () => {
    const state = useAppStore.getState();
    const canvas = state.projectFile.project.canvases[0];
    state.createEdge(canvas.placements[0].id, canvas.placements[1].id);
    const nodes = flowNodes(null);
    const edge = toFlowEdges(useAppStore.getState().projectFile.project.canvases[0], null)[0];
    const changes: EdgeChange[] = [{ type: "select", id: edge.id, selected: true }];

    let selection = selectionAfterNodeChanges(null, nodes, [nodeSelect(nodes[0].id, true)]);
    selection = selectionAfterEdgeChanges(selection, changes);
    expect(selection).toEqual({ type: "placements", ids: [nodes[0].id] });

    selection = selectionAfterNodeChanges(selection, nodes, [nodeSelect(nodes[1].id, true)]);
    selection = selectionAfterEdgeChanges(selection, changes);
    expect(selection).toEqual({ type: "placements", ids: [nodes[0].id, nodes[1].id] });
    expect(selectionFromFlowElements(nodes, [edge])).toEqual(selection);

    selection = selectionAfterNodeChanges(selection, nodes, [nodeSelect(nodes[1].id, false)]);
    selection = selectionAfterEdgeChanges(selection, changes);
    expect(selection).toEqual({ type: "placements", ids: [nodes[0].id] });
  });

  it("prioritizes Card selections over an overlapping Area regardless of change order", () => {
    const nodes = flowNodes(null);
    useAppStore.getState().setSelection({ type: "placements", ids: nodes.map((node) => node.id) });
    useAppStore.getState().createArea();
    const [area, first, second] = flowNodes(null);
    expect(area.type).toBe("area");

    for (const changes of [
      [nodeSelect(area.id, true), nodeSelect(first.id, true), nodeSelect(second.id, true)],
      [nodeSelect(first.id, true), nodeSelect(second.id, true), nodeSelect(area.id, true)],
    ]) {
      expect(selectionAfterNodeChanges(null, [area, first, second], changes))
        .toEqual({ type: "placements", ids: [first.id, second.id] });
    }

    const selectedCards: Selection = { type: "placements", ids: [first.id, second.id] };
    expect(selectionAfterNodeChanges(selectedCards, [area, first, second], [nodeSelect(area.id, true)]))
      .toEqual(selectedCards);
    expect(selectionAfterNodeChanges(selectedCards, [area, first, second], [
      nodeSelect(area.id, true), nodeSelect(first.id, false), nodeSelect(second.id, false),
    ])).toEqual({ type: "area", id: area.id });
  });

  it("removes a selected Node from a Control/Meta multi-selection", () => {
    const nodes = flowNodes(null);
    const selection: Selection = { type: "placements", ids: [nodes[0].id, nodes[1].id] };
    const next = selectionAfterNodeChanges(selection, nodes, [nodeSelect(nodes[0].id, false)]);
    const projected = flowNodes(next);

    expect(next).toEqual({ type: "placements", ids: [nodes[1].id] });
    expect(projected.find((node) => node.id === nodes[0].id)?.selected).toBe(false);
    expect(projected.find((node) => node.id === nodes[1].id)?.selected).toBe(true);
  });

  it("clears all selection for an empty pane selection", () => {
    expect(selectionFromFlowElements([], [])).toBeNull();
  });

  it("selects an Edge from its controlled select change and projects selected=true", () => {
    const state = useAppStore.getState();
    const canvas = state.projectFile.project.canvases[0];
    state.createEdge(canvas.placements[0].id, canvas.placements[1].id);
    const current = useAppStore.getState().projectFile.project.canvases[0];
    const edge = current.edges[0];
    const selection = selectionAfterEdgeChanges(null, [
      { type: "select", id: edge.id, selected: true } as EdgeChange,
    ]);
    const projected = toFlowEdges(current, selection?.type === "edge" ? selection.id : null);

    expect(selection).toEqual({ type: "edge", id: edge.id });
    expect(projected[0].selectable).toBe(true);
    expect(projected[0].selected).toBe(true);
  });

  it("selects an Edge after clicking it while Cards were selected", () => {
    const state = useAppStore.getState();
    const canvas = state.projectFile.project.canvases[0];
    state.createEdge(canvas.placements[0].id, canvas.placements[1].id);
    const nodes = flowNodes(null);
    const edgeId = useAppStore.getState().projectFile.project.canvases[0].edges[0].id;
    const selected: Selection = { type: "placements", ids: nodes.map((node) => node.id) };
    const afterNodes = selectionAfterNodeChanges(selected, nodes, nodes.map((node) => nodeSelect(node.id, false)));
    expect(selectionAfterEdgeChanges(afterNodes, [{ type: "select", id: edgeId, selected: true }]))
      .toEqual({ type: "edge", id: edgeId });
  });

  it("keeps selection stable for position changes and still allows Domain dragging", () => {
    const nodes = flowNodes(null);
    const selection: Selection = { type: "placements", ids: [nodes[0].id] };
    const next = selectionAfterNodeChanges(selection, nodes, [
      { type: "position", id: nodes[0].id, position: { x: 200, y: 240 }, dragging: true },
    ]);
    useAppStore.getState().movePlacements([{ id: nodes[0].id, position: { x: 200, y: 240 } }]);

    expect(next).toBe(selection);
    expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].position).toEqual({ x: 200, y: 240 });
  });

  it("projects focusPlacement selection without publishing a repeated Domain update", () => {
    const state = useAppStore.getState();
    const canvas = state.projectFile.project.canvases[0];
    const placement = canvas.placements[0];
    let notifications = 0;
    const unsubscribe = useAppStore.subscribe(() => { notifications += 1; });

    state.focusPlacement(canvas.id, placement.id);
    const projected = flowNodes();
    useAppStore.getState().setSelection(selectionFromFlowElements(
      projected.filter((node) => node.selected),
      [],
    ));
    unsubscribe();

    expect(projected.find((node) => node.id === placement.id)?.selected).toBe(true);
    expect(useAppStore.getState().selection).toEqual({ type: "placements", ids: [placement.id] });
    expect(notifications).toBe(1);
  });
});
