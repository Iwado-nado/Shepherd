import { useEffect, useMemo, useRef } from "react";
import { getActiveCanvas, useAppStore } from "../../store/appStore";

interface SearchResult {
  key: string;
  type: "CARD" | "CANVAS" | "AREA" | "TAG";
  title: string;
  detail?: string;
  run: () => void;
}

export function CommandPalette() {
  const inputRef = useRef<HTMLInputElement>(null);
  const mode = useAppStore((state) => state.searchMode);
  const query = useAppStore((state) => state.searchQuery);
  const project = useAppStore((state) => state.projectFile.project);
  const canvas = useAppStore(getActiveCanvas);
  const setQuery = useAppStore((state) => state.setSearchQuery);
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
    const targetCanvases = mode === "canvas" && canvas ? [canvas] : project.canvases;
    const placementByCard = new Map<string, { canvasId: string; placementId: string }>();
    for (const target of targetCanvases) {
      for (const placement of target.placements) {
        if (!placementByCard.has(placement.cardId)) {
          placementByCard.set(placement.cardId, { canvasId: target.id, placementId: placement.id });
        }
      }
    }
    for (const card of project.cards) {
      if (!matches(card.title, card.body, ...card.tags)) continue;
      const target = placementByCard.get(card.id);
      if (mode === "canvas" && !target) continue;
      items.push({
        key: `card-${card.id}`,
        type: "CARD",
        title: card.title || "Untitled Card",
        detail: card.tags.map((tag) => `#${tag}`).join(" "),
        run: () => target ? focusPlacement(target.canvasId, target.placementId) : (setSelection({ type: "card", id: card.id }), close()),
      });
    }
    for (const target of targetCanvases) {
      if (mode === "project" && matches(target.title)) {
        items.push({ key: `canvas-${target.id}`, type: "CANVAS", title: target.title, run: () => { switchCanvas(target.id); close(); } });
      }
      for (const area of target.areas) {
        if (matches(area.title, ...area.tags)) {
          items.push({ key: `area-${area.id}`, type: "AREA", title: area.title, detail: target.title, run: () => focusArea(target.id, area.id) });
        }
      }
    }
    if (mode === "project") {
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
          <span>{mode === "project" ? "⌘K" : "⌘F"}</span>
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
        <div className="palette-results">
          {results.length ? results.map((result) => (
            <button key={result.key} type="button" onClick={result.run}>
              <span>{result.type}</span>
              <strong>{result.title}</strong>
              <small>{result.detail}</small>
            </button>
          )) : <p>一致する項目がありません。</p>}
        </div>
      </section>
    </div>
  );
}
