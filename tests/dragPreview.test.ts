import { describe, expect, it } from "vitest";
import type { CanvasData } from "../src/domain/models";
import { createDragPreview, dragDropArea, dragGuides } from "../src/features/canvas/dragPreview";
import type { CardFlowNode } from "../src/features/canvas/flowAdapter";

function setup() {
  const canvas: CanvasData = {
    id: "canvas", title: "Canvas", displayMode: "standard", viewport: { x: 0, y: 0, zoom: 1 },
    areas: [
      { id: "first", canvasId: "canvas", title: "First", color: "default", tags: [], anchorX: 700, anchorY: 0, collapsed: false },
      { id: "second", canvasId: "canvas", title: "Second", color: "default", tags: [], anchorX: 400, anchorY: 0, collapsed: false },
    ],
    placements: [
      { id: "dragged", cardId: "a", canvasId: "canvas", areaId: "second", position: { x: 400, y: 0 }, size: { width: 100, height: 100 } },
      { id: "other", cardId: "b", canvasId: "canvas", position: { x: 1000, y: 1000 }, size: { width: 100, height: 100 } },
    ],
    edges: [],
  };
  const nodes: CardFlowNode[] = canvas.placements.map((placement) => ({
    id: placement.id, type: "card", position: placement.position,
    width: placement.size.width, height: placement.size.height, data: {
      cardId: placement.cardId, title: "", bodyPreview: "", tags: [], color: "default", muted: false,
      isStart: false, isBookmarked: false,
      density: { tier: "standard", titleFontSize: 15, detailFontSize: 12, detailLines: 2, previewChars: 120, maxTags: 3 },
    },
  }));
  return { canvas, nodes, dragged: nodes[0] };
}

describe("drag preview snapshot", () => {
  it("resolves guides from the cached candidates without scanning live nodes", () => {
    const { canvas, nodes, dragged } = setup();
    const preview = createDragPreview(canvas, nodes, dragged.id)!;
    nodes[1].position = { x: 2000, y: 2000 };
    expect(dragGuides(preview, { ...dragged, position: { x: 902, y: 905 } })).toEqual({ x: 1000, y: 1000 });
    expect(dragGuides(preview, { ...dragged, position: { x: 892.5, y: 892.5 } })).toEqual({ x: undefined, y: undefined });
    expect(dragGuides(preview, { ...dragged, position: { x: 0, y: 0 } })).toEqual({ x: undefined, y: undefined });
  });

  it("preserves Area priority, current Area margin and placement-sized drop centers", () => {
    const { canvas, nodes, dragged } = setup();
    const preview = createDragPreview(canvas, nodes, dragged.id)!;
    expect(dragDropArea(preview, dragged)).toBe("second");
    expect(dragDropArea(preview, { ...dragged, position: { x: 430, y: 0 } })).toBe("second");
    expect(dragDropArea(preview, { ...dragged, position: { x: 525, y: 0 } })).toBe("second");
    expect(dragDropArea(preview, { ...dragged, position: { x: 570, y: 0 } })).toBe("");
    canvas.areas[1].anchorX = 2000;
    expect(dragDropArea(preview, dragged)).toBe("second");
  });

  it("picks the earliest overlapping Area, including wide Areas", () => {
    const { canvas, nodes, dragged } = setup();
    canvas.areas[0].anchorX = 400;
    canvas.areas[0].anchorY = 0;
    canvas.placements[0].areaId = "first";
    canvas.placements.push({
      id: "far", cardId: "c", canvasId: "canvas", areaId: "first",
      position: { x: 70000, y: 0 }, size: { width: 100, height: 100 },
    });
    canvas.areas[1].anchorX = 400;
    const preview = createDragPreview(canvas, nodes, dragged.id)!;
    expect(dragDropArea(preview, dragged)).toBe("first");
  });
});
