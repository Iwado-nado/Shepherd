import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { AreaFlowNode } from "./flowAdapter";
import { itemColorValue } from "../colorPresets";

export const AreaNode = memo(function AreaNode({ data, selected }: NodeProps<AreaFlowNode>) {
  return (
    <section
      className={`area-node${data.color !== "default" ? " has-color" : ""}${data.collapsed ? " is-collapsed" : ""}${selected ? " is-selected" : ""}`}
      style={{ "--item-color": itemColorValue(data.color) } as React.CSSProperties}
    >
      <div className="area-node-title">
        <span>{data.title || "Untitled Area"}</span>
        <small>{data.count} cards</small>
      </div>
      {!data.collapsed && data.tags.length ? (
        <div className="area-node-tags">
          {data.tags.map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
      ) : null}
    </section>
  );
});
