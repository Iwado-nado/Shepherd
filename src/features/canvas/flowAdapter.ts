import { MarkerType, type Edge as FlowEdge, type Node } from "@xyflow/react";
import { getAreaBounds } from "../../domain/area";
import type { CanvasData, Card, Placement } from "../../domain/models";
import type { CardSize } from "../../domain/cardSize";
import type { FilterBehavior, TagFilterMode } from "../../store/appStore";
import { cardDensityForSize, type CardDensity } from "./cardDensity";
import { cardMatchesFilters } from "../search/searchCardPlacements";

export interface CardNodeData extends Record<string, unknown> {
  title: string;
  bodyPreview: string;
  cardId: string;
  tags: string[];
  color: string;
  muted: boolean;
  isStart: boolean;
  isBookmarked: boolean;
  density: CardDensity;
}

export interface AreaNodeData extends Record<string, unknown> {
  title: string;
  color: string;
  tags: string[];
  count: number;
  collapsed: boolean;
  boundsX: number;
  boundsY: number;
}

export type CardFlowNode = Node<CardNodeData, "card">;
export type AreaFlowNode = Node<AreaNodeData, "area">;
export type ShepherdFlowNode = CardFlowNode | AreaFlowNode;
export type FlowNodeCanvas = Pick<CanvasData, "areas" | "placements">;
export type FlowEdgeCanvas = Pick<CanvasData, "areas" | "edges" | "placements">;
export interface CardSizePreview {
  placementId: string;
  size: CardSize;
}

export interface CardPlacementStatus {
  startPlacementId?: string | null;
  bookmarkedPlacementIds?: ReadonlySet<string>;
}

function preview(body: string, length: number): string {
  return body.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").trim().slice(0, length);
}

function tagsMatch(tags: string[], filters: string[], mode: TagFilterMode): boolean {
  if (!filters.length) return true;
  return mode === "all"
    ? filters.every((tag) => tags.includes(tag))
    : filters.some((tag) => tags.includes(tag));
}

export function toFlowNodes(
  canvas: FlowNodeCanvas,
  cards: Card[],
  selectedPlacementIds: string[],
  selectedAreaId: string | null,
  query: string,
  filterTags: string[],
  tagMode: TagFilterMode,
  filterBehavior: FilterBehavior,
  resizePreview?: CardSizePreview,
  status?: CardPlacementStatus,
): ShepherdFlowNode[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const collapsedAreaIds = new Set(canvas.areas.filter((area) => area.collapsed).map((area) => area.id));
  const visibleCardIds = new Set(canvas.placements.flatMap((placement) => {
    const card = cardsById.get(placement.cardId);
    return card && cardMatchesFilters(card, query, filterTags, tagMode) ? [card.id] : [];
  }));
  const areaNodes = canvas.areas.flatMap<AreaFlowNode>((area) => {
    const bounds = getAreaBounds(area, canvas.placements);
    const count = canvas.placements.filter((placement) => placement.areaId === area.id).length;
    const matchesTag = tagsMatch(area.tags, filterTags, tagMode);
    const matchesQuery = !query || [area.title, ...area.tags].some((value) =>
      value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );
    const matches = (matchesTag && matchesQuery) || canvas.placements.some((placement) =>
      placement.areaId === area.id && visibleCardIds.has(placement.cardId));
    if (filterBehavior === "hide" && !matches) return [];
    return [{
      id: area.id,
      type: "area",
      position: { x: bounds.x, y: bounds.y },
      width: area.collapsed ? 220 : bounds.width,
      height: area.collapsed ? 52 : bounds.height,
      zIndex: -1,
      dragHandle: ".area-node-title",
      selectable: true,
      selected: area.id === selectedAreaId,
      className: (query || filterTags.length) && !matches ? "is-dimmed" : undefined,
      data: {
        title: area.title,
        color: area.color,
        tags: area.tags,
        count,
        collapsed: area.collapsed,
        boundsX: bounds.x,
        boundsY: bounds.y,
      },
    }];
  });
  const cardNodes: CardFlowNode[] = canvas.placements.flatMap((placement) => {
    if (placement.areaId && collapsedAreaIds.has(placement.areaId)) return [];
    const card = cardsById.get(placement.cardId);
    if (!card) return [];
    const matches = visibleCardIds.has(card.id);
    if (filterBehavior === "hide" && !matches) return [];
    const size = resizePreview?.placementId === placement.id ? resizePreview.size : placement.size;
    const density = cardDensityForSize(size);
    return [{
      id: placement.id,
      type: "card",
      position: placement.position,
      width: size.width,
      height: size.height,
      selectable: true,
      selected: selectedPlacementIds.includes(placement.id),
      className: [card.muted ? "is-muted" : "", (query || filterTags.length) && !matches ? "is-dimmed" : ""]
        .filter(Boolean).join(" ") || undefined,
      data: {
        title: card.title,
        bodyPreview: preview(card.body, density.previewChars),
        cardId: card.id,
        tags: card.tags,
        color: card.color,
        muted: card.muted,
        isStart: status?.startPlacementId === placement.id,
        isBookmarked: status?.bookmarkedPlacementIds?.has(placement.id) ?? false,
        density,
      },
    }];
  });
  return [...areaNodes, ...cardNodes];
}

function connectionHandles(source: Placement, target: Placement) {
  const sourceCenter = {
    x: source.position.x + source.size.width / 2,
    y: source.position.y + source.size.height / 2,
  };
  const targetCenter = {
    x: target.position.x + target.size.width / 2,
    y: target.position.y + target.size.height / 2,
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  }
  return dy >= 0
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" };
}

export function toFlowEdges(
  canvas: FlowEdgeCanvas,
  selectedEdgeId: string | null,
  visiblePlacementIds?: Set<string>,
  resizePreview?: CardSizePreview,
  mutedCardIds?: Set<string>,
  dimmedPlacementIds?: Set<string>,
): FlowEdge[] {
  const hiddenAreas = new Set(canvas.areas.filter((area) => area.collapsed).map((area) => area.id));
  const placementsById = new Map(canvas.placements.map((placement) => [placement.id, placement]));
  return canvas.edges.flatMap((edge) => {
    const source = placementsById.get(edge.sourcePlacementId);
    const target = placementsById.get(edge.targetPlacementId);
    if (!source || !target ||
        (visiblePlacementIds && (!visiblePlacementIds.has(source.id) || !visiblePlacementIds.has(target.id))) ||
        (source.areaId && hiddenAreas.has(source.areaId)) ||
        (target.areaId && hiddenAreas.has(target.areaId))) return [];
    const previewPlacement = (placement: Placement) => resizePreview?.placementId === placement.id
      ? { ...placement, size: resizePreview.size }
      : placement;
    const sourcePlacement = previewPlacement(source);
    const targetPlacement = previewPlacement(target);
    const handles = connectionHandles(sourcePlacement, targetPlacement);
    const sourceCenter = {
      x: sourcePlacement.position.x + sourcePlacement.size.width / 2,
      y: sourcePlacement.position.y + sourcePlacement.size.height / 2,
    };
    const targetCenter = {
      x: targetPlacement.position.x + targetPlacement.size.width / 2,
      y: targetPlacement.position.y + targetPlacement.size.height / 2,
    };
    const reverse = sourceCenter.x > targetCenter.x ||
      (sourceCenter.x === targetCenter.x && sourceCenter.y > targetCenter.y);
    const directionLabel = edge.direction === "undirected" ? "↔" : reverse ? "←" : "→";
    const marker = { type: MarkerType.ArrowClosed, color: edge.id === selectedEdgeId ? "var(--accent)" : "var(--edge)" };
    return [{
      id: edge.id,
      source: edge.sourcePlacementId,
      target: edge.targetPlacementId,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      label: `${directionLabel}${edge.label ? `  ${edge.label}` : ""}`,
      type: "smoothstep",
      selectable: true,
      selected: edge.id === selectedEdgeId,
      className: [
        mutedCardIds?.has(source.cardId) || mutedCardIds?.has(target.cardId) ? "is-muted" : "",
        dimmedPlacementIds?.has(source.id) || dimmedPlacementIds?.has(target.id) ? "is-dimmed" : "",
      ].filter(Boolean).join(" ") || undefined,
      markerStart: edge.direction === "undirected" ? marker : undefined,
      markerEnd: marker,
      style: {
        strokeWidth: 1.8,
        strokeDasharray: edge.lineStyle === "dashed" ? "8 6" : edge.lineStyle === "dotted" ? "1 6" : undefined,
        strokeLinecap: edge.lineStyle === "dotted" ? "round" : undefined,
      },
      labelStyle: { fontSize: 12, fontWeight: 700, fill: "var(--ink)" },
      labelBgStyle: { fill: "var(--panel)", stroke: "var(--line)", strokeWidth: 0.8 },
      labelBgPadding: [8, 5],
      labelBgBorderRadius: 4,
    }];
  });
}
