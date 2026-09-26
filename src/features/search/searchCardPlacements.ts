import type { CanvasData, Card } from "../../domain/models";

export interface CardPlacementResult {
  cardId: string;
  placementId: string;
  canvasId: string;
  canvasTitle: string;
  title: string;
  tags: string[];
  color: string;
  muted: boolean;
}

export function cardMatchesFilters(
  card: Pick<Card, "title" | "tags">,
  query: string,
  filterTags: string[],
  tagMode: "any" | "all",
): boolean {
  const needle = query.trim().replace(/^#/, "").toLocaleLowerCase();
  if (needle && ![card.title, ...card.tags].some((value) => value.toLocaleLowerCase().includes(needle))) return false;
  if (!filterTags.length) return true;
  return tagMode === "all"
    ? filterTags.every((tag) => card.tags.includes(tag))
    : filterTags.some((tag) => card.tags.includes(tag));
}

export function searchCardPlacements(
  cards: Card[], canvases: CanvasData[], query: string,
  filterTags: string[] = [], tagMode: "any" | "all" = "any",
): CardPlacementResult[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return canvases.flatMap((canvas) => canvas.placements.flatMap((placement) => {
    const card = cardsById.get(placement.cardId);
    if (!card || !cardMatchesFilters(card, query, filterTags, tagMode)) return [];
    return [{
      cardId: card.id,
      placementId: placement.id,
      canvasId: canvas.id,
      canvasTitle: canvas.title,
      title: card.title || "Untitled Card",
      tags: card.tags,
      color: card.color,
      muted: card.muted,
    }];
  }));
}
