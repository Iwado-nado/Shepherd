import type { CanvasData } from "../../domain/models";

export const RIGHT_DRAG_THRESHOLD = 6;

export function exceedsRightDragThreshold(
  start: { x: number; y: number },
  current: { x: number; y: number },
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= RIGHT_DRAG_THRESHOLD;
}

export function canCreateRightDragEdge(canvas: CanvasData, sourceId: string, targetId: string | null): targetId is string {
  if (!targetId || sourceId === targetId) return false;
  return canvas.placements.some((placement) => placement.id === sourceId) &&
    canvas.placements.some((placement) => placement.id === targetId);
}
