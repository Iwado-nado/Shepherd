import type { Edge as FlowEdge, EdgeChange, NodeChange } from "@xyflow/react";
import type { Selection } from "../../store/appStore";
import type { ShepherdFlowNode } from "./flowAdapter";

export const MULTI_SELECTION_KEY_CODES = ["Control", "Meta"];

export function selectionFromFlowElements(
  nodes: ShepherdFlowNode[],
  edges: FlowEdge[],
): Selection {
  const placementIds = nodes.filter((node) => node.type === "card").map((node) => node.id);
  if (placementIds.length) return { type: "placements", ids: placementIds };
  const area = nodes.find((node) => node.type === "area");
  if (area) return { type: "area", id: area.id };
  if (edges[0]) return { type: "edge", id: edges[0].id };
  return null;
}

export function selectionAfterNodeChanges(
  selection: Selection,
  nodes: ShepherdFlowNode[],
  changes: NodeChange<ShepherdFlowNode>[],
): Selection {
  const selectionChanges = changes.filter((change) => change.type === "select");
  if (selectionChanges.length === 0) return selection;

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const placementIds = new Set(selection?.type === "placements" ? selection.ids : []);
  let areaId = selection?.type === "area" ? selection.id : null;
  let nextAreaId: string | null = null;
  let selectedNode = false;

  for (const change of selectionChanges) {
    const node = nodesById.get(change.id);
    if (!node) continue;
    if (node.type === "card") {
      if (change.selected) {
        placementIds.add(change.id);
        areaId = null;
        selectedNode = true;
      } else {
        placementIds.delete(change.id);
      }
    } else if (change.selected) {
      nextAreaId = change.id;
      selectedNode = true;
    } else if (areaId === change.id) {
      areaId = null;
    }
  }

  if (placementIds.size > 0) return { type: "placements", ids: [...placementIds] };
  if (nextAreaId) return { type: "area", id: nextAreaId };
  if (areaId) return { type: "area", id: areaId };
  if (!selectedNode && (selection?.type === "edge" || selection?.type === "card")) return selection;
  return null;
}

export function selectionAfterEdgeChanges(
  selection: Selection,
  changes: EdgeChange<FlowEdge>[],
): Selection {
  const selectionChanges = changes.filter((change) => change.type === "select");
  if (selectionChanges.length === 0) return selection;
  if (selection?.type === "placements" || selection?.type === "area") return selection;

  let edgeId = selection?.type === "edge" ? selection.id : null;
  for (const change of selectionChanges) {
    if (change.selected) edgeId = change.id;
    else if (edgeId === change.id) edgeId = null;
  }
  if (edgeId) return { type: "edge", id: edgeId };
  return selection?.type === "edge" ? null : selection;
}
