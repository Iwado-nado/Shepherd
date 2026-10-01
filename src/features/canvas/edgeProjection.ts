import type { Edge as FlowEdge } from "@xyflow/react";
import type { CanvasData, Card } from "../../domain/models";
import type { FilterBehavior, TagFilterMode } from "../../store/appStore";
import { cardMatchesFilters } from "../search/searchCardPlacements";
import { toFlowEdges, type CardSizePreview } from "./flowAdapter";

interface ConnectedPlacement {
  id: string;
  cardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  muted: boolean;
  matches: boolean;
}

export interface EdgeProjection {
  canvasId: string;
  edgeRecords: CanvasData["edges"];
  endpointIds: ReadonlySet<string>;
  cards: Card[];
  cardsById: ReadonlyMap<string, Card>;
  areas: CanvasData["areas"];
  collapsedAreas: ReadonlySet<string>;
  connected: ConnectedPlacement[];
  selectedEdgeId: string | null;
  filterBehavior: FilterBehavior;
  edges: FlowEdge[];
}

/** Keep the React Flow edge array when a change cannot affect any displayed edge. */
export function projectFlowEdges(
  canvas: CanvasData,
  cards: Card[],
  selectedEdgeId: string | null,
  query: string,
  filterTags: string[],
  tagMode: TagFilterMode,
  filterBehavior: FilterBehavior,
  resizePreview?: CardSizePreview,
  previous?: EdgeProjection | null,
): EdgeProjection {
  const sameEdges = previous?.canvasId === canvas.id && previous.edgeRecords === canvas.edges;
  const endpointIds = sameEdges ? previous.endpointIds : new Set(canvas.edges.flatMap((edge) => [
    edge.sourcePlacementId, edge.targetPlacementId,
  ]));
  if (sameEdges && endpointIds.size === 0) return previous;
  const cardsById = previous?.cards === cards ? previous.cardsById : new Map(cards.map((card) => [card.id, card]));
  const collapsedAreas = previous?.areas === canvas.areas ? previous.collapsedAreas
    : new Set(canvas.areas.filter((area) => area.collapsed).map((area) => area.id));
  const connected: ConnectedPlacement[] = canvas.placements.filter((placement) => endpointIds.has(placement.id))
    .map((placement) => {
      const card = cardsById.get(placement.cardId);
      const size = resizePreview?.placementId === placement.id ? resizePreview.size : placement.size;
      return {
        id: placement.id, cardId: placement.cardId, x: placement.position.x, y: placement.position.y,
        width: size.width, height: size.height,
        collapsed: Boolean(placement.areaId && collapsedAreas.has(placement.areaId)),
        muted: card?.muted ?? false,
        matches: Boolean(card && cardMatchesFilters(card, query, filterTags, tagMode)),
      };
    });

  if (sameEdges && previous.selectedEdgeId === selectedEdgeId && previous.filterBehavior === filterBehavior &&
      connected.length === previous.connected.length && connected.every((item, index) => {
        const old = previous.connected[index];
        return item.id === old.id && item.x === old.x && item.y === old.y &&
          item.width === old.width && item.height === old.height &&
          item.collapsed === old.collapsed && item.muted === old.muted && item.matches === old.matches;
      })) return previous;

  const visiblePlacementIds = filterBehavior === "hide"
    ? new Set(connected.filter((item) => item.matches).map((item) => item.id)) : undefined;
  const mutedCardIds = new Set(connected.filter((item) => item.muted).map((item) => item.cardId));
  const dimmedPlacementIds = new Set((query || filterTags.length)
    ? connected.filter((item) => !item.matches).map((item) => item.id) : []);
  return {
    canvasId: canvas.id, edgeRecords: canvas.edges, endpointIds, cards, cardsById, areas: canvas.areas,
    collapsedAreas, connected, selectedEdgeId, filterBehavior,
    edges: toFlowEdges(canvas, selectedEdgeId, visiblePlacementIds, resizePreview, mutedCardIds, dimmedPlacementIds),
  };
}
