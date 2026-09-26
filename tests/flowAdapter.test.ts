import { describe, expect, it } from "vitest";
import type { CanvasData, Card } from "../src/domain/models";
import { toFlowEdges, toFlowNodes } from "../src/features/canvas/flowAdapter";

const cards: Card[] = [
  { id: "shared-card", title: "Shared", body: "", tags: [], color: "default", muted: false, createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" },
  { id: "other-card", title: "Other", body: "", tags: [], color: "default", muted: false, createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" },
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
      lineStyle: "solid",
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

  it("projects START and Bookmark flags only onto their target Placement", () => {
    const first = canvas("canvas-a", "placement-a");
    const second = canvas("canvas-b", "placement-b");
    const status = { startPlacementId: "placement-a", bookmarkedPlacementIds: new Set(["placement-a"]) };
    const firstNodes = toFlowNodes(first, cards, [], null, "", [], "any", "dim", undefined, status);
    const secondNodes = toFlowNodes(second, cards, [], null, "", [], "any", "dim", undefined, status);

    expect(firstNodes[0].data).toMatchObject({ cardId: "shared-card", isStart: true, isBookmarked: true });
    expect(firstNodes[1].data).toMatchObject({ isStart: false, isBookmarked: false });
    expect(secondNodes[0].data).toMatchObject({ cardId: "shared-card", isStart: false, isBookmarked: false });
  });

  it("uses Placement IDs for React Flow Edge endpoints", () => {
    const target = canvas("canvas-a", "placement-a");
    const [edge] = toFlowEdges(target, null);

    expect(edge.source).toBe("placement-a");
    expect(edge.target).toBe("canvas-a-other");
  });

  it("distinguishes directed and bidirectional Edges without hiding the existing label or route", () => {
    const target = canvas("canvas", "placement");
    const directed = toFlowEdges(target, null)[0];
    expect(directed).toMatchObject({
      type: "smoothstep", label: "→  next", markerEnd: { type: expect.any(String) },
      style: { strokeDasharray: undefined },
    });
    expect(directed.markerStart).toBeUndefined();

    target.edges[0].direction = "undirected";
    target.edges[0].lineStyle = "dashed";
    const bidirectional = toFlowEdges(target, null)[0];
    expect(bidirectional).toMatchObject({
      type: "smoothstep", label: "↔  next", markerStart: { type: expect.any(String) },
      markerEnd: { type: expect.any(String) }, style: { strokeDasharray: "8 6" },
    });

    target.edges[0].lineStyle = "dotted";
    expect(toFlowEdges(target, null)[0].style).toMatchObject({ strokeDasharray: "1 6", strokeLinecap: "round" });
    target.edges[0].direction = "directed";
    expect(toFlowEdges(target, null)[0]).toMatchObject({ label: "→  next", style: { strokeDasharray: "1 6" } });
    expect(toFlowEdges(target, target.edges[0].id)[0].markerEnd).toMatchObject({ color: "var(--accent)" });

    target.edges[0].sourcePlacementId = target.placements[1].id;
    target.edges[0].targetPlacementId = target.placements[0].id;
    expect(toFlowEdges(target, null)[0]).toMatchObject({
      label: "←  next", markerStart: undefined, style: { strokeDasharray: "1 6" },
    });
    target.edges[0].direction = "undirected";
    expect(toFlowEdges(target, null)[0].label).toBe("↔  next");
  });

  it("projects independent Card sizes and refreshed Edge handles after resize", () => {
    const first = canvas("canvas-a", "placement-a");
    const second = canvas("canvas-b", "placement-b");
    first.placements[0].size = { width: 264, height: 840 };
    second.placements[0].size = { width: 440, height: 156 };

    expect(toFlowNodes(first, cards, [], null, "", [], "any", "dim")[0]).toMatchObject({
      id: "placement-a", width: 264, height: 840,
    });
    expect(toFlowNodes(second, cards, [], null, "", [], "any", "dim")[0]).toMatchObject({
      id: "placement-b", width: 440, height: 156,
    });
    expect(toFlowEdges(first, null)[0]).toMatchObject({ sourceHandle: "top", targetHandle: "bottom" });
    expect(toFlowEdges(second, null)[0]).toMatchObject({ sourceHandle: "right", targetHandle: "left" });

    const preview = { placementId: "placement-a", size: { width: 520, height: 156 } };
    expect(toFlowNodes(first, cards, [], null, "", [], "any", "dim", preview)[0]).toMatchObject({
      width: 520, height: 156,
    });
    expect(toFlowEdges(first, null, undefined, preview)[0]).toMatchObject({ sourceHandle: "right", targetHandle: "left" });
    expect(first.placements[0].size).toEqual({ width: 264, height: 840 });
  });

  it("matches Canvas Card search by title and tags but not story body", () => {
    const target = canvas("canvas", "placement");
    const searchable = [{ ...cards[0], body: "body-only", tags: ["hint"] }, cards[1]];

    expect(toFlowNodes(target, searchable, [], null, "body-only", [], "any", "hide")).toEqual([]);
    expect(toFlowNodes(target, searchable, [], null, "#hint", [], "any", "hide").map((node) => node.id))
      .toEqual(["placement"]);
  });

  it("projects shared Card color and Muted state to Nodes and connected Edges", () => {
    const target = canvas("canvas", "placement");
    const shared = { ...cards[0], color: "sage", muted: true };
    const nodes = toFlowNodes(target, [shared, cards[1]], [], null, "", [], "any", "dim");
    expect(nodes[0]).toMatchObject({
      className: "is-muted",
      data: { color: "sage", muted: true },
    });
    expect(nodes[1].className).toBeUndefined();
    expect(toFlowEdges(target, null, undefined, undefined, new Set([shared.id]))[0].className).toBe("is-muted");
    expect(toFlowEdges(target, null)[0].className).toBeUndefined();
  });

  it("dims unmatched Cards, Areas and their connecting Edge without removing them", () => {
    const target = canvas("canvas", "placement");
    target.areas.push({
      id: "matched-area", canvasId: target.id, title: "Act", color: "default", tags: [],
      anchorX: 0, anchorY: 0, collapsed: false,
    }, {
      id: "unmatched-area", canvasId: target.id, title: "Unused", color: "default", tags: [],
      anchorX: 700, anchorY: 300, collapsed: false,
    });
    target.placements[0].areaId = "matched-area";
    const searchable = [{ ...cards[0], title: "Hero", tags: ["plot"] }, { ...cards[1], title: "Side story", tags: ["draft"] }];
    const nodes = toFlowNodes(target, searchable, [], null, "Hero", ["plot"], "any", "dim");
    expect(nodes).toHaveLength(4);
    expect(nodes.map((node) => [node.id, node.className])).toEqual([
      ["matched-area", undefined],
      ["unmatched-area", "is-dimmed"],
      ["placement", undefined],
      ["canvas-other", "is-dimmed"],
    ]);
    const edges = toFlowEdges(target, null, undefined, undefined, undefined, new Set(["canvas-other"]));
    expect(edges).toHaveLength(1);
    expect(edges[0].className).toBe("is-dimmed");
  });
});
