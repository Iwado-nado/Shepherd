import { useEffect, useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/appStore";
import { CARD_DRAG_TYPE } from "./dragTypes";
import { unplacedCards as findUnplacedCards } from "../../domain/cardPlacements";
import { itemColorValue } from "../colorPresets";
import { cardMatchesFilters, searchCardPlacements } from "../search/searchCardPlacements";
import type { Card } from "../../domain/models";
import { canvasTree } from "./canvasTree";

function TreeCard({ card, onClick, onDragStart }: {
  card: Card;
  onClick: () => void;
  onDragStart: (event: React.DragEvent) => void;
}) {
  return (
    <button className={`canvas-tree-card${card.muted ? " is-muted" : ""}`} type="button" draggable onClick={onClick} onDragStart={onDragStart}>
      {card.color !== "default" ? <i className="card-color-dot" style={{ backgroundColor: itemColorValue(card.color) }} /> : null}
      <span>{card.title || "Untitled Card"}</span>
    </button>
  );
}

export function CanvasSidebar() {
  const canvases = useAppStore((state) => state.projectFile.project.canvases);
  const cards = useAppStore((state) => state.projectFile.project.cards);
  const tags = useAppStore((state) => state.projectFile.project.tags);
  const activeCanvasId = useAppStore((state) => state.projectFile.workspace.lastOpenedCanvasId);
  const activeTag = useAppStore((state) => state.activeTag);
  const filterTags = useAppStore((state) => state.filterTags);
  const tagFilterMode = useAppStore((state) => state.tagFilterMode);
  const searchQuery = useAppStore((state) => state.sidebarSearchQuery);
  const searchScope = useAppStore((state) => state.sidebarSearchScope);
  const addCanvas = useAppStore((state) => state.addCanvas);
  const renameCanvas = useAppStore((state) => state.renameCanvas);
  const deleteCanvas = useAppStore((state) => state.deleteCanvas);
  const duplicateCanvas = useAppStore((state) => state.duplicateCanvas);
  const moveCanvas = useAppStore((state) => state.moveCanvas);
  const switchCanvas = useAppStore((state) => state.switchCanvas);
  const setSelection = useAppStore((state) => state.setSelection);
  const setActiveTag = useAppStore((state) => state.setActiveTag);
  const toggleFilterTag = useAppStore((state) => state.toggleFilterTag);
  const clearFilters = useAppStore((state) => state.clearFilters);
  const setTagFilterMode = useAppStore((state) => state.setTagFilterMode);
  const setSidebarSearchQuery = useAppStore((state) => state.setSidebarSearchQuery);
  const toggleSidebarSearchScope = useAppStore((state) => state.toggleSidebarSearchScope);
  const deleteTag = useAppStore((state) => state.deleteTag);
  const setSaveState = useAppStore((state) => state.setSaveState);
  const createUnplacedCard = useAppStore((state) => state.createUnplacedCard);
  const placeExistingCard = useAppStore((state) => state.placeExistingCard);
  const focusPlacement = useAppStore((state) => state.focusPlacement);
  const focusArea = useAppStore((state) => state.focusArea);
  const toggleArea = useAppStore((state) => state.toggleArea);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [expandedCanvasIds, setExpandedCanvasIds] = useState(() => new Set([activeCanvasId]));
  const [collapsedTreeAreaIds, setCollapsedTreeAreaIds] = useState<Set<string>>(() => new Set());
  const unplacedCards = findUnplacedCards(cards, canvases);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const effectiveTags = useMemo(
    () => [...new Set([...(activeTag ? [activeTag] : []), ...filterTags])],
    [activeTag, filterTags],
  );
  const scopeName = searchScope === "project" ? "プロジェクト全体" : "現在のCanvas";
  const searching = Boolean(searchQuery.trim());
  const matchesCard = (cardId: string, canvasId: string) => {
    const card = cardsById.get(cardId);
    return Boolean(card && (!searching || searchScope === "project" || canvasId === activeCanvasId) &&
      cardMatchesFilters(card, searchQuery, effectiveTags, tagFilterMode));
  };
  const results = useMemo(() => searching ? searchCardPlacements(
    cards, searchScope === "canvas" ? canvases.filter((canvas) => canvas.id === activeCanvasId) : canvases,
    searchQuery, effectiveTags, tagFilterMode,
  ) : [], [activeCanvasId, cards, canvases, effectiveTags, searchQuery, searchScope, searching, tagFilterMode]);
  const matchingUnplaced = unplacedCards.filter((card) =>
    (!searching || searchScope === "project") && cardMatchesFilters(card, searchQuery, effectiveTags, tagFilterMode));

  useEffect(() => {
    setExpandedCanvasIds((expanded) => new Set(expanded).add(activeCanvasId));
  }, [activeCanvasId]);

  const toggleExpandedCanvas = (canvasId: string) => setExpandedCanvasIds((expanded) => {
    const next = new Set(expanded);
    if (next.has(canvasId)) next.delete(canvasId);
    else next.add(canvasId);
    return next;
  });

  const toggleTreeArea = (areaId: string) => setCollapsedTreeAreaIds((collapsed) => {
    const next = new Set(collapsed);
    if (next.has(areaId)) next.delete(areaId);
    else next.add(areaId);
    return next;
  });

  const showPlacement = (canvasId: string, placementId: string) => {
    const canvas = useAppStore.getState().projectFile.project.canvases.find((item) => item.id === canvasId);
    const placement = canvas?.placements.find((item) => item.id === placementId);
    const area = canvas?.areas.find((item) => item.id === placement?.areaId);
    if (area?.collapsed) toggleArea(area.id);
    focusPlacement(canvasId, placementId);
  };

  const toggleTag = (tag: string) => {
    if (activeTag === tag) setActiveTag(null);
    if (filterTags.includes(tag) || activeTag !== tag) toggleFilterTag(tag);
  };

  const beginCardDrag = (event: React.DragEvent, cardId: string) => {
    event.dataTransfer.setData(CARD_DRAG_TYPE, cardId);
    event.dataTransfer.setData("text/plain", cardId);
    event.dataTransfer.effectAllowed = "copy";
  };

  const finishRename = () => {
    if (renamingId) renameCanvas(renamingId, draftName);
    setRenamingId(null);
  };

  const deleteProjectTag = async (tag: string) => {
    const cardCount = cards.filter((card) => card.tags.includes(tag)).length;
    const areaCount = canvases.reduce(
      (count, canvas) => count + canvas.areas.filter((area) => area.tags.includes(tag)).length,
      0,
    );
    try {
      if (cardCount + areaCount > 0) {
        const accepted = await confirm(
          `#${tag} は Card ${cardCount}件、Area ${areaCount}件で使用中です。Projectから削除しますか？`,
          { title: "Shepherd", kind: "warning" },
        );
        if (!accepted) return;
      }
      deleteTag(tag);
    } catch (error) {
      setSaveState("error", error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <aside className="canvas-sidebar">
      <div className="sidebar-search" role="search">
        <button
          className={`sidebar-search-scope${searchScope === "canvas" ? " is-current" : ""}`}
          type="button"
          title={`検索範囲: ${scopeName}（クリックで切替）`}
          aria-label={`検索範囲: ${scopeName}。クリックで切替`}
          onClick={toggleSidebarSearchScope}
        ><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m12.7 12.7 4.2 4.2" /></svg></button>
        <input
          id="sidebar-search"
          aria-label="Cardを検索"
          value={searchQuery}
          placeholder={searchScope === "canvas" ? "このCanvasを検索" : "すべてのCardを検索"}
          onChange={(event) => setSidebarSearchQuery(event.target.value)}
        />
        {searching ? <button className="sidebar-search-clear" type="button" aria-label="検索をクリア" onClick={() => setSidebarSearchQuery("")}>×</button> : null}
      </div>
      {searching ? (
        <div className="sidebar-search-results" aria-label="Card検索結果">
          {results.map((result) => (
            <button className={result.muted ? "is-muted" : ""} type="button" key={result.placementId} onClick={() => showPlacement(result.canvasId, result.placementId)}>
              {result.color !== "default" ? <i className="card-color-dot" style={{ backgroundColor: itemColorValue(result.color) }} /> : null}
              <span>{result.title}</span>
              {searchScope === "project" ? <small>{result.canvasTitle}</small> : null}
            </button>
          ))}
          {searchScope === "project" ? matchingUnplaced.map((card) => (
            <button className={card.muted ? "is-muted" : ""} type="button" key={`unplaced-${card.id}`} onClick={() => setSelection({ type: "card", id: card.id })}>
              {card.color !== "default" ? <i className="card-color-dot" style={{ backgroundColor: itemColorValue(card.color) }} /> : null}
              <span>{card.title || "Untitled Card"}</span><small>Unplaced</small>
            </button>
          )) : null}
          {!results.length && !(searchScope === "project" && matchingUnplaced.length) ? <p>一致するCardはありません。</p> : null}
        </div>
      ) : null}
      <div className="sidebar-scroll">
        <div className="sidebar-heading"><span>CANVASES</span><small>{String(canvases.length).padStart(2, "0")}</small></div>
        <div className="canvas-list">
          {canvases.map((canvas, index) => {
            const expanded = expandedCanvasIds.has(canvas.id);
            const tree = canvasTree(canvas, cards, (card) => matchesCard(card.id, canvas.id));
            return (
              <div className="canvas-tree-node" key={canvas.id}>
                <div className={`canvas-list-row${canvas.id === activeCanvasId ? " is-active" : ""}`}>
                  <button className="canvas-expand-button" type="button" aria-label={`${canvas.title}を${expanded ? "閉じる" : "開く"}`} aria-expanded={expanded} onClick={() => toggleExpandedCanvas(canvas.id)}>{expanded ? "▾" : "▸"}</button>
                  {renamingId === canvas.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={finishRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") finishRename();
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <button className="canvas-name-button" type="button" onClick={() => switchCanvas(canvas.id)} onDoubleClick={() => {
                      setRenamingId(canvas.id);
                      setDraftName(canvas.title);
                    }}>
                      <strong>{canvas.title}</strong>
                    </button>
                  )}
                  <button className="canvas-action-button" type="button" disabled={index === 0} title="上へ移動" onClick={() => moveCanvas(canvas.id, -1)}>↑</button>
                  <button className="canvas-action-button" type="button" disabled={index === canvases.length - 1} title="下へ移動" onClick={() => moveCanvas(canvas.id, 1)}>↓</button>
                  <button className="canvas-action-button" type="button" title="Canvasを複製" onClick={() => duplicateCanvas(canvas.id)}>⧉</button>
                  <button className="canvas-delete-button" type="button" disabled={canvases.length === 1} title="Canvasを削除" onClick={() => void confirm(
                    `「${canvas.title}」を削除しますか？Card本体はProjectに残ります。`,
                    { title: "Shepherd", kind: "warning" },
                  ).then((confirmed) => {
                    if (confirmed) deleteCanvas(canvas.id);
                  }).catch((error: unknown) => {
                    setSaveState("error", error instanceof Error ? error.message : String(error));
                  })}>×</button>
                </div>
                {expanded ? (
                  <div className="canvas-tree-children">
                    {tree.ungrouped.map(({ placement, card }) => (
                      <TreeCard key={placement.id} card={card} onClick={() => showPlacement(canvas.id, placement.id)} onDragStart={(event) => beginCardDrag(event, card.id)} />
                    ))}
                    {tree.areas.map(({ area, cards: members }) => {
                      const collapsed = collapsedTreeAreaIds.has(area.id);
                      return (
                        <div className="canvas-tree-area" key={area.id}>
                          <div className="canvas-tree-area-row">
                            <button className="canvas-tree-toggle" type="button" aria-label={`${area.title}を${collapsed ? "開く" : "閉じる"}`} aria-expanded={!collapsed} onClick={() => toggleTreeArea(area.id)}>{collapsed ? "▸" : "▾"}</button>
                            <button className="canvas-tree-area-button" type="button" onClick={() => focusArea(canvas.id, area.id)}>
                              {area.color !== "default" ? <i className="card-color-dot" style={{ backgroundColor: itemColorValue(area.color) }} /> : null}
                              <span>{area.title || "Untitled Area"}</span>
                            </button>
                          </div>
                          {!collapsed ? <div className="canvas-tree-area-children">{members.map(({ placement, card }) => (
                            <TreeCard key={placement.id} card={card} onClick={() => showPlacement(canvas.id, placement.id)} onDragStart={(event) => beginCardDrag(event, card.id)} />
                          ))}</div> : null}
                        </div>
                      );
                    })}
                    {!tree.ungrouped.length && tree.areas.length === 0 ? <p className="sidebar-empty">Cardはまだありません。</p> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <button className="add-canvas-button" type="button" onClick={addCanvas}><span>+</span> New Canvas</button>

        <div className="sidebar-heading section-heading"><span>UNPLACED</span><small>{String(unplacedCards.length).padStart(2, "0")}</small></div>
        <div className="unplaced-list">
          {matchingUnplaced.map((card) => (
            <div className="unplaced-row" key={card.id}>
              <button
                draggable
                className={card.muted ? "is-muted" : ""}
                type="button"
                onClick={() => setSelection({ type: "card", id: card.id })}
                onDragStart={(event) => beginCardDrag(event, card.id)}
              >
                <span>⋮⋮</span><strong>{card.color !== "default" ? <i className="card-color-dot" style={{ backgroundColor: itemColorValue(card.color) }} /> : null}<span>{card.title || "Untitled Card"}</span></strong>
              </button>
              <button className="place-card-button" type="button" aria-label={`${card.title || "Untitled Card"}を現在のCanvasへ配置`} title="現在のCanvasへ配置" onClick={() => placeExistingCard(card.id)}>＋</button>
            </div>
          ))}
          <button className="new-idea-button" type="button" onClick={createUnplacedCard}><span>+</span><strong>New Idea</strong></button>
        </div>
      </div>
      <section className="sidebar-tags" aria-label="Tag filters and management">
        <div className="sidebar-tags-heading"><span>TAGS</span><small>{String(tags.length).padStart(2, "0")}</small>
          {effectiveTags.length ? <button type="button" onClick={clearFilters}>Clear</button> : null}
        </div>
        <div className="sidebar-tag-mode" role="group" aria-label="Tag match mode">
          <button type="button" className={tagFilterMode === "any" ? "is-active" : ""} aria-pressed={tagFilterMode === "any"} onClick={() => setTagFilterMode("any")}>Any</button>
          <button type="button" className={tagFilterMode === "all" ? "is-active" : ""} aria-pressed={tagFilterMode === "all"} onClick={() => setTagFilterMode("all")}>All</button>
        </div>
        <div className="tag-list">
          {tags.map((tag) => (
            <div className="tag-list-item" key={tag}>
              <button className={effectiveTags.includes(tag) ? "is-active" : ""} type="button" aria-pressed={effectiveTags.includes(tag)} onClick={() => toggleTag(tag)}>#{tag}</button>
              <button className="tag-delete-button" type="button" title={`#${tag}をProjectから削除`} onClick={() => void deleteProjectTag(tag)}>×</button>
            </div>
          ))}
          {!tags.length ? <p className="sidebar-empty">Tagはまだありません。</p> : null}
        </div>
      </section>
    </aside>
  );
}
