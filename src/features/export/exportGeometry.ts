import { getAreaBounds, type AreaBounds } from "../../domain/area";
import type { CanvasData, Placement } from "../../domain/models";
import type { Selection } from "../../store/appStore";
import type { ExportScope } from "./exportCanvas";

const PADDING = 48;
const MAX_DIMENSION = 12000;
const COLLAPSED_AREA_WIDTH = 220;
const COLLAPSED_AREA_HEIGHT = 52;

export interface ExportFrame {
  width: number;
  height: number;
  transform: string;
}

function placementsBounds(placements: Placement[]): AreaBounds | null {
  if (!placements.length) return null;
  const minX = Math.min(...placements.map((item) => item.position.x));
  const minY = Math.min(...placements.map((item) => item.position.y));
  const maxX = Math.max(...placements.map((item) => item.position.x + item.size.width));
  const maxY = Math.max(...placements.map((item) => item.position.y + item.size.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function combineBounds(bounds: AreaBounds[]): AreaBounds | null {
  if (!bounds.length) return null;
  const minX = Math.min(...bounds.map((item) => item.x));
  const minY = Math.min(...bounds.map((item) => item.y));
  const maxX = Math.max(...bounds.map((item) => item.x + item.width));
  const maxY = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function renderedAreaBounds(canvas: CanvasData, areaId: string): AreaBounds | null {
  const area = canvas.areas.find((item) => item.id === areaId);
  if (!area) return null;
  const bounds = getAreaBounds(area, canvas.placements);
  return area.collapsed
    ? { ...bounds, width: COLLAPSED_AREA_WIDTH, height: COLLAPSED_AREA_HEIGHT }
    : bounds;
}

export function exportBounds(canvas: CanvasData, selection: Selection, scope: ExportScope): AreaBounds | null {
  if (scope === "canvas") {
    const areas = canvas.areas.flatMap((area) => {
      const bounds = renderedAreaBounds(canvas, area.id);
      return bounds ? [bounds] : [];
    });
    const placements = placementsBounds(canvas.placements);
    return combineBounds(placements ? [placements, ...areas] : areas);
  }
  if (scope === "area") {
    if (selection?.type !== "area") return null;
    return renderedAreaBounds(canvas, selection.id);
  }
  if (scope === "selection") {
    if (selection?.type === "area") return renderedAreaBounds(canvas, selection.id);
    if (selection?.type !== "placements") return null;
    return placementsBounds(canvas.placements.filter((item) => selection.ids.includes(item.id)));
  }
  return null;
}

export function exportFrame(canvas: CanvasData, selection: Selection, scope: ExportScope): ExportFrame | null {
  const bounds = exportBounds(canvas, selection, scope);
  if (!bounds) return null;
  const rawWidth = Math.max(1, bounds.width + PADDING * 2);
  const rawHeight = Math.max(1, bounds.height + PADDING * 2);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(rawWidth, rawHeight));
  return {
    width: Math.ceil(rawWidth * scale),
    height: Math.ceil(rawHeight * scale),
    transform: `translate(${PADDING * scale - bounds.x * scale}px, ${PADDING * scale - bounds.y * scale}px) scale(${scale})`,
  };
}
