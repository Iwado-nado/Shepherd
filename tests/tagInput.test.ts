import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { splitTagDraft, TagInput } from "../src/features/editor/TagInput";

describe("Tag token input", () => {
  it("keeps incomplete text separate from Tags completed by commas or spaces", () => {
    expect(splitTagDraft("#A #B　入力中")).toEqual({ confirmed: ["A", "B"], pending: "入力中" });
    expect(splitTagDraft("Alice,Bob ")).toEqual({ confirmed: ["Alice", "Bob"], pending: "" });
    expect(splitTagDraft("Alice　Bob")).toEqual({ confirmed: ["Alice"], pending: "Bob" });
    expect(splitTagDraft("書きかけ")).toEqual({ confirmed: [], pending: "書きかけ" });
    expect(splitTagDraft("#A, #A ")).toEqual({ confirmed: ["A"], pending: "" });
  });

  it("renders confirmed Tags as chips before the current input text", () => {
    const markup = renderToStaticMarkup(createElement(TagInput, {
      id: "card-tags",
      label: "Card tags",
      tags: ["A", "B"],
      input: "現在入力中",
      onTagsChange: vi.fn(),
      onInputChange: vi.fn(),
      onCommit: vi.fn(),
    }));

    expect(markup).toContain('aria-label="#Aを解除"');
    expect(markup).toContain('aria-label="#Bを解除"');
    expect(markup).toContain('aria-label="Card tags"');
    expect(markup.indexOf("#A</span>")).toBeLessThan(markup.indexOf("#B</span>"));
    expect(markup.indexOf("#B</span>")).toBeLessThan(markup.indexOf('value="現在入力中"'));
  });
});
