import type { Edge, PlacementId } from "./models";

export function connectsPlacementPair(edge: Edge, first: PlacementId, second: PlacementId): boolean {
  return (edge.sourcePlacementId === first && edge.targetPlacementId === second) ||
    (edge.sourcePlacementId === second && edge.targetPlacementId === first);
}

// Preserve conflicting legacy labels/styles rather than discarding authored data.
export function normalizeLegacyEdges(edges: Edge[]): Edge[] {
  const groups = new Map<string, Edge[]>();
  const normalized: Edge[] = [];

  for (const edge of edges) {
    const key = JSON.stringify([edge.sourcePlacementId, edge.targetPlacementId].sort());
    const group = groups.get(key) ?? [];
    const compatible = group.find((item) => item.label === edge.label && item.lineStyle === edge.lineStyle);
    if (compatible) {
      if (compatible.direction === "directed" && (edge.direction === "undirected" ||
        (compatible.sourcePlacementId === edge.targetPlacementId && compatible.targetPlacementId === edge.sourcePlacementId))) {
        compatible.direction = "undirected";
      }
      continue;
    }

    const retained = { ...edge };
    group.push(retained);
    groups.set(key, group);
    normalized.push(retained);
  }

  return normalized;
}
