import { useEffect, useState } from "react";
import { useAppStore } from "../../store/appStore";
import {
  discardRecovery,
  listBackups,
  listRecoveryCandidates,
  recoverProject,
  restoreBackup,
  type BackupEntry,
  type RecoveryCandidate,
} from "./projectPersistence";

interface SaveHistoryDialogProps {
  open: boolean;
  onClose: () => void;
}

function displayDate(value: string | number): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

export function SaveHistoryDialog({ open, onClose }: SaveHistoryDialogProps) {
  const projectId = useAppStore((state) => state.projectFile.project.id);
  const currentFilePath = useAppStore((state) => state.currentFilePath);
  const setSaveState = useAppStore((state) => state.setSaveState);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [recoveries, setRecoveries] = useState<RecoveryCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const reportError = (error: unknown) => {
    setSaveState("error", error instanceof Error ? error.message : String(error));
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void Promise.all([
      currentFilePath ? listBackups(currentFilePath) : Promise.resolve([]),
      listRecoveryCandidates(),
    ]).then(([nextBackups, candidates]) => {
      if (!active) return;
      setBackups(nextBackups);
      setRecoveries(candidates.filter((candidate) => candidate.projectId === projectId));
    }).catch((error: unknown) => {
      if (active) setSaveState("error", error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [currentFilePath, open, projectId, setSaveState]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="history-dialog" role="dialog" aria-modal="true" aria-label="Save history">
        <div className="export-heading">
          <div><span>SAVE HISTORY</span><strong>Recovery &amp; backups</strong></div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <p className="history-note">復元内容はworking stateへ読み込まれます。本体ファイルは次回Saveまで変更されません。</p>
        <div className="history-section">
          <h3>Recovery autosave</h3>
          {recoveries.map((candidate) => (
            <div className="history-row" key={candidate.recoveryPath}>
              <div><strong>Automatic recovery</strong><small>{displayDate(candidate.autosavedAt)}</small></div>
              <button type="button" onClick={() => void recoverProject(candidate).then(onClose).catch(reportError)}>Recover</button>
              <button className="danger-button" type="button" onClick={() => void discardRecovery(candidate).then(() => {
                setRecoveries((items) => items.filter((item) => item.projectId !== candidate.projectId));
              }).catch(reportError)}>Discard</button>
            </div>
          ))}
          {!loading && recoveries.length === 0 ? <p>No recovery autosave.</p> : null}
        </div>
        <div className="history-section">
          <h3>Manual save backups</h3>
          {backups.map((entry) => (
            <div className="history-row" key={entry.path}>
              <div><strong>Backup {entry.generation}</strong><small>{displayDate(entry.modifiedAt)}</small></div>
              <button type="button" onClick={() => void restoreBackup(entry).then(onClose).catch(reportError)}>Restore</button>
            </div>
          ))}
          {!loading && backups.length === 0 ? <p>No manual save backups.</p> : null}
        </div>
        {loading ? <p className="history-loading">Loading history...</p> : null}
      </section>
    </div>
  );
}
