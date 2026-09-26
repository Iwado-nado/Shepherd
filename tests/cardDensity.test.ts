import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { NodeProps } from "@xyflow/react";
import { CARD_SIZE_PRESETS } from "../src/domain/cardSize";
import { createCanvas } from "../src/domain/project";
import type { Card } from "../src/domain/models";
import { cardDensityForSize } from "../src/features/canvas/cardDensity";

vi.mock("@xyflow/react", () => ({
  Handle: ({ id }: { id: string }) => createElement("i", { "data-handle": id }),
  Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
  MarkerType: { ArrowClosed: "arrowclosed" },
}));

import { CardNode } from "../src/features/canvas/CardNode";
import { toFlowNodes, type CardFlowNode, type CardPlacementStatus } from "../src/features/canvas/flowAdapter";

const card: Card = {
  id: "shared-card",
  title: "A very long Card title",
  body: "Detailed story. ".repeat(200),
  tags: ["a", "b", "c", "d", "e", "f", "g", "h"],
  color: "default",
  muted: false,
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
};

function cardNodeAtSize(size: { width: number; height: number }, sourceCard: Card = card, status?: CardPlacementStatus) {
  const canvas = createCanvas("Canvas");
  canvas.placements.push({
    id: "placement", cardId: sourceCard.id, canvasId: canvas.id,
    position: { x: 0, y: 0 }, size,
  });
  return toFlowNodes(canvas, [sourceCard], [], null, "", [], "any", "dim", undefined, status)[0] as CardFlowNode;
}

describe("Card density derived from Placement size", () => {
  it.each([
    ["Compact", "compact", 14, 0, 0],
    ["Standard", "standard", 15, 3, 3],
    ["Wide", "wide", 22, 3, 5],
    ["Tall", "tall", 24, 9, 5],
    ["Large", "large", 29, 7, 8],
  ] as const)("renders the %s preset with its own title, detail and Tag density", (preset, tier, titleSize, lines, maxTags) => {
    const node = cardNodeAtSize(CARD_SIZE_PRESETS[preset]);
    const markup = renderToStaticMarkup(createElement(CardNode, {
      id: node.id, data: node.data, selected: false,
    } as NodeProps<CardFlowNode>));

    expect(node.data.density).toMatchObject({ tier, titleFontSize: titleSize, detailLines: lines, maxTags });
    expect(markup).toContain(`is-${tier}`);
    expect(markup).toContain(`font-size:${titleSize}px`);
    expect(markup.match(/<span>#[a-h]<\/span>/g) ?? []).toHaveLength(maxTags);
    if (lines) expect(markup).toContain(`-webkit-line-clamp:${lines}`);
    else expect(markup).not.toContain("<p ");
  });

  it("increases detail lines for an intermediate freely resized Card without excessive font scaling", () => {
    const standard = cardDensityForSize(CARD_SIZE_PRESETS.Standard);
    const intermediate = cardDensityForSize({ width: 320, height: 210 });
    const large = cardDensityForSize(CARD_SIZE_PRESETS.Large);
    expect(intermediate).toMatchObject({ tier: "medium", titleFontSize: 18, detailLines: 6 });
    expect(intermediate.previewChars).toBeGreaterThan(standard.previewChars);
    expect(large.previewChars).toBeGreaterThan(intermediate.previewChars);
    expect(large.titleFontSize).toBeGreaterThan(22);
    expect(cardDensityForSize({ width: 1200, height: 900 })).toMatchObject({ tier: "xlarge", titleFontSize: 34, detailLines: 24 });
  });

  it("renders a freely resized oversized Card with a larger title than the Large preset", () => {
    const large = cardNodeAtSize(CARD_SIZE_PRESETS.Large);
    const oversized = cardNodeAtSize({ width: 750, height: 500 });
    const markup = renderToStaticMarkup(createElement(CardNode, {
      id: oversized.id, data: oversized.data, selected: false,
    } as NodeProps<CardFlowNode>));

    expect(oversized.data.density.titleFontSize).toBeGreaterThan(large.data.density.titleFontSize);
    expect(markup).toContain("is-xlarge");
    expect(markup).toContain("font-size:34px");
    expect(oversized.data.bodyPreview.length).toBeGreaterThan(large.data.bodyPreview.length);
  });

  it("shows different details for one shared Card on separate Canvases and updates during resize preview", () => {
    const small = cardNodeAtSize(CARD_SIZE_PRESETS.Compact);
    const tall = cardNodeAtSize(CARD_SIZE_PRESETS.Tall);
    const large = cardNodeAtSize(CARD_SIZE_PRESETS.Large);
    expect(small.data.cardId).toBe(tall.data.cardId);
    expect(tall.data.cardId).toBe(large.data.cardId);
    expect(small.data.density.detailLines).toBe(0);
    expect(tall.data.bodyPreview.length).toBeGreaterThan(120);
    expect(large.data.bodyPreview.length).toBeGreaterThan(tall.data.bodyPreview.length);

    const canvas = createCanvas("Resizable");
    canvas.placements.push({
      id: "preview-placement", cardId: card.id, canvasId: canvas.id,
      position: { x: 0, y: 0 }, size: CARD_SIZE_PRESETS.Compact,
    });
    const preview = toFlowNodes(canvas, [card], [], null, "", [], "any", "dim", {
      placementId: "preview-placement", size: CARD_SIZE_PRESETS.Large,
    })[0] as CardFlowNode;
    expect(preview.data.density.tier).toBe("large");
    expect(preview.data.bodyPreview.length).toBe(large.data.bodyPreview.length);
    expect(canvas.placements[0].size).toEqual(CARD_SIZE_PRESETS.Compact);
  });

  it("preserves Story line breaks, including empty lines, in the Card preview", () => {
    const story = "Opening scene.\r\nSecond scene.\n\nAfter a pause.";
    const node = cardNodeAtSize(CARD_SIZE_PRESETS.Standard, { ...card, body: story });
    const markup = renderToStaticMarkup(createElement(CardNode, {
      id: node.id, data: node.data, selected: false,
    } as NodeProps<CardFlowNode>));

    expect(node.data.bodyPreview).toBe("Opening scene.\nSecond scene.\n\nAfter a pause.");
    expect(markup).toContain("Opening scene.\nSecond scene.\n\nAfter a pause.");
  });

  it("renders a Card color and Muted state without storing either on its Placement", () => {
    const colored = cardNodeAtSize(CARD_SIZE_PRESETS.Standard, { ...card, color: "sage", muted: true });
    const markup = renderToStaticMarkup(createElement(CardNode, {
      id: colored.id, data: colored.data, selected: false,
    } as NodeProps<CardFlowNode>));
    expect(markup).toContain("has-color");
    expect(markup).toContain("is-muted");
    expect(markup).toContain("--item-color:var(--tone-sage)");
  });

  it("shows START and Bookmark marks to the left of CARD above the title", () => {
    const node = cardNodeAtSize(CARD_SIZE_PRESETS.Standard, card, {
      startPlacementId: "placement",
      bookmarkedPlacementIds: new Set(["placement"]),
    });
    const markup = renderToStaticMarkup(createElement(CardNode, {
      id: node.id, data: node.data, selected: false,
    } as NodeProps<CardFlowNode>));

    expect(markup).toContain('aria-label="START"');
    expect(markup).toContain('aria-label="Bookmark"');
    expect(markup.indexOf("★")).toBeLessThan(markup.indexOf("CARD"));
    expect(markup.indexOf('aria-label="Bookmark"')).toBeLessThan(markup.indexOf("CARD"));
    expect(markup.indexOf("CARD")).toBeLessThan(markup.indexOf("<h2"));

    const ordinary = cardNodeAtSize(CARD_SIZE_PRESETS.Compact);
    const compactMarkup = renderToStaticMarkup(createElement(CardNode, {
      id: ordinary.id, data: ordinary.data, selected: false,
    } as NodeProps<CardFlowNode>));
    expect(compactMarkup).not.toContain('aria-label="START"');
    expect(compactMarkup).not.toContain('aria-label="Bookmark"');
  });
});
