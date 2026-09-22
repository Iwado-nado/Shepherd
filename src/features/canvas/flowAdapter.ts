import { MarkerType, type Edge as FlowEdge, type Node } from "@xyflow/react";
import { getAreaBounds } from "../../domain/area";
import type { CanvasData, Card, Placement } from "../../domain/models";
import type { FilterBehavior, TagFilterMode } from "../../store/appStore";

export interface CardNodeData extends Record<string, unknown> {
  title: string;
  bodyPreview: string;
  cardId: string;
  tags: string[];
  displayMode: "standard" | "compact";
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
export type FlowNodeCanvas = Pick<CanvasData, "areas" | "displayMode" | "placements">;
export type FlowEdgeCanvas = Pick<CanvasData, "areas" | "edges" | "placements">;

function preview(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 120);
}

function tagsMatch(tags: string[], filters: string[], mode: TagFilterMode): boolean {
  if (!filters.length) return true;
  return mode === "all"
    ? filters.every((tag) => tags.includes(tag))
    : filters.some((tag) => tags.includes(tag));
}

function cardMatches(card: Card, query: string, filterTags: string[], tagMode: TagFilterMode): boolean {
  if (!tagsMatch(card.tags, filterTags, tagMode)) return false;
  if (!query) return true;
  const needle = query.toLocaleLowerCase();
  return [card.title, card.body, ...card.tags].some((value) =>
    value.toLocaleLowerCase().includes(needle),
  );
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
): ShepherdFlowNode[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const collapsedAreaIds = new Set(canvas.areas.filter((area) => area.collapsed).map((area) => area.id));
  const areaNodes = canvas.areas.flatMap<AreaFlowNode>((area) => {
    const bounds = getAreaBounds(area, canvas.placements);
    const count = canvas.placements.filter((placement) => placement.areaId === area.id).length;
    const matchesTag = tagsMatch(area.tags, filterTags, tagMode);
    const matchesQuery = !query || [area.title, ...area.tags].some((value) =>
      value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );
    const matches = matchesTag && matchesQuery;
    if (filterBehavior === "hide" && !matches) return [];
    return [{
      id: area.id,
      type: "area",
      position: { x: bounds.x, y: bounds.y },
      width: area.collapsed ? 220 : bounds.width,
      height: area.collapsed ? 52 : bounds.height,
      zIndex: -1,
      dragHandle: ".area-node-title",
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
    const matches = cardMatches(card, query, filterTags, tagMode);
    if (filterBehavior === "hide" && !matches) return [];
    return [{
      id: placement.id,
      type: "card",
      position: placement.position,
      width: placement.size.width,
      height: placement.size.height,
      selected: selectedPlacementIds.includes(placement.id),
      className: (query || filterTags.length) && !matches ? "is-dimmed" : undefined,
      data: {
        title: card.title,
        bodyPreview: preview(card.body),
        cardId: card.id,
        tags: card.tags,
        displayMode: canvas.displayMode,
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
    const handles = connectionHandles(source, target);
    return [{
      id: edge.id,
      source: edge.sourcePlacementId,
      target: edge.targetPlacementId,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      label: edge.label,
      type: "smoothstep",
      selected: edge.id === selectedEdgeId,
      markerEnd: edge.direction === "directed" ? { type: MarkerType.ArrowClosed } : undefined,
      style: { strokeWidth: 1.6 },
      labelStyle: { fontSize: 12, fontWeight: 600 },
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 3,
    }];
  });
}
