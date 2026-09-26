import { CARD_HEIGHT, CARD_WIDTH, COMPACT_CARD_HEIGHT, COMPACT_CARD_WIDTH, type Placement } from "./models";

export type CardSize = Placement["size"];

export const MIN_CARD_SIZE: CardSize = { width: 160, height: 80 };
export const MAX_CARD_SIZE: CardSize = { width: 1200, height: 900 };

export const CARD_SIZE_PRESETS = {
  Compact: { width: COMPACT_CARD_WIDTH, height: COMPACT_CARD_HEIGHT },
  Standard: { width: CARD_WIDTH, height: CARD_HEIGHT },
  Wide: { width: 400, height: CARD_HEIGHT },
  Tall: { width: CARD_WIDTH, height: 320 },
  Large: { width: 440, height: 300 },
} as const satisfies Record<string, CardSize>;

export function clampCardSize(size: CardSize): CardSize {
  return {
    width: Math.min(MAX_CARD_SIZE.width, Math.max(MIN_CARD_SIZE.width, Math.round(size.width))),
    height: Math.min(MAX_CARD_SIZE.height, Math.max(MIN_CARD_SIZE.height, Math.round(size.height))),
  };
}

export function resizeCardFromPointer(
  initial: CardSize,
  start: { x: number; y: number },
  current: { x: number; y: number },
  zoom: number,
): CardSize {
  return clampCardSize({
    width: initial.width + (current.x - start.x) / zoom,
    height: initial.height + (current.y - start.y) / zoom,
  });
}
