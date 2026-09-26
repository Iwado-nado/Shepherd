import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { COLOR_PRESETS, itemColorValue } from "../src/features/colorPresets";
import { ColorPresets } from "../src/features/editor/ColorPresets";

describe("Card / Area color presets", () => {
  it("offers Default and subdued presets with the selected color reflected", () => {
    const markup = renderToStaticMarkup(createElement(ColorPresets, {
      label: "Card", value: "sage", onChange: vi.fn(),
    }));
    expect(COLOR_PRESETS.map((preset) => preset.label)).toEqual(["Default", "Slate", "Sage", "Clay", "Mauve", "Sand"]);
    expect(markup).toContain('aria-label="Card color"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("--swatch-color:var(--tone-sage)");
  });

  it("keeps legacy Area HEX colors visible until a preset is chosen", () => {
    expect(itemColorValue("#7f9450")).toBe("#7f9450");
    expect(itemColorValue("default")).toBe("var(--line)");
    const markup = renderToStaticMarkup(createElement(ColorPresets, {
      label: "Area", value: "#7f9450", onChange: vi.fn(),
    }));
    expect(markup).toContain("Custom");
    expect(markup).toContain("--swatch-color:#7f9450");
  });

  it("does not mark a preset as selected for mixed Card colors", () => {
    const markup = renderToStaticMarkup(createElement(ColorPresets, {
      label: "Selected cards", value: null, onChange: vi.fn(),
    }));
    expect(markup).toContain('aria-label="Selected cards color"');
    expect(markup).not.toContain('aria-pressed="true"');
    expect(markup).not.toContain("Custom");
  });
});
