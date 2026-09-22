import { useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/appStore";
import { CARD_DRAG_TYPE } from "./dragTypes";

export function CanvasSidebar() {
  const canvases = useAppStore((state) => state.projectFile.project.canvases);
  const cards = useAppStore((state) => state.projectFile.project.cards);
  const tags = useAppStore((state) => state.projectFile.project.tags);
  const activeCanvasId = useAppStore((state) => state.projectFile.workspace.lastOpenedCanvasId);
  const activeTag = useAppStore((state) => state.activeTag);
  const addCanvas = useAppStore((state) => state.addCanvas);
  const renameCanvas = useAppStore((state) => state.renameCanvas);
  const deleteCanvas = useAppStore((state) => state.deleteCanvas);
  const duplicateCanvas = useAppStore((state) => state.duplicateCanvas);
  const moveCanvas = useAppStore((state) => state.moveCanvas);
  const switchCanvas = useAppStore((state) => state.switchCanvas);
  const setSelection = useAppStore((state) => state.setSelection);
  const setActiveTag = useAppStore((state) => state.setActiveTag);
  const setSaveState = useAppStore((state) => state.setSaveState);
  const createUnplacedCard = useAppStore((state) => state.createUnplacedCard);
  const placeExistingCard = useAppStore((state) => state.placeExistingCard);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId);
  const activeCardIds = new Set(activeCanvas?.placements.map((placement) => placement.cardId));
  const unplacedCards = cards.filter((card) =>
    canvases.every((canvas) => canvas.placements.every((placement) => placement.cardId !== card.id)),
  );

  const beginCardDrag = (event: React.DragEvent, cardId: string) => {
    event.dataTransfer.setData(CARD_DRAG_TYPE, cardId);
    event.dataTransfer.setData("text/plain", cardId);
    event.dataTransfer.effectAllowed = "copy";
  };

  const finishRename = () => {
    if (renamingId) renameCanvas(renamingId, draftName);
    setRenamingId(null);
  };

  return (
    <aside className="canvas-sidebar">
      <div className="sidebar-scroll">
        <div className="sidebar-heading"><span>CANVASES</span><small>{String(canvases.length).padStart(2, "0")}</small></div>
        <div className="canvas-list">
          {canvases.map((canvas, index) => (
            <div className={`canvas-list-row${canvas.id === activeCanvasId ? " is-active" : ""}`} key={canvas.id}>
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
                <button
                  className="canvas-name-button"
                  type="button"
                  onClick={() => switchCanvas(canvas.id)}
                  onDoubleClick={() => {
                    setRenamingId(canvas.id);
                    setDraftName(canvas.title);
                  }}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{canvas.title}</strong>
                </button>
              )}
              <button className="canvas-action-button" type="button" disabled={index === 0} title="上へ移動" onClick={() => moveCanvas(canvas.id, -1)}>↑</button>
              <button className="canvas-action-button" type="button" disabled={index === canvases.length - 1} title="下へ移動" onClick={() => moveCanvas(canvas.id, 1)}>↓</button>
              <button className="canvas-action-button" type="button" title="Canvasを複製" onClick={() => duplicateCanvas(canvas.id)}>⧉</button>
              <button
                className="canvas-delete-button"
                type="button"
                disabled={canvases.length === 1}
                title="Canvasを削除"
                  onClick={() => void confirm(
                    `「${canvas.title}」を削除しますか？Card本体はProjectに残ります。`,
                    { title: "Shepherd", kind: "warning" },
                  ).then((confirmed) => {
                    if (confirmed) deleteCanvas(canvas.id);
                  }).catch((error: unknown) => {
                    setSaveState("error", error instanceof Error ? error.message : String(error));
                  })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button className="add-canvas-button" type="button" onClick={addCanvas}><span>+</span> New Canvas</button>

        <div className="sidebar-heading section-heading"><span>PROJECT CARDS</span><small>{String(cards.length).padStart(2, "0")}</small></div>
        <div className="project-card-list">
          {cards.length ? cards.map((card) => {
            const count = canvases.reduce(
              (total, canvas) => total + canvas.placements.filter((item) => item.cardId === card.id).length,
              0,
            );
            return (
              <div className="project-card-row" draggable key={card.id} onDragStart={(event) => beginCardDrag(event, card.id)}>
                <button className="project-card-name" type="button" onClick={() => setSelection({ type: "card", id: card.id })}>
                  <strong>{card.title || "Untitled Card"}</strong>
                  <small>{count || "unplaced"}</small>
                </button>
                <button
                  className="place-card-button"
                  type="button"
                  disabled={activeCardIds.has(card.id)}
                  title={activeCardIds.has(card.id) ? "このCanvasに配置済み" : "現在のCanvasへ配置"}
                  onClick={() => placeExistingCard(card.id)}
                >
                  {activeCardIds.has(card.id) ? "✓" : "+"}
                </button>
              </div>
            );
          }) : <p className="sidebar-empty">Cardはまだありません。</p>}
        </div>

        <div className="sidebar-heading section-heading"><span>UNPLACED</span><small>{String(unplacedCards.length).padStart(2, "0")}</small></div>
        <div className="unplaced-list">
          {unplacedCards.map((card) => (
            <button
              draggable
              key={card.id}
              type="button"
              onClick={() => setSelection({ type: "card", id: card.id })}
              onDragStart={(event) => beginCardDrag(event, card.id)}
            >
              <span>⋮⋮</span><strong>{card.title || "Untitled Card"}</strong>
            </button>
          ))}
          <button className="new-idea-button" type="button" onClick={createUnplacedCard}><span>+</span><strong>New Idea</strong></button>
        </div>

        <div className="sidebar-heading section-heading"><span>TAGS</span><small>{String(tags.length).padStart(2, "0")}</small></div>
        <div className="tag-list">
          {activeTag ? <button className="clear-tag" type="button" onClick={() => setActiveTag(null)}>すべて表示</button> : null}
          {tags.map((tag) => (
            <button className={activeTag === tag ? "is-active" : ""} type="button" key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}>#{tag}</button>
          ))}
        </div>
      </div>
      <div className="sidebar-note"><span>MULTI-VIEW / PHASE 3</span><p>Cardを複数Canvasから参照し、異なる視点で再利用できます。</p></div>
    </aside>
  );
}
