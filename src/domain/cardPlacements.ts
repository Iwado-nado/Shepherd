import type { CanvasData, Card } from "./models";

export function unplacedCards(cards: Card[], canvases: CanvasData[]): Card[] {
  const placedCardIds = new Set(canvases.flatMap((canvas) => canvas.placements.map((placement) => placement.cardId)));
  return cards.filter((card) => !placedCardIds.has(card.id));
}

export function cardDestinations(cardId: string, canvases: CanvasData[]) {
  return canvases.flatMap((canvas) => canvas.placements
    .filter((placement) => placement.cardId === cardId)
    .map((placement) => ({
      canvasId: canvas.id,
      canvasTitle: canvas.title,
      placementId: placement.id,
      areaTitle: canvas.areas.find((area) => area.id === placement.areaId)?.title,
    })));
}
