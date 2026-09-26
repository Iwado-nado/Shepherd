import { useEffect, useMemo, useState } from "react";
import { normalizeTags, tagsFromInput, useAppStore } from "../../store/appStore";
import { deleteSelectionByKey } from "../canvas/selectionCommands";
import { cardDestinations } from "../../domain/cardPlacements";
import { ColorPresets } from "./ColorPresets";
import { TagInput } from "./TagInput";

interface CardDraft {
  cardId: string | null;
  title: string;
  body: string;
  tags: string[];
  tagInput: string;
}

interface AreaDraft {
  areaId: string | null;
  title: string;
  tags: string[];
  tagInput: string;
}

export function Inspector() {
  const selection = useAppStore((state) => state.selection);
  const updateCard = useAppStore((state) => state.updateCard);
  const updateArea = useAppStore((state) => state.updateArea);
  const toggleArea = useAppStore((state) => state.toggleArea);
  const updateEdgeLabel = useAppStore((state) => state.updateEdgeLabel);
  const updateEdgeDirection = useAppStore((state) => state.updateEdgeDirection);
  const updateEdgeLineStyle = useAppStore((state) => state.updateEdgeLineStyle);
  const deleteSelection = useAppStore((state) => state.deleteSelection);
  const focusPlacement = useAppStore((state) => state.focusPlacement);
  const placeExistingCard = useAppStore((state) => state.placeExistingCard);
  const openStoryEditor = useAppStore((state) => state.openStoryEditor);
  const createArea = useAppStore((state) => state.createArea);
  const updateSelectedCardsColor = useAppStore((state) => state.updateSelectedCardsColor);
  const toggleStartForPlacement = useAppStore((state) => state.toggleStartForPlacement);
  const toggleBookmarkForPlacement = useAppStore((state) => state.toggleBookmarkForPlacement);
  const start = useAppStore((state) => state.projectFile.project.start);
  const bookmarks = useAppStore((state) => state.projectFile.project.bookmarks);
  const cards = useAppStore((state) => state.projectFile.project.cards);
  const canvases = useAppStore((state) => state.projectFile.project.canvases);
  const activeCanvasId = useAppStore((state) => state.projectFile.workspace.lastOpenedCanvasId);

  const placementIds = selection?.type === "placements" ? selection.ids : [];
  const placement = useAppStore((state) => placementIds.length === 1
    ? state.projectFile.project.canvases
        .flatMap((canvas) => canvas.placements)
        .find((item) => item.id === placementIds[0])
    : undefined);
  const selectedCardId = selection?.type === "card" ? selection.id : placement?.cardId;
  const card = useAppStore((state) => selectedCardId
    ? state.projectFile.project.cards.find((item) => item.id === selectedCardId)
    : undefined);
  const edge = useAppStore((state) => selection?.type === "edge"
    ? state.projectFile.project.canvases.flatMap((canvas) => canvas.edges).find((item) => item.id === selection.id)
    : undefined);
  const area = useAppStore((state) => selection?.type === "area"
    ? state.projectFile.project.canvases.flatMap((canvas) => canvas.areas).find((item) => item.id === selection.id)
    : undefined);
  const areaCardCount = useAppStore((state) => area
    ? state.projectFile.project.canvases
        .flatMap((canvas) => canvas.placements)
        .filter((item) => item.areaId === area.id).length
    : 0);
  const usedIn = useMemo(() => selectedCardId
    ? cardDestinations(selectedCardId, canvases)
    : [], [canvases, selectedCardId]);
  const activePlacement = usedIn.find((item) => item.canvasId === activeCanvasId);
  const targetPlacementId = placement?.canvasId === activeCanvasId ? placement.id : activePlacement?.placementId;

  const [cardDraft, setCardDraft] = useState<CardDraft>({ cardId: null, title: "", body: "", tags: [], tagInput: "" });
  const [areaDraft, setAreaDraft] = useState<AreaDraft>({ areaId: null, title: "", tags: [], tagInput: "" });
  const [edgeLabel, setEdgeLabel] = useState("");

  useEffect(() => {
    if (card) setCardDraft((draft) => ({
      cardId: card.id,
      title: card.title,
      body: card.body,
      tags: [...card.tags],
      tagInput: draft.cardId === card.id ? draft.tagInput : "",
    }));
  }, [card]);

  useEffect(() => {
    if (!card || cardDraft.cardId !== card.id) return;
    if (cardDraft.title === card.title && cardDraft.body === card.body && cardDraft.tags.join("\0") === card.tags.join("\0")) return;
    const timer = window.setTimeout(() => {
      updateCard(card.id, { title: cardDraft.title, body: cardDraft.body, tags: cardDraft.tags });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [card, cardDraft, updateCard]);

  useEffect(() => {
    if (area) setAreaDraft((draft) => ({
      areaId: area.id,
      title: area.title,
      tags: [...area.tags],
      tagInput: draft.areaId === area.id ? draft.tagInput : "",
    }));
  }, [area]);

  useEffect(() => {
    if (!area || areaDraft.areaId !== area.id) return;
    if (areaDraft.title === area.title && areaDraft.tags.join("\0") === area.tags.join("\0")) return;
    const timer = window.setTimeout(() => {
      updateArea(area.id, { title: areaDraft.title, tags: areaDraft.tags });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [area, areaDraft, updateArea]);

  useEffect(() => {
    if (edge) setEdgeLabel(edge.label);
  }, [edge]);

  if (placementIds.length > 1) {
    const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId);
    const selectedIds = new Set(placementIds);
    const selectedCards = activeCanvas?.placements
      .filter((item) => selectedIds.has(item.id))
      .flatMap((item) => cards.filter((card) => card.id === item.cardId)) ?? [];
    const color = selectedCards.length && selectedCards.every((card) => card.color === selectedCards[0].color)
      ? selectedCards[0].color : null;
    return (
      <aside className="inspector inspector-empty">
        <div className="panel-heading"><span>EDITOR</span><strong>Selection</strong></div>
        <div className="selection-count"><strong>{placementIds.length}</strong><span>cards selected</span></div>
        <p>ドラッグでまとめて移動できます。Areaを作成すると選択中のCardが所属します。</p>
        <button className="panel-button" type="button" onClick={createArea}>選択Cardを囲むAreaを作成</button>
        <div className="field-label">COLOR{color === null ? " · Mixed" : ""}</div>
        <ColorPresets label="Selected cards" value={color} onChange={updateSelectedCardsColor} />
        <button className="danger-button" type="button" onClick={deleteSelection}>Canvasから除去</button>
      </aside>
    );
  }

  if (card) {
    const commitCard = (tags = normalizeTags([...cardDraft.tags, ...tagsFromInput(cardDraft.tagInput)])) => {
      updateCard(card.id, { title: cardDraft.title, body: cardDraft.body, tags });
      setCardDraft((draft) => ({ ...draft, tags, tagInput: "" }));
    };
    return (
      <aside className="inspector">
        <div className="panel-heading card-inspector-heading">
          <div><span>EDITOR</span><strong>Card</strong></div>
          <div className="card-header-actions">
            <button
              type="button"
              disabled={!targetPlacementId}
              aria-label="STARTを設定・解除"
              aria-pressed={Boolean(targetPlacementId && start && start.canvasId === activeCanvasId && start.placementId === targetPlacementId)}
              title={targetPlacementId ? "STARTを設定・解除" : "まず現在のCanvasに配置してください"}
              onClick={() => { if (targetPlacementId) toggleStartForPlacement(targetPlacementId); }}
            >★</button>
            <button
              type="button"
              disabled={!targetPlacementId}
              aria-label="Bookmarkを追加・解除"
              aria-pressed={Boolean(targetPlacementId && bookmarks.some((bookmark) => bookmark.canvasId === activeCanvasId && bookmark.targetPlacementId === targetPlacementId))}
              title={targetPlacementId ? "Bookmarkを追加・解除" : "まず現在のCanvasに配置してください"}
              onClick={() => { if (targetPlacementId) toggleBookmarkForPlacement(targetPlacementId); }}
            ><svg viewBox="0 0 12 14" aria-hidden="true"><path d="M2 1.5h8v11l-4-3-4 3z" /></svg></button>
          </div>
        </div>
        <label className="field-label" htmlFor="card-title">TITLE</label>
        <input
          id="card-title"
          value={cardDraft.title}
          onChange={(event) => setCardDraft((draft) => ({ ...draft, title: event.target.value }))}
          onBlur={() => commitCard()}
        />
        <label className="field-label" htmlFor="card-tags">TAGS</label>
        <TagInput
          id="card-tags"
          label="Card tags"
          tags={cardDraft.tags}
          input={cardDraft.tagInput}
          commitEmptyOnBlur
          onTagsChange={(tags) => setCardDraft((draft) => ({ ...draft, tags }))}
          onInputChange={(tagInput) => setCardDraft((draft) => ({ ...draft, tagInput }))}
          onCommit={commitCard}
          placeholder="Tagを入力"
        />
        <label className="field-label" htmlFor="card-body">BODY</label>
        <textarea
          id="card-body"
          value={cardDraft.body}
          onChange={(event) => setCardDraft((draft) => ({ ...draft, body: event.target.value }))}
          onBlur={() => commitCard()}
          placeholder="本文、設定、メモなど"
        />
        <div className="field-label">COLOR</div>
        <ColorPresets label="Card" value={card.color} onChange={(color) => updateCard(card.id, { color })} />
        <button className="panel-button story-editor-open" type="button" onClick={() => {
          commitCard();
          openStoryEditor(card.id);
        }}>Storyを大きく編集</button>
        <div className="used-in-section">
          <div className="field-label"><span>USED IN</span><small>{usedIn.length}</small></div>
          {usedIn.length ? usedIn.map((item) => (
            <button
              type="button"
              key={item.placementId}
              className={item.placementId === placement?.id ? "is-current" : ""}
              onClick={() => focusPlacement(item.canvasId, item.placementId)}
            >
              <strong>{item.canvasTitle}</strong>
              <small>{item.areaTitle ?? "No Area"}</small>
            </button>
          )) : <p>どのCanvasにも配置されていません。</p>}
        </div>
        {!activePlacement ? (
          <button className="panel-button" type="button" onClick={() => placeExistingCard(card.id)}>現在のCanvasへ配置</button>
        ) : selection?.type === "card" ? (
          <button className="panel-button" type="button" onClick={() => focusPlacement(activeCanvasId, activePlacement.placementId)}>現在の配置を表示</button>
        ) : null}
        {placement ? <button className="danger-button" type="button" onClick={deleteSelection}>Canvasから除去</button> : null}
        <button className="danger-button danger-strong" type="button" onClick={() => void deleteSelectionByKey("Delete")}>Projectから完全削除</button>
      </aside>
    );
  }

  if (area) {
    const commitArea = (tags = normalizeTags([...areaDraft.tags, ...tagsFromInput(areaDraft.tagInput)])) => {
      updateArea(area.id, { title: areaDraft.title, tags });
      setAreaDraft((draft) => ({ ...draft, tags, tagInput: "" }));
    };
    return (
      <aside className="inspector">
        <div className="panel-heading"><span>EDITOR</span><strong>Area</strong></div>
        <label className="field-label" htmlFor="area-title">NAME</label>
        <input id="area-title" value={areaDraft.title} onChange={(event) => setAreaDraft((draft) => ({ ...draft, title: event.target.value }))} onBlur={() => commitArea()} />
        <div className="field-label">COLOR</div>
        <ColorPresets label="Area" value={area.color} onChange={(color) => updateArea(area.id, { color })} />
        <label className="field-label" htmlFor="area-tags">TAGS</label>
        <TagInput
          id="area-tags"
          label="Area tags"
          tags={areaDraft.tags}
          input={areaDraft.tagInput}
          commitEmptyOnBlur
          onTagsChange={(tags) => setAreaDraft((draft) => ({ ...draft, tags }))}
          onInputChange={(tagInput) => setAreaDraft((draft) => ({ ...draft, tagInput }))}
          onCommit={commitArea}
          placeholder="Tagを入力"
        />
        <div className="inspector-meta"><span>Members</span><code>{areaCardCount} cards</code></div>
        <button type="button" className="panel-button" onClick={() => toggleArea(area.id)}>{area.collapsed ? "Areaを展開" : "Areaを折りたたむ"}</button>
        <button className="danger-button" type="button" onClick={deleteSelection}>Areaを削除</button>
      </aside>
    );
  }

  if (edge) {
    return (
      <aside className="inspector">
        <div className="panel-heading"><span>EDITOR</span><strong>Edge</strong></div>
        <label className="field-label" htmlFor="edge-label">LABEL</label>
        <input id="edge-label" value={edgeLabel} onChange={(event) => setEdgeLabel(event.target.value)} onBlur={() => updateEdgeLabel(edge.id, edgeLabel)} placeholder="成功、3日後、敵対…" />
        <div className="field-label">DIRECTION</div>
        <div className="segmented-control" role="group" aria-label="Edge direction">
          <button type="button" className={edge.direction === "directed" ? "is-active" : ""} aria-pressed={edge.direction === "directed"} onClick={() => updateEdgeDirection(edge.id, "directed")}>A → B</button>
          <button type="button" className={edge.direction === "undirected" ? "is-active" : ""} aria-pressed={edge.direction === "undirected"} onClick={() => updateEdgeDirection(edge.id, "undirected")}>A ↔ B</button>
        </div>
        <div className="field-label">LINE STYLE</div>
        <div className="segmented-control" role="group" aria-label="Edge line style">
          {(["solid", "dashed", "dotted"] as const).map((lineStyle) => (
            <button type="button" key={lineStyle} className={edge.lineStyle === lineStyle ? "is-active" : ""} aria-pressed={edge.lineStyle === lineStyle} onClick={() => updateEdgeLineStyle(edge.id, lineStyle)}>
              {lineStyle[0].toUpperCase() + lineStyle.slice(1)}
            </button>
          ))}
        </div>
        <button className="danger-button" type="button" onClick={deleteSelection}>Edgeを削除</button>
      </aside>
    );
  }

  return (
    <aside className="inspector inspector-empty">
      <div className="panel-heading"><span>EDITOR</span><strong>Nothing selected</strong></div>
      <p>Card、Area、Edgeを選択すると、ここで内容を編集できます。</p>
    </aside>
  );
}
