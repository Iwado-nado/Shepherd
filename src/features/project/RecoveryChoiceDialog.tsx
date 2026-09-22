import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import {
  discardRecovery,
  openSavedVersion,
  recoverProject,
  type PendingProjectOpen,
  type RecoveryCandidate,
} from "./projectPersistence";

interface RecoveryChoiceDialogProps {
  candidate: RecoveryCandidate;
  pendingOpen?: PendingProjectOpen;
  onClose: () => void;
}

export function RecoveryChoiceDialog({ candidate, pendingOpen, onClose }: RecoveryChoiceDialogProps) {
  const [busy, setBusy] = useState(false);
  const setSaveState = useAppStore((state) => state.setSaveState);
  const projectTitle = candidate.projectFile.project.title;
  const savedAt = new Date(candidate.autosavedAt).toLocaleString();

  const discard = async () => {
    setBusy(true);
    try {
      await discardRecovery(candidate);
      if (pendingOpen) openSavedVersion(pendingOpen);
      onClose();
    } catch (error) {
      setSaveState("error", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="palette-backdrop">
      <section className="recovery-dialog" role="dialog" aria-modal="true" aria-label="Recovery found">
        <div className="recovery-kicker">RECOVERY FOUND</div>
        <h2>{projectTitle}</h2>
        <p>保存済みファイルより新しい自動復旧データがあります。</p>
        <dl>
          <div><dt>Autosaved</dt><dd>{savedAt}</dd></div>
          <div><dt>Original file</dt><dd>{candidate.originalFilePath ?? "未保存プロジェクト"}</dd></div>
        </dl>
        <div className="recovery-actions">
          <button className="primary-button" type="button" disabled={busy} onClick={() => {
            setBusy(true);
            void recoverProject(candidate).then(onClose).catch((error: unknown) => {
              setSaveState("error", error instanceof Error ? error.message : String(error));
            }).finally(() => setBusy(false));
          }}>Recover autosaved version</button>
          {pendingOpen ? (
            <button type="button" disabled={busy} onClick={() => {
              openSavedVersion(pendingOpen);
              onClose();
            }}>Open saved version</button>
          ) : null}
          <button className="danger-button" type="button" disabled={busy} onClick={() => void discard()}>
            Discard recovery
          </button>
        </div>
      </section>
    </div>
  );
}
