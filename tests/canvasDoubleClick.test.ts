import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCardOnBackgroundDoubleClick } from "../src/features/canvas/canvasDoubleClick";
import { useAppStore } from "../src/store/appStore";

class FakeElement {
  constructor(readonly className: string, readonly parent: FakeElement | null = null) {}

  closest(selector: string): FakeElement | null {
    for (let current: FakeElement | null = this; current; current = current.parent) {
      if (current.className === selector.slice(1)) return current;
    }
    return null;
  }
}

function doubleClick(target: FakeElement, zoom = 1, pan = { x: 0, y: 0 }) {
  const preventDefault = vi.fn();
  const screenToFlowPosition = vi.fn(({ x, y }: { x: number; y: number }) => ({
    x: (x - pan.x) / zoom,
    y: (y - pan.y) / zoom,
  }));
  createCardOnBackgroundDoubleClick(
    { target: target as unknown as EventTarget, clientX: 400, clientY: 300, preventDefault },
    screenToFlowPosition,
    useAppStore.getState().createCardAt,
  );
  return { preventDefault, screenToFlowPosition };
}

describe("Canvas background double-click", () => {
  beforeEach(() => {
    vi.stubGlobal("Element", FakeElement);
    useAppStore.getState().newProject("Double-click test");
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    { name: "normal viewport", zoom: 1, pan: { x: 0, y: 0 }, position: { x: 268, y: 222 } },
    { name: "zoomed viewport", zoom: 2, pan: { x: 0, y: 0 }, position: { x: 68, y: 72 } },
    { name: "panned viewport", zoom: 1, pan: { x: 80, y: -40 }, position: { x: 188, y: 262 } },
  ])("creates one selected Card/Placement at the click under a $name", ({ zoom, pan, position }) => {
    const pane = new FakeElement("react-flow__pane");
    const { screenToFlowPosition } = doubleClick(pane, zoom, pan);
    let state = useAppStore.getState();
    const placement = state.projectFile.project.canvases[0].placements[0];

    expect(screenToFlowPosition).toHaveBeenCalledExactlyOnceWith({ x: 400, y: 300 });
    expect(state.projectFile.project.cards).toHaveLength(1);
    expect(state.projectFile.project.canvases[0].placements).toHaveLength(1);
    expect(placement.position).toEqual(position);
    expect(state.selection).toEqual({ type: "placements", ids: [placement.id] });
    expect(state.storyEditor).toBeNull();
    expect(state.past).toHaveLength(1);

    state.undo();
    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(0);
    state.redo();
    state = useAppStore.getState();
    expect(state.projectFile.project.canvases[0].placements[0].position).toEqual(position);
  });

  it("accepts the Background SVG and its child without creating twice", () => {
    const pane = new FakeElement("react-flow__pane");
    const background = new FakeElement("react-flow__background", pane);
    const pattern = new FakeElement("react-flow__background-pattern", background);

    expect(doubleClick(pattern).preventDefault).toHaveBeenCalledOnce();
    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(1);
  });

  it.each(["react-flow__node", "react-flow__edge", "react-flow__node-area", "react-flow__controls"])(
    "does not create a Card on an interactive %s",
    (className) => {
      const pane = new FakeElement("react-flow__pane");
      const interactive = new FakeElement(className, pane);
      const { preventDefault, screenToFlowPosition } = doubleClick(interactive);

      expect(preventDefault).not.toHaveBeenCalled();
      expect(screenToFlowPosition).not.toHaveBeenCalled();
      expect(useAppStore.getState().projectFile.project.cards).toHaveLength(0);
    },
  );
});
