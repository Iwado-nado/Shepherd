import { describe, expect, it } from "vitest";
import { CARD_SIZE_PRESETS, MAX_CARD_SIZE, MIN_CARD_SIZE, resizeCardFromPointer } from "../src/domain/cardSize";

describe("Card resize gesture", () => {
  it("resizes horizontally and vertically in flow coordinates after zoom and pan", () => {
    const initial = CARD_SIZE_PRESETS.Standard;
    expect(resizeCardFromPointer(initial, { x: 200, y: 300 }, { x: 520, y: 300 }, 2))
      .toEqual({ width: 424, height: 156 });
    expect(resizeCardFromPointer(initial, { x: 500, y: 100 }, { x: 500, y: 428 }, 2))
      .toEqual({ width: 264, height: 320 });
    expect(resizeCardFromPointer(initial, { x: 200, y: 300 }, { x: 360, y: 464 }, 0.5))
      .toEqual({ width: 584, height: 484 });
  });

  it("clamps very small and large Card dimensions", () => {
    expect(resizeCardFromPointer(CARD_SIZE_PRESETS.Standard, { x: 0, y: 0 }, { x: -1000, y: -1000 }, 1))
      .toEqual(MIN_CARD_SIZE);
    expect(resizeCardFromPointer(CARD_SIZE_PRESETS.Standard, { x: 0, y: 0 }, { x: 2000, y: 2000 }, 1))
      .toEqual(MAX_CARD_SIZE);
  });
});
