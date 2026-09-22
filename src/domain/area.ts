import type { Area, Placement } from "./models";

export interface AreaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const AREA_PADDING = 44;

export function getAreaBounds(
  area: Area,
  placements: Placement[],
  padding = AREA_PADDING,
): AreaBounds {
  const members = placements.filter((placement) => placement.areaId === area.id);
  if (members.length === 0) {
    return { x: area.anchorX, y: area.anchorY, width: 176, height: 48 };
  }

  const minX = Math.min(...members.map((placement) => placement.position.x));
  const minY = Math.min(...members.map((placement) => placement.position.y));
  const maxX = Math.max(
    ...members.map((placement) => placement.position.x + placement.size.width),
  );
  const maxY = Math.max(
    ...members.map((placement) => placement.position.y + placement.size.height),
  );
  return {
    x: minX - padding,
    y: minY - padding - 24,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2 + 24,
  };
}

export function containsPoint(bounds: AreaBounds, x: number, y: number, margin = 0): boolean {
  return (
    x >= bounds.x - margin &&
    x <= bounds.x + bounds.width + margin &&
    y >= bounds.y - margin &&
    y <= bounds.y + bounds.height + margin
  );
}
