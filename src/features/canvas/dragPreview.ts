import { containsPoint, getAreaBounds, type AreaBounds } from "../../domain/area";
import type { CanvasData } from "../../domain/models";
import type { ShepherdFlowNode } from "./flowAdapter";

const ALIGNMENT_THRESHOLD = 7;
const AREA_BUCKET_WIDTH = 512;
const MAX_AREA_BUCKETS = 128;
const CARD_WIDTH_FALLBACK = 264;
const CARD_HEIGHT_FALLBACK = 156;

interface IndexedArea {
  id: string;
  bounds: AreaBounds;
  order: number;
}

export interface DragPreview {
  canvasId: string;
  nodeId: string;
  areas: CanvasData["areas"];
  placements: CanvasData["placements"];
  size: { width: number; height: number };
  currentArea: IndexedArea | undefined;
  areaBuckets: Map<number, IndexedArea[]>;
  wideAreas: IndexedArea[];
  guideX: number[];
  guideY: number[];
}

export function createDragPreview(canvas: CanvasData, nodes: ShepherdFlowNode[], nodeId: string): DragPreview | null {
  const placement = canvas.placements.find((item) => item.id === nodeId);
  if (!placement) return null;

  const guideX: number[] = [];
  const guideY: number[] = [];
  for (const node of nodes) {
    if (node.id === nodeId || node.type !== "card") continue;
    const width = node.width ?? CARD_WIDTH_FALLBACK;
    const height = node.height ?? CARD_HEIGHT_FALLBACK;
    guideX.push(node.position.x, node.position.x + width / 2, node.position.x + width);
    guideY.push(node.position.y, node.position.y + height / 2, node.position.y + height);
  }
  guideX.sort((a, b) => a - b);
  guideY.sort((a, b) => a - b);

  const areaBuckets = new Map<number, IndexedArea[]>();
  const wideAreas: IndexedArea[] = [];
  let currentArea: IndexedArea | undefined;
  canvas.areas.forEach((area, order) => {
    const indexed = { id: area.id, bounds: getAreaBounds(area, canvas.placements), order };
    if (area.id === placement.areaId) currentArea = indexed;
    if (area.collapsed) return;
    const first = Math.floor((indexed.bounds.x - 20) / AREA_BUCKET_WIDTH);
    const last = Math.floor((indexed.bounds.x + indexed.bounds.width + 20) / AREA_BUCKET_WIDTH);
    if (last - first >= MAX_AREA_BUCKETS) {
      wideAreas.push(indexed);
    } else {
      for (let bucket = first; bucket <= last; bucket++) {
        const list = areaBuckets.get(bucket) ?? [];
        list.push(indexed);
        areaBuckets.set(bucket, list);
      }
    }
  });

  return {
    canvasId: canvas.id, nodeId, areas: canvas.areas, placements: canvas.placements,
    size: placement.size, currentArea, areaBuckets, wideAreas, guideX, guideY,
  };
}

function nearestGuide(values: number[], candidates: number[]): number | undefined {
  let best: number | undefined;
  let distance = ALIGNMENT_THRESHOLD;
  for (const candidate of candidates) {
    let low = 0;
    let high = values.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (values[middle] < candidate) low = middle + 1;
      else high = middle;
    }
    for (const index of [low - 1, low]) {
      if (index < 0 || index >= values.length) continue;
      const difference = Math.abs(candidate - values[index]);
      if (difference <= ALIGNMENT_THRESHOLD && (best === undefined || difference < distance)) {
        best = values[index];
        distance = difference;
      }
    }
  }
  return best;
}

export function dragGuides(preview: DragPreview, node: ShepherdFlowNode): { x?: number; y?: number } {
  const width = node.width ?? CARD_WIDTH_FALLBACK;
  const height = node.height ?? CARD_HEIGHT_FALLBACK;
  return {
    x: nearestGuide(preview.guideX, [node.position.x, node.position.x + width / 2, node.position.x + width]),
    y: nearestGuide(preview.guideY, [node.position.y, node.position.y + height / 2, node.position.y + height]),
  };
}

export function dragDropArea(preview: DragPreview, node: ShepherdFlowNode): string {
  const centerX = node.position.x + preview.size.width / 2;
  const centerY = node.position.y + preview.size.height / 2;
  const candidates = preview.areaBuckets.get(Math.floor(centerX / AREA_BUCKET_WIDTH)) ?? [];
  let match: IndexedArea | undefined;
  for (const area of candidates) {
    if ((!match || area.order < match.order) && containsPoint(area.bounds, centerX, centerY, 20)) match = area;
  }
  for (const area of preview.wideAreas) {
    if ((!match || area.order < match.order) && containsPoint(area.bounds, centerX, centerY, 20)) match = area;
  }
  if (match) return match.id;
  const current = preview.currentArea;
  return current && containsPoint(current.bounds, centerX, centerY, 56) ? current.id : "";
}
