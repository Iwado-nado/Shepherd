import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CardFlowNode } from "./flowAdapter";
import { itemColorValue } from "../colorPresets";

const sides = [
  ["top", Position.Top],
  ["right", Position.Right],
  ["bottom", Position.Bottom],
  ["left", Position.Left],
] as const;

export const CardNode = memo(function CardNode({ data, selected }: NodeProps<CardFlowNode>) {
  const { density } = data;
  return (
    <article
      className={`card-node is-${density.tier}${data.color !== "default" ? " has-color" : ""}${data.muted ? " is-muted" : ""}${selected ? " is-selected" : ""}`}
      style={{ "--item-color": itemColorValue(data.color) } as React.CSSProperties}
    >
      {sides.flatMap(([name, position]) => [
        <Handle
          className="card-handle"
          id={name}
          key={name}
          position={position}
          type="source"
        />,
      ])}
      <div className="card-node-content">
        <div className="card-node-kicker">
          {data.isStart ? <span className="card-node-status" role="img" aria-label="START" title="START">★</span> : null}
          {data.isBookmarked ? (
            <span className="card-node-status" role="img" aria-label="Bookmark" title="Bookmark">
              <svg viewBox="0 0 12 14" aria-hidden="true"><path d="M2 1.5h8v11l-4-3-4 3z" /></svg>
            </span>
          ) : null}
          <span>CARD</span>
        </div>
        <h2 style={{ fontSize: density.titleFontSize }}>{data.title || "Untitled Card"}</h2>
        {density.maxTags > 0 && data.tags.length ? (
          <div className="card-node-tags">
            {data.tags.slice(0, density.maxTags).map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        ) : null}
        {density.detailLines > 0 ? (
          <p style={{ fontSize: density.detailFontSize, WebkitLineClamp: density.detailLines }}>
            {data.bodyPreview || "本文を追加してください。"}
          </p>
        ) : null}
      </div>
    </article>
  );
});
