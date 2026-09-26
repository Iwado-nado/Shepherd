import { useEffect, useMemo, useRef } from "react";
import { getActiveCanvas, useAppStore } from "../../store/appStore";
import { searchCardPlacements } from "./searchCardPlacements";
import { unplacedCards } from "../../domain/cardPlacements";
import { itemColorValue } from "../colorPresets";

interface SearchResult {
  key: string;
  type: "CARD" | "CANVAS" | "AREA" | "TAG";
  title: string;
  detail?: string;
  color?: string;
  muted?: boolean;
  run: () => void;
}

export function CommandPalette() {
  const inputRef = useRef<HTMLInputElement>(null);
  const mode = useAppStore((state) => state.searchMode);
  const query = useAppStore((state) => state.searchQuery);
  const project = useAppStore((state) => state.projectFile.project);
  const canvas = useAppStore(getActiveCanvas);
  const setQuery = useAppStore((state) => state.setSearchQuery);
  const setScope = useAppStore((state) => state.setSearchScope);
  const close = useAppStore((state) => state.closeSearch);
  const switchCanvas = useAppStore((state) => state.switchCanvas);
  const focusPlacement = useAppStore((state) => state.focusPlacement);
  const focusArea = useAppStore((state) => state.focusArea);
  const setSelection = useAppStore((state) => state.setSelection);
  const setActiveTag = useAppStore((state) => state.setActiveTag);

  useEffect(() => {
    if (mode) requestAnimationFrame(() => inputRef.current?.focus());
  }, [mode]);

  const results = useMemo(() => {
    if (!mode) return [];
    const needle = query.trim().replace(/^#/, "").toLocaleLowerCase();
    const matches = (...values: string[]) => !needle || values.some((value) => value.toLocaleLowerCase().includes(needle));
    const items: SearchResult[] = [];
    const targetCanvases = mode === "canvas" ? canvas ? [canvas] : [] : project.canvases;
    for (const result of searchCardPlacements(project.cards, targetCanvases, query)) {
      items.push({
        key: `placement-${result.placementId}`,
        type: "CARD",
        title: result.title,
        detail: [mode === "project" ? result.canvasTitle : "", ...result.tags.map((tag) => `#${tag}`)]
          .filter(Boolean).join(" · "),
        color: result.color,
        muted: result.muted,
        run: () => focusPlacement(result.canvasId, result.placementId),
      });
    }
    if (mode === "project") {
      for (const card of unplacedCards(project.cards, project.canvases)) {
        if (!matches(card.title, ...card.tags)) continue;
        items.push({
          key: `unplaced-${card.id}`,
          type: "CARD",
          title: card.title || "Untitled Card",
          detail: ["Unplaced", ...card.tags.map((tag) => `#${tag}`)].join(" · "),
          color: card.color,
          muted: card.muted,
          run: () => { setSelection({ type: "card", id: card.id }); close(); },
        });
      }
      for (const target of project.canvases) {
        if (matches(target.title)) {
          items.push({ key: `canvas-${target.id}`, type: "CANVAS", title: target.title, run: () => { switchCanvas(target.id); close(); } });
        }
        for (const area of target.areas) {
          if (matches(area.title, ...area.tags)) {
            items.push({ key: `area-${area.id}`, type: "AREA", title: area.title, detail: target.title, color: area.color, run: () => focusArea(target.id, area.id) });
          }
        }
      }
      for (const tag of project.tags) {
        if (matches(tag)) items.push({ key: `tag-${tag}`, type: "TAG", title: `#${tag}`, run: () => { setActiveTag(tag); close(); } });
      }
    }
    return items.slice(0, 40);
  }, [canvas, close, focusArea, focusPlacement, mode, project, query, setActiveTag, setSelection, switchCanvas]);

  if (!mode) return null;

  return (
    <div className="palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="command-palette" role="dialog" aria-label={mode === "project" ? "Project search" : "Canvas search"}>
        <div className="palette-input-row">
          <span>⌘F</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
              if (event.key === "Enter" && results[0]) results[0].run();
            }}
            placeholder={mode === "project" ? "Project全体を検索" : "現在のCanvasを検索"}
          />
        </div>
        <div className="palette-scope" role="group" aria-label="Search scope">
          <button className={mode === "canvas" ? "is-active" : ""} type="button" aria-pressed={mode === "canvas"} onClick={() => setScope("canvas")}>Current Canvas</button>
          <button className={mode === "project" ? "is-active" : ""} type="button" aria-pressed={mode === "project"} onClick={() => setScope("project")}>All Canvases</button>
        </div>
        <div className="palette-results">
          {results.length ? results.map((result) => (
            <button key={result.key} type="button" className={result.muted ? "is-muted" : ""} onClick={result.run}>
              <span>{result.type}</span>
              <strong>{result.color && result.color !== "default" ? <i className="card-color-dot" style={{ backgroundColor: itemColorValue(result.color) }} /> : null}<span>{result.title}</span></strong>
              <small>{result.detail}</small>
            </button>
          )) : <p>一致する項目がありません。</p>}
        </div>
      </section>
    </div>
  );
}
