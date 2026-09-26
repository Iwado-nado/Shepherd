import type { CanvasData, Card, Placement } from "../../domain/models";

export interface CanvasTreeCard {
  placement: Placement;
  card: Card;
}

export function canvasTree(canvas: CanvasData, cards: Card[], includeCard: (card: Card) => boolean = () => true) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const entries = canvas.placements.flatMap((placement) => {
    const card = cardsById.get(placement.cardId);
    return card && includeCard(card) ? [{ placement, card }] : [];
  });
  const areaIds = new Set(canvas.areas.map((area) => area.id));
  return {
    ungrouped: entries.filter(({ placement }) => !placement.areaId || !areaIds.has(placement.areaId)),
    areas: canvas.areas.map((area) => ({
      area,
      cards: entries.filter(({ placement }) => placement.areaId === area.id),
    })),
  };
}
