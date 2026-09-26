import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "../src/domain/project";
import { exportBounds, exportFrame } from "../src/features/export/exportGeometry";
import { useAppStore } from "../src/store/appStore";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  save: vi.fn(),
  toPng: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: mocks.save }));
vi.mock("html-to-image", () => ({ toPng: mocks.toPng }));

import { exportCanvas } from "../src/features/export/exportCanvas";

describe("Full Canvas PNG export", () => {
  beforeEach(() => {
    useAppStore.getState().newProject("Export test");
    mocks.invoke.mockReset().mockResolvedValue(undefined);
    mocks.save.mockReset().mockResolvedValue("/tmp/full-canvas");
    mocks.toPng.mockReset().mockResolvedValue("data:image/png;base64,cG5n");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("computes Card and Area bounds with padding regardless of the current Pan/Zoom", () => {
    const canvas = createCanvas("Entire Canvas");
    canvas.placements.push(
      { id: "a", cardId: "card-a", canvasId: canvas.id, position: { x: -100, y: -20 }, size: { width: 300, height: 160 } },
      { id: "b", cardId: "card-b", canvasId: canvas.id, position: { x: 600, y: 400 }, size: { width: 264, height: 156 } },
    );
    canvas.edges.push({ id: "edge", canvasId: canvas.id, sourcePlacementId: "a", targetPlacementId: "b", label: "", direction: "directed", lineStyle: "solid" });
    canvas.areas.push({
      id: "area", canvasId: canvas.id, title: "Area", color: "#7f9450", tags: [],
      anchorX: 1200, anchorY: -300, collapsed: false,
    });

    expect(exportBounds(canvas, null, "canvas")).toEqual({ x: -100, y: -300, width: 1476, height: 856 });
    const frame = exportFrame(canvas, null, "canvas");
    expect(frame).toEqual({ width: 1572, height: 952, transform: "translate(148px, 348px) scale(1)" });
    canvas.viewport = { x: -1200, y: 800, zoom: 2.25 };
    expect(exportFrame(canvas, { type: "placements", ids: ["a"] }, "canvas")).toEqual(frame);
    expect(exportFrame(canvas, { type: "placements", ids: ["a"] }, "selection"))
      .toEqual({ width: 396, height: 256, transform: "translate(148px, 68px) scale(1)" });
  });

  it("exports the active Canvas at its full bounds to a chosen PNG path without changing the live viewport", async () => {
    useAppStore.getState().createCardAtCenter();
    useAppStore.getState().createCardAtCenter();
    const canvas = useAppStore.getState().projectFile.project.canvases[0];
    const [first, second] = canvas.placements;
    useAppStore.getState().movePlacements([
      { id: first.id, position: { x: -200, y: -100 } },
      { id: second.id, position: { x: 850, y: 600 } },
    ]);
    useAppStore.getState().createEdge(first.id, second.id);
    useAppStore.getState().setSelection({ type: "placements", ids: [first.id, second.id] });
    useAppStore.getState().createArea();
    useAppStore.getState().updateViewport(canvas.id, { x: 640, y: -350, zoom: 2 });
    useAppStore.getState().setSelection({ type: "placements", ids: [first.id] });
    const active = useAppStore.getState().projectFile.project.canvases[0];
    const expectedFrame = exportFrame(active, null, "canvas");
    expect(active.placements).toHaveLength(2);
    expect(active.edges).toHaveLength(1);
    expect(active.areas).toHaveLength(1);

    const classList = { add: vi.fn(), remove: vi.fn() };
    const viewport = { classList, style: { transform: "translate(640px, -350px) scale(2)" } };
    const stage = { clientWidth: 800, clientHeight: 600, querySelector: vi.fn(() => viewport) };
    vi.stubGlobal("document", { querySelector: vi.fn(() => stage) });
    vi.stubGlobal("window", { getComputedStyle: vi.fn(() => ({ backgroundColor: "rgb(231, 229, 225)" })) });

    await exportCanvas("png", "canvas");

    expect(mocks.save).toHaveBeenCalledWith({
      defaultPath: `${active.title}.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    expect(mocks.toPng).toHaveBeenCalledWith(viewport, expect.objectContaining({
      backgroundColor: "rgb(231, 229, 225)",
      width: expectedFrame?.width,
      height: expectedFrame?.height,
      style: expect.objectContaining({ transform: expectedFrame?.transform }),
    }));
    expect(mocks.invoke).toHaveBeenCalledWith("write_binary_file_atomic", {
      path: "/tmp/full-canvas.png",
      base64Data: "cG5n",
    });
    expect(classList.add).toHaveBeenCalledWith("is-exporting");
    expect(classList.remove).toHaveBeenCalledWith("is-exporting");
    expect(viewport.style.transform).toBe("translate(640px, -350px) scale(2)");
    expect(useAppStore.getState().projectFile.project.canvases[0].viewport).toEqual({ x: 640, y: -350, zoom: 2 });
  });

  it("does not open a save dialog for an empty Canvas", async () => {
    const viewport = { classList: { add: vi.fn(), remove: vi.fn() } };
    vi.stubGlobal("document", { querySelector: vi.fn(() => ({ querySelector: () => viewport })) });
    await expect(exportCanvas("png", "canvas")).rejects.toThrow(/empty/);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("exports only the active Canvas when another Canvas has distant content", async () => {
    useAppStore.getState().createCardAtCenter();
    const first = useAppStore.getState().projectFile.project.canvases[0];
    useAppStore.getState().movePlacements([{ id: first.placements[0].id, position: { x: 100000, y: 100000 } }]);
    useAppStore.getState().addCanvas();
    useAppStore.getState().createCardAtCenter();
    const current = useAppStore.getState().projectFile.project.canvases[1];
    const frame = exportFrame(current, null, "canvas");
    const viewport = { classList: { add: vi.fn(), remove: vi.fn() } };
    vi.stubGlobal("document", { querySelector: vi.fn(() => ({ querySelector: () => viewport })) });

    await exportCanvas("png", "canvas");

    expect(mocks.toPng).toHaveBeenCalledWith(viewport, expect.objectContaining({
      width: frame?.width,
      height: frame?.height,
    }));
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: `${current.title}.png` }));
  });
});
