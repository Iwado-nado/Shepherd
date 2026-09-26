import type { ShepherdFlowNode } from "./flowAdapter";

export function activateNodeByDoubleClick(
  node: ShepherdFlowNode,
  openStoryEditor: (cardId: string) => void,
  toggleArea: (areaId: string) => void,
): void {
  if (node.type === "card") openStoryEditor(node.data.cardId);
  else toggleArea(node.id);
}
