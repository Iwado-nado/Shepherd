import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CardFlowNode } from "./flowAdapter";

const sides = [
  ["top", Position.Top],
  ["right", Position.Right],
  ["bottom", Position.Bottom],
  ["left", Position.Left],
] as const;

export const CardNode = memo(function CardNode({ data, selected }: NodeProps<CardFlowNode>) {
  return (
    <article className={`card-node${data.displayMode === "compact" ? " is-compact" : ""}${selected ? " is-selected" : ""}`}>
      {sides.flatMap(([name, position]) => [
        <Handle
          className="card-handle"
          id={name}
          key={name}
          position={position}
          type="source"
        />,
      ])}
      <div className="card-node-kicker">CARD</div>
      <h2>{data.title || "Untitled Card"}</h2>
      {data.displayMode === "standard" && data.tags.length ? (
        <div className="card-node-tags">
          {data.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
      ) : null}
      {data.displayMode === "standard" ? <p>{data.bodyPreview || "本文を追加してください。"}</p> : null}
    </article>
  );
});
