import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/appStore";
import { exportFrame } from "./exportGeometry";

export type ExportFormat = "png" | "pdf";
export type ExportScope = "viewport" | "selection" | "area" | "canvas";

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

  const frame = scope === "viewport"
    ? {
        width: stage.clientWidth,
        height: stage.clientHeight,
        transform: `translate(${canvas.viewport.x}px, ${canvas.viewport.y}px) scale(${canvas.viewport.zoom})`,
      }
    : exportFrame(canvas, state.selection, scope);
  if (!frame) throw new Error("The selected export scope is empty.");

  const extension = format;
  const path = await save({
    defaultPath: `${canvas.title || "Canvas"}.${extension}`,
    filters: [{ name: format === "png" ? "PNG Image" : "PDF Document", extensions: [extension] }],
  });
  if (!path) return;
  const { toPng } = await import("html-to-image");

  viewportElement.classList.add("is-exporting");
  let pngDataUrl: string;
  try {
    pngDataUrl = await toPng(viewportElement, {
      backgroundColor: typeof window === "undefined" ? "#171C26" : window.getComputedStyle(stage).backgroundColor,
      width: frame.width,
      height: frame.height,
      pixelRatio: 1,
      cacheBust: true,
      style: {
        width: `${frame.width}px`,
        height: `${frame.height}px`,
        transform: frame.transform,
      },
    });
  } finally {
    viewportElement.classList.remove("is-exporting");
  }

  let outputDataUrl = pngDataUrl;
  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      orientation: frame.width >= frame.height ? "landscape" : "portrait",
      unit: "px",
      format: [frame.width, frame.height],
      hotfixes: ["px_scaling"],
    });
    pdf.addImage(pngDataUrl, "PNG", 0, 0, frame.width, frame.height);
    outputDataUrl = pdf.output("datauristring");
  }

  await invoke("write_binary_file_atomic", {
    path: path.toLowerCase().endsWith(`.${extension}`) ? path : `${path}.${extension}`,
    base64Data: dataUrlPayload(outputDataUrl),
  });
}
