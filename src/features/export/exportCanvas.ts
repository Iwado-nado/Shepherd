import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { getAreaBounds, type AreaBounds } from "../../domain/area";
import type { CanvasData, Placement } from "../../domain/models";
import { useAppStore, type Selection } from "../../store/appStore";

export type ExportFormat = "png" | "pdf";
export type ExportScope = "viewport" | "selection" | "area" | "canvas";

const PADDING = 48;
const MAX_DIMENSION = 12000;
const COLLAPSED_AREA_WIDTH = 220;
const COLLAPSED_AREA_HEIGHT = 52;

function placementsBounds(placements: Placement[]): AreaBounds | null {
  if (!placements.length) return null;
  const minX = Math.min(...placements.map((item) => item.position.x));
  const minY = Math.min(...placements.map((item) => item.position.y));
  const maxX = Math.max(...placements.map((item) => item.position.x + item.size.width));
  const maxY = Math.max(...placements.map((item) => item.position.y + item.size.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function combineBounds(bounds: AreaBounds[]): AreaBounds | null {
  if (!bounds.length) return null;
  const minX = Math.min(...bounds.map((item) => item.x));
  const minY = Math.min(...bounds.map((item) => item.y));
  const maxX = Math.max(...bounds.map((item) => item.x + item.width));
  const maxY = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function renderedAreaBounds(canvas: CanvasData, areaId: string): AreaBounds | null {
  const area = canvas.areas.find((item) => item.id === areaId);
  if (!area) return null;
  const bounds = getAreaBounds(area, canvas.placements);
  return area.collapsed
    ? { ...bounds, width: COLLAPSED_AREA_WIDTH, height: COLLAPSED_AREA_HEIGHT }
    : bounds;
}

function exportBounds(canvas: CanvasData, selection: Selection, scope: ExportScope): AreaBounds | null {
  if (scope === "canvas") {
    const items = canvas.areas.flatMap((area) => {
      const bounds = renderedAreaBounds(canvas, area.id);
      return bounds ? [bounds] : [];
    });
    const placements = placementsBounds(canvas.placements);
    return combineBounds(placements ? [placements, ...items] : items);
  }
  if (scope === "area") {
    if (selection?.type !== "area") return null;
    return renderedAreaBounds(canvas, selection.id);
  }
  if (scope === "selection") {
    if (selection?.type === "area") {
      return renderedAreaBounds(canvas, selection.id);
    }
    if (selection?.type !== "placements") return null;
    return placementsBounds(canvas.placements.filter((item) => selection.ids.includes(item.id)));
  }
  return null;
}

function dataUrlPayload(dataUrl: string): string {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("Could not encode export data.");
  return dataUrl.slice(separator + 1);
}

export async function exportCanvas(format: ExportFormat, scope: ExportScope): Promise<void> {
  const state = useAppStore.getState();
  const canvas = state.projectFile.project.canvases.find(
    (item) => item.id === state.projectFile.workspace.lastOpenedCanvasId,
  );
  const stage = document.querySelector<HTMLElement>(".canvas-stage");
  const viewportElement = stage?.querySelector<HTMLElement>(".react-flow__viewport");
  if (!canvas || !stage || !viewportElement) throw new Error("Canvas is not ready for export.");

  const extension = format;
  const path = await save({
    defaultPath: `${canvas.title || "Canvas"}.${extension}`,
    filters: [{ name: format === "png" ? "PNG Image" : "PDF Document", extensions: [extension] }],
  });
  if (!path) return;
  const { toPng } = await import("html-to-image");

  let width: number;
  let height: number;
  let transform: string;
  if (scope === "viewport") {
    width = stage.clientWidth;
    height = stage.clientHeight;
    transform = `translate(${canvas.viewport.x}px, ${canvas.viewport.y}px) scale(${canvas.viewport.zoom})`;
  } else {
    const bounds = exportBounds(canvas, state.selection, scope);
    if (!bounds) throw new Error("The selected export scope is empty.");
    const rawWidth = Math.max(1, bounds.width + PADDING * 2);
    const rawHeight = Math.max(1, bounds.height + PADDING * 2);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(rawWidth, rawHeight));
    width = Math.ceil(rawWidth * scale);
    height = Math.ceil(rawHeight * scale);
    transform = `translate(${PADDING * scale - bounds.x * scale}px, ${PADDING * scale - bounds.y * scale}px) scale(${scale})`;
  }

  viewportElement.classList.add("is-exporting");
  let pngDataUrl: string;
  try {
    pngDataUrl = await toPng(viewportElement, {
      backgroundColor: "#151612",
      width,
      height,
      pixelRatio: 1,
      cacheBust: true,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform,
      },
    });
  } finally {
    viewportElement.classList.remove("is-exporting");
  }

  let outputDataUrl = pngDataUrl;
  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      orientation: width >= height ? "landscape" : "portrait",
      unit: "px",
      format: [width, height],
      hotfixes: ["px_scaling"],
    });
    pdf.addImage(pngDataUrl, "PNG", 0, 0, width, height);
    outputDataUrl = pdf.output("datauristring");
  }

  await invoke("write_binary_file_atomic", {
    path,
    base64Data: dataUrlPayload(outputDataUrl),
  });
}
