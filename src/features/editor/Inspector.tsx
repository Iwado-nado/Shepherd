import { useEffect, useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { normalizeTags, useAppStore } from "../../store/appStore";

interface CardDraft {
  title: string;
  body: string;
  tags: string;
}

interface AreaDraft {
  title: string;
  color: string;
  tags: string;
}

function tagsFromInput(value: string): string[] {
  return normalizeTags(value.split(/[#,，\n]+/));
}

export function Inspector() {
  const selection = useAppStore((state) => state.selection);
  const updateCard = useAppStore((state) => state.updateCard);
  const deleteCard = useAppStore((state) => state.deleteCard);
  const updateArea = useAppStore((state) => state.updateArea);
  const toggleArea = useAppStore((state) => state.toggleArea);
  const updateEdgeLabel = useAppStore((state) => state.updateEdgeLabel);
  const deleteSelection = useAppStore((state) => state.deleteSelection);
  const focusPlacement = useAppStore((state) => state.focusPlacement);
  const placeExistingCard = useAppStore((state) => state.placeExistingCard);
  const setSaveState = useAppStore((state) => state.setSaveState);
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
  const cardPlacementCount = useAppStore((state) => selectedCardId
    ? state.projectFile.project.canvases.reduce(
        (count, canvas) => count + canvas.placements.filter((item) => item.cardId === selectedCardId).length,
        0,
      )
    : 0);
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
    ? canvases.flatMap((canvas) => canvas.placements
        .filter((item) => item.cardId === selectedCardId)
        .map((item) => ({
          canvasId: canvas.id,
          canvasTitle: canvas.title,
          placementId: item.id,
          areaTitle: canvas.areas.find((areaItem) => areaItem.id === item.areaId)?.title,
        })))
    : [], [canvases, selectedCardId]);
  const activePlacement = usedIn.find((item) => item.canvasId === activeCanvasId);

  const [cardDraft, setCardDraft] = useState<CardDraft>({ title: "", body: "", tags: "" });
  const [areaDraft, setAreaDraft] = useState<AreaDraft>({ title: "", color: "#7f9450", tags: "" });
  const [edgeLabel, setEdgeLabel] = useState("");

  useEffect(() => {
    if (card) setCardDraft({ title: card.title, body: card.body, tags: card.tags.join(", ") });
  }, [card]);

  useEffect(() => {
    if (!card) return;
    const tags = tagsFromInput(cardDraft.tags);
    if (cardDraft.title === card.title && cardDraft.body === card.body && tags.join("\0") === card.tags.join("\0")) return;
    const timer = window.setTimeout(() => {
      updateCard(card.id, { title: cardDraft.title, body: cardDraft.body, tags });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [card, cardDraft, updateCard]);

  useEffect(() => {
    if (area) setAreaDraft({ title: area.title, color: area.color, tags: area.tags.join(", ") });
  }, [area]);

  useEffect(() => {
    if (!area) return;
    const tags = tagsFromInput(areaDraft.tags);
    if (areaDraft.title === area.title && areaDraft.color === area.color && tags.join("\0") === area.tags.join("\0")) return;
    const timer = window.setTimeout(() => {
      updateArea(area.id, { title: areaDraft.title, color: areaDraft.color, tags });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [area, areaDraft, updateArea]);

  useEffect(() => {
    if (edge) setEdgeLabel(edge.label);
  }, [edge]);

  if (placementIds.length > 1) {
    return (
      <aside className="inspector inspector-empty">
        <div className="panel-heading"><span>EDITOR</span><strong>Selection</strong></div>
        <div className="selection-count"><strong>{placementIds.length}</strong><span>cards selected</span></div>
        <p>ドラッグでまとめて移動できます。Areaを作成すると選択中のCardが所属します。</p>
        <button className="danger-button" type="button" onClick={deleteSelection}>Canvasから除去</button>
      </aside>
    );
  }

  if (card) {
    const commitCard = () => updateCard(card.id, {
      title: cardDraft.title,
      body: cardDraft.body,
      tags: tagsFromInput(cardDraft.tags),
    });
    const confirmDelete = async () => {
      try {
        const confirmed = await confirm(
          `このカードは${cardPlacementCount}個のCanvas配置とともに完全削除されます。続行しますか？`,
          { title: "Shepherd", kind: "warning" },
        );
        if (confirmed) deleteCard(card.id);
      } catch (error) {
        setSaveState("error", error instanceof Error ? error.message : String(error));
      }
    };
    return (
      <aside className="inspector">
        <div className="panel-heading"><span>EDITOR</span><strong>Card</strong></div>
        <label className="field-label" htmlFor="card-title">TITLE</label>
        <input
          id="card-title"
          value={cardDraft.title}
          onChange={(event) => setCardDraft((draft) => ({ ...draft, title: event.target.value }))}
          onBlur={commitCard}
        />
        <label className="field-label" htmlFor="card-tags">TAGS</label>
        <input
          id="card-tags"
          value={cardDraft.tags}
          onChange={(event) => setCardDraft((draft) => ({ ...draft, tags: event.target.value }))}
          onBlur={commitCard}
          placeholder="Alice, 王都, 伏線"
        />
        <label className="field-label" htmlFor="card-body">BODY</label>
        <textarea
          id="card-body"
          value={cardDraft.body}
          onChange={(event) => setCardDraft((draft) => ({ ...draft, body: event.target.value }))}
          onBlur={commitCard}
          placeholder="本文、設定、メモなど"
        />
        <div className="inspector-meta">
          <span>{placement ? "Position" : "Project Card"}</span>
          <code>{placement ? `${Math.round(placement.position.x)}, ${Math.round(placement.position.y)}` : `${cardPlacementCount} placements`}</code>
        </div>
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
        <button className="danger-button danger-strong" type="button" onClick={() => void confirmDelete()}>Projectから完全削除</button>
      </aside>
    );
  }

  if (area) {
    const commitArea = () => updateArea(area.id, {
      title: areaDraft.title,
      color: areaDraft.color,
      tags: tagsFromInput(areaDraft.tags),
    });
    return (
      <aside className="inspector">
        <div className="panel-heading"><span>EDITOR</span><strong>Area</strong></div>
        <label className="field-label" htmlFor="area-title">NAME</label>
        <input id="area-title" value={areaDraft.title} onChange={(event) => setAreaDraft((draft) => ({ ...draft, title: event.target.value }))} onBlur={commitArea} />
        <label className="field-label" htmlFor="area-color">COLOR</label>
        <input className="color-input" id="area-color" type="color" value={areaDraft.color} onChange={(event) => setAreaDraft((draft) => ({ ...draft, color: event.target.value }))} onBlur={commitArea} />
        <label className="field-label" htmlFor="area-tags">TAGS</label>
        <input id="area-tags" value={areaDraft.tags} onChange={(event) => setAreaDraft((draft) => ({ ...draft, tags: event.target.value }))} onBlur={commitArea} placeholder="序盤, 王都" />
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
        <div className="inspector-meta"><span>Direction</span><code>{edge.direction}</code></div>
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
