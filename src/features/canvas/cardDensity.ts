import type { CardSize } from "../../domain/cardSize";

export type CardDensityTier = "compact" | "standard" | "medium" | "wide" | "tall" | "large" | "xlarge";

export interface CardDensity {
  tier: CardDensityTier;
  titleFontSize: number;
  detailFontSize: number;
  detailLines: number;
  previewChars: number;
  maxTags: number;
}

export function cardDensityForSize(size: CardSize): CardDensity {
  const { width, height } = size;
  const tier: CardDensityTier = height < 120 || (width < 205 && height < 200)
    ? "compact"
    : width >= 620 && height >= 420
      ? "xlarge"
      : width >= 360 && height >= 240
        ? "large"
        : height >= 240
          ? "tall"
          : width >= 360
            ? "wide"
            : width >= 300 || height >= 190
              ? "medium"
              : "standard";

  if (tier === "compact") {
    return { tier, titleFontSize: 14, detailFontSize: 12, detailLines: 0, previewChars: 0, maxTags: 0 };
  }

  const titleFontSize = tier === "xlarge" ? 34 : tier === "large" ? 29 : tier === "tall" ? 24 : tier === "wide" ? 22 : tier === "medium" ? 18 : 15;
  const detailFontSize = tier === "xlarge" ? 15 : tier === "large" ? 14 : tier === "standard" ? 12 : 13;
  const reservedHeight = tier === "xlarge" ? 180 : tier === "large" ? 138 : tier === "tall" ? 128 : tier === "standard" ? 96 : 90;
  const lineHeight = tier === "xlarge" ? 24 : tier === "large" ? 22 : tier === "standard" ? 19 : 20;
  const detailLines = Math.min(24, Math.max(2, Math.floor((height - reservedHeight) / lineHeight)));
  const previewChars = Math.min(1800, Math.max(120, Math.ceil(
    detailLines * Math.max(12, (width - 36) / (detailFontSize * 0.75)) * 1.5,
  )));
  return {
    tier,
    titleFontSize,
    detailFontSize,
    detailLines,
    previewChars,
    maxTags: tier === "xlarge" ? 10 : tier === "large" ? 8 : tier === "tall" || tier === "wide" ? 5 : tier === "medium" ? 4 : 3,
  };
}
