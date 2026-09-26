import { describe, expect, it } from "vitest";
import { createCanvas } from "../src/domain/project";
import {
  canCreateRightDragEdge,
  exceedsRightDragThreshold,
  RIGHT_DRAG_THRESHOLD,
} from "../src/features/canvas/rightDragConnection";

describe("right-drag connection", () => {
  it("activates only after the pointer reaches the drag threshold", () => {
    expect(exceedsRightDragThreshold({ x: 10, y: 10 }, { x: 13, y: 14 })).toBe(false);
    expect(exceedsRightDragThreshold(
      { x: 10, y: 10 },
      { x: 10 + RIGHT_DRAG_THRESHOLD, y: 10 },
    )).toBe(true);
  });

  it("accepts two different Placements on the active Canvas only", () => {
    const canvas = createCanvas("Canvas");
    canvas.placements = [
      {
        id: "source",
        cardId: "card-source",
        canvasId: canvas.id,
        position: { x: 0, y: 0 },
        size: { width: 264, height: 156 },
      },
      {
        id: "target",
        cardId: "card-target",
        canvasId: canvas.id,
        position: { x: 300, y: 0 },
        size: { width: 264, height: 156 },
      },
    ];

    expect(canCreateRightDragEdge(canvas, "source", "target")).toBe(true);
    expect(canCreateRightDragEdge(canvas, "source", "source")).toBe(false);
    expect(canCreateRightDragEdge(canvas, "source", "other-canvas-placement")).toBe(false);
    expect(canCreateRightDragEdge(canvas, "source", null)).toBe(false);
  });
});
