import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import { exportCanvas, type ExportFormat, type ExportScope } from "./exportCanvas";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const selection = useAppStore((state) => state.selection);
  const setSaveState = useAppStore((state) => state.setSaveState);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scope, setScope] = useState<ExportScope>("canvas");
  const [exporting, setExporting] = useState(false);

  if (!open) return null;
  const hasSelection = selection?.type === "placements" || selection?.type === "area";
  const hasArea = selection?.type === "area";

  const run = async () => {
    setExporting(true);
    try {
      await exportCanvas(format, scope);
      onClose();
    } catch (error) {
      setSaveState("error", error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="export-dialog" role="dialog" aria-label="Export Canvas">
        <div className="export-heading"><div><span>EXPORT</span><strong>Canvas output</strong></div><button type="button" onClick={onClose}>×</button></div>
        <label>FORMAT</label>
        <div className="segmented-control">
          <button className={format === "png" ? "is-active" : ""} type="button" onClick={() => setFormat("png")}>PNG</button>
          <button className={format === "pdf" ? "is-active" : ""} type="button" onClick={() => setFormat("pdf")}>PDF</button>
        </div>
        <label>SCOPE</label>
        <div className="export-scopes">
          <button className={scope === "viewport" ? "is-active" : ""} type="button" onClick={() => setScope("viewport")}><strong>Current View</strong><small>現在表示している範囲</small></button>
          <button className={scope === "canvas" ? "is-active" : ""} type="button" onClick={() => setScope("canvas")}><strong>Full Canvas</strong><small>Canvas上の全オブジェクト</small></button>
          <button disabled={!hasSelection} className={scope === "selection" ? "is-active" : ""} type="button" onClick={() => setScope("selection")}><strong>Selection</strong><small>選択中のCardまたはArea</small></button>
          <button disabled={!hasArea} className={scope === "area" ? "is-active" : ""} type="button" onClick={() => setScope("area")}><strong>Area</strong><small>選択中Areaの表示領域</small></button>
        </div>
        <button className="export-submit primary-button" type="button" disabled={exporting || (scope === "selection" && !hasSelection) || (scope === "area" && !hasArea)} onClick={() => void run()}>
          {exporting ? "Exporting..." : `Export ${format.toUpperCase()}`}
        </button>
      </section>
    </div>
  );
}
