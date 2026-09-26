import type { Position } from "../../domain/models";

export function createCardOnBackgroundDoubleClick(
  event: { target: EventTarget | null; clientX: number; clientY: number; preventDefault: () => void },
  screenToFlowPosition: (position: Position) => Position,
  createCardAt: (position: Position) => void,
): void {
  if (!(event.target instanceof Element)) return;
  const pane = event.target.closest(".react-flow__pane");
  if (!pane || (event.target !== pane && !event.target.closest(".react-flow__background"))) return;

  event.preventDefault();
  createCardAt(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
}
