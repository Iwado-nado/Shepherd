import { describe, expect, it } from "vitest";
import type { CanvasData, Card } from "../src/domain/models";
import { toFlowEdges, toFlowNodes } from "../src/features/canvas/flowAdapter";

const cards: Card[] = [
  { id: "shared-card", title: "Shared", body: "", tags: [], createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" },
  { id: "other-card", title: "Other", body: "", tags: [], createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" },
];

function canvas(id: string, sharedPlacementId: string): CanvasData {
  return {
    id,
    title: id,
    displayMode: "standard",
    viewport: { x: 0, y: 0, zoom: 1 },
    areas: [],
    placements: [
      { id: sharedPlacementId, cardId: "shared-card", canvasId: id, position: { x: 0, y: 0 }, size: { width: 264, height: 156 } },
      { id: `${id}-other`, cardId: "other-card", canvasId: id, position: { x: 320, y: 0 }, size: { width: 264, height: 156 } },
    ],
    edges: [{
      id: `${id}-edge`,
      canvasId: id,
      sourcePlacementId: sharedPlacementId,
      targetPlacementId: `${id}-other`,
      label: "next",
      direction: "directed",
    }],
  };
}

describe("React Flow adapter identity", () => {
  it("uses Canvas-specific Placement IDs for a Card shared across Canvases", () => {
    const first = canvas("canvas-a", "placement-a");
    const second = canvas("canvas-b", "placement-b");

    const firstNodes = toFlowNodes(first, cards, [], null, "", [], "any", "dim");
    const secondNodes = toFlowNodes(second, cards, [], null, "", [], "any", "dim");

    expect(firstNodes.map((node) => node.id)).toContain("placement-a");
    expect(secondNodes.map((node) => node.id)).toContain("placement-b");
    expect(firstNodes.map((node) => node.id)).not.toContain("shared-card");
    expect(secondNodes.map((node) => node.id)).not.toContain("shared-card");
  });

  it("uses Placement IDs for React Flow Edge endpoints", () => {
    const target = canvas("canvas-a", "placement-a");
    const [edge] = toFlowEdges(target, null);

    expect(edge.source).toBe("placement-a");
    expect(edge.target).toBe("canvas-a-other");
  });
});
