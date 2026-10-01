import { describe, expect, it } from "vitest";
import type { CanvasData, Card } from "../src/domain/models";
import { projectFlowEdges } from "../src/features/canvas/edgeProjection";

const cards: Card[] = ["a", "b", "c"].map((id) => ({
  id, title: id, body: "", tags: [], color: "default", muted: false,
  createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z",
}));

function canvas(): CanvasData {
  return {
    id: "canvas", title: "Canvas", displayMode: "standard", viewport: { x: 0, y: 0, zoom: 1 },
    areas: [],
    placements: [
      { id: "a", cardId: "a", canvasId: "canvas", position: { x: 0, y: 0 }, size: { width: 100, height: 100 } },
      { id: "b", cardId: "b", canvasId: "canvas", position: { x: 300, y: 0 }, size: { width: 100, height: 100 } },
      { id: "c", cardId: "c", canvasId: "canvas", position: { x: 0, y: 400 }, size: { width: 100, height: 100 } },
    ],
    edges: [{ id: "edge", canvasId: "canvas", sourcePlacementId: "a", targetPlacementId: "b", label: "next", direction: "directed", lineStyle: "solid" }],
  };
}

function derive(target: CanvasData, previous?: ReturnType<typeof projectFlowEdges>, overrides: {
  cards?: Card[]; query?: string; filter?: "dim" | "hide"; preview?: { placementId: string; size: { width: number; height: number } };
} = {}) {
  return projectFlowEdges(target, overrides.cards ?? cards, null, overrides.query ?? "", [], "any",
    overrides.filter ?? "dim", overrides.preview, previous);
}

describe("edge projection dependencies", () => {
  it("reuses the Edge array for unrelated Placement and Area changes", () => {
    const target = canvas();
    const initial = derive(target);
    const moved = { ...target, placements: target.placements.map((item) => item.id === "c"
      ? { ...item, position: { x: 900, y: 600 }, size: { width: 200, height: 200 } } : item) };
    const afterMove = derive(moved, initial);
    expect(afterMove).toBe(initial);
    expect(afterMove.edges).toBe(initial.edges);
    expect(derive({ ...moved, areas: [{ id: "empty", canvasId: "canvas", title: "", color: "default", tags: [], anchorX: 0, anchorY: 0, collapsed: false }] }, afterMove)).toBe(initial);
    expect(derive(moved, afterMove, { preview: { placementId: "c", size: { width: 500, height: 500 } } })).toBe(initial);
  });

  it("refreshes connected Edge direction, handles and preview geometry", () => {
    const target = canvas();
    const initial = derive(target);
    const moved = { ...target, placements: target.placements.map((item) => item.id === "b"
      ? { ...item, position: { x: -300, y: 0 } } : item) };
    const afterMove = derive(moved, initial);
    expect(afterMove.edges).not.toBe(initial.edges);
    expect(afterMove.edges[0]).toMatchObject({ label: "←  next", sourceHandle: "left", targetHandle: "right" });
    const preview = derive(target, initial, { preview: { placementId: "a", size: { width: 100, height: 800 } } });
    expect(preview.edges).not.toBe(initial.edges);
    expect(preview.edges[0]).toMatchObject({ sourceHandle: "top", targetHandle: "bottom" });
  });

  it("updates filtering, muted styling and collapsed Area visibility", () => {
    const target = canvas();
    const initial = derive(target);
    const muted = derive(target, initial, { cards: [{ ...cards[0], muted: true }, ...cards.slice(1)] });
    expect(muted.edges[0].className).toBe("is-muted");
    const hidden = derive(target, muted, { filter: "hide", query: "a" });
    expect(hidden.edges).toEqual([]);
    const collapsed = {
      ...target,
      areas: [{ id: "area", canvasId: "canvas", title: "Area", color: "default", tags: [], anchorX: 0, anchorY: 0, collapsed: true }],
      placements: target.placements.map((item) => item.id === "a" ? { ...item, areaId: "area" } : item),
    };
    expect(derive(collapsed, initial).edges).toEqual([]);
  });
});
