import { invoke } from "@tauri-apps/api/core";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import type { ProjectFile } from "../../domain/models";
import { parseProjectFile, serializeProjectFile } from "../../domain/projectFile";
import { useAppStore } from "../../store/appStore";

const PROJECT_FILTER = [{ name: "Shepherd Project", extensions: ["storyflow"] }];
const RECOVERY_FORMAT_VERSION = 1;

export interface RecoveryDocument {
  formatVersion: 1;
  projectId: string;
  originalFilePath: string | null;
  autosavedRevision: number;
  autosavedAt: string;
  projectFile: ProjectFile;
}

export interface RecoveryCandidate extends RecoveryDocument {
  recoveryPath: string;
  modifiedAt: number;
}

export interface BackupEntry {
  generation: number;
  path: string;
  modifiedAt: number;
}

export interface PendingProjectOpen {
  path: string;
  projectFile: ProjectFile;
  recovery: RecoveryCandidate;
}

interface RecoveryFileEntry {
  path: string;
  contents: string;
  modifiedAt: number;
}

let persistenceQueue: Promise<void> = Promise.resolve();
let recoveryGeneration = 0;

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = persistenceQueue.then(operation, operation);
  persistenceQueue = result.then(() => undefined, () => undefined);
  return result;
}

function invalidateRecoveryWrites(): void {
  recoveryGeneration += 1;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function recoveryDocument(value: unknown): RecoveryDocument {
  if (!value || typeof value !== "object") throw new Error("Invalid recovery file.");
  const candidate = value as Partial<RecoveryDocument>;
  if (
    candidate.formatVersion !== RECOVERY_FORMAT_VERSION ||
    typeof candidate.projectId !== "string" ||
    (candidate.originalFilePath !== null && typeof candidate.originalFilePath !== "string") ||
    !Number.isInteger(candidate.autosavedRevision) ||
    candidate.autosavedRevision! < 0 ||
    typeof candidate.autosavedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.autosavedAt)) ||
    !candidate.projectFile
  ) {
    throw new Error("Unsupported recovery file.");
  }
  const projectFile = parseProjectFile(JSON.stringify(candidate.projectFile));
  if (projectFile.project.id !== candidate.projectId) throw new Error("Recovery project ID does not match.");
  return { ...candidate, projectFile } as RecoveryDocument;
}

export function parseRecoveryFile(contents: string): RecoveryDocument {
  return recoveryDocument(JSON.parse(contents));
}

export async function listRecoveryCandidates(): Promise<RecoveryCandidate[]> {
  const entries = await invoke<RecoveryFileEntry[]>("list_recovery_files");
  const candidates: RecoveryCandidate[] = [];
  for (const entry of entries) {
    try {
      candidates.push({
        ...parseRecoveryFile(entry.contents),
        recoveryPath: entry.path,
        modifiedAt: entry.modifiedAt,
      });
    } catch {
      // A damaged recovery must not prevent other projects from opening.
    }
  }
  return candidates.sort((left, right) => right.autosavedAt.localeCompare(left.autosavedAt));
}

export async function discardRecovery(candidate: Pick<RecoveryCandidate, "projectId">): Promise<void> {
  invalidateRecoveryWrites();
  await enqueue(() => invoke("delete_recovery_file", { projectId: candidate.projectId }));
}

export async function recoverProject(candidate: RecoveryCandidate): Promise<void> {
  invalidateRecoveryWrites();
  useAppStore.getState().restoreProject(candidate.projectFile, candidate.originalFilePath);
  await autosaveRecovery();
}

export async function restoreBackup(entry: BackupEntry): Promise<void> {
  invalidateRecoveryWrites();
  const currentPath = useAppStore.getState().currentFilePath;
  const contents = await enqueue(() => invoke<string>("read_project_file", { path: entry.path }));
  useAppStore.getState().restoreProject(parseProjectFile(contents), currentPath);
}

export async function listBackups(path: string): Promise<BackupEntry[]> {
  return invoke<BackupEntry[]>("list_project_backups", { path });
}

export async function createNewProject(): Promise<void> {
  if (!(await confirmDiscardChanges())) return;
  invalidateRecoveryWrites();
  useAppStore.getState().newProject();
}

export async function openProject(): Promise<PendingProjectOpen | null> {
  if (!(await confirmDiscardChanges())) return null;
  invalidateRecoveryWrites();
  useAppStore.getState().setAutoSavePaused(true);
  try {
    const selected = await open({ multiple: false, filters: PROJECT_FILTER });
    if (!selected) return null;
    invalidateRecoveryWrites();
    const [contents, modifiedAt, recoveries] = await Promise.all([
      enqueue(() => invoke<string>("read_project_file", { path: selected })),
      invoke<number>("project_file_modified_at", { path: selected }),
      listRecoveryCandidates(),
    ]);
    const projectFile = parseProjectFile(contents);
    const recovery = recoveries.find((candidate) => (
      candidate.projectId === projectFile.project.id &&
      Date.parse(candidate.autosavedAt) > modifiedAt
    ));
    if (recovery) return { path: selected, projectFile, recovery };
    useAppStore.getState().loadProject(projectFile, selected);
    return null;
  } catch (error) {
    useAppStore.getState().setSaveState("error", errorMessage(error));
    return null;
  } finally {
    useAppStore.getState().setAutoSavePaused(false);
  }
}

export function openSavedVersion(pending: PendingProjectOpen): void {
  invalidateRecoveryWrites();
  useAppStore.getState().loadProject(pending.projectFile, pending.path);
}

async function chooseSavePath(): Promise<string | null> {
  const selected = await save({ filters: PROJECT_FILTER, defaultPath: "project.storyflow" });
  if (!selected) return null;
  return selected.endsWith(".storyflow") ? selected : `${selected}.storyflow`;
}

export async function saveProject(forceSaveAs = false, commitEditor = true): Promise<void> {
  if (commitEditor) document.activeElement instanceof HTMLElement && document.activeElement.blur();
  invalidateRecoveryWrites();
  const beforeChoice = useAppStore.getState();
  const needsPath = forceSaveAs || !beforeChoice.currentFilePath;
  let path = beforeChoice.currentFilePath;
  if (needsPath) {
    beforeChoice.setAutoSavePaused(true);
    try {
      path = await chooseSavePath();
    } catch (error) {
      useAppStore.getState().setSaveState("error", errorMessage(error));
      return;
    } finally {
      useAppStore.getState().setAutoSavePaused(false);
    }
  }
  if (!path) return;
  invalidateRecoveryWrites();

  const state = useAppStore.getState();
  if (!forceSaveAs && !state.contentDirty && !state.workspaceDirty) return;
  const snapshot = state.projectFile;
  const revision = state.currentRevision;
  const workspaceRevision = state.workspaceRevision;
  const projectId = snapshot.project.id;
  state.setSaveState("saving");

  try {
    await enqueue(async () => {
      await invoke("write_project_file_atomic", {
        path,
        contents: serializeProjectFile(snapshot),
        createBackup: true,
      });
      useAppStore.getState().markSaved(path, revision, workspaceRevision);
      try {
        await invoke("delete_recovery_file", { projectId });
      } catch {
        // An older recovery is ignored because its timestamp predates the saved file.
      }
    });
  } catch (error) {
    useAppStore.getState().setSaveState("error", errorMessage(error));
  }
}

export async function autosaveRecovery(): Promise<void> {
  const state = useAppStore.getState();
  if (
    state.autoSavePaused ||
    state.saveState === "saving" ||
    (!state.contentDirty && !state.workspaceDirty) ||
    (state.autosavedRevision === state.currentRevision &&
      state.autosavedWorkspaceRevision === state.workspaceRevision)
  ) return;

  const generation = recoveryGeneration;
  const snapshot = state.projectFile;
  const projectId = snapshot.project.id;
  const revision = state.currentRevision;
  const workspaceRevision = state.workspaceRevision;
  const autosavedAt = new Date().toISOString();
  const document: RecoveryDocument = {
    formatVersion: RECOVERY_FORMAT_VERSION,
    projectId,
    originalFilePath: state.currentFilePath,
    autosavedRevision: revision,
    autosavedAt,
    projectFile: snapshot,
  };
  state.setAutosaveState("saving");

  try {
    await enqueue(async () => {
      if (generation !== recoveryGeneration) {
        if (useAppStore.getState().projectFile.project.id === projectId) {
          useAppStore.getState().setAutosaveState("idle");
        }
        return;
      }
      await invoke("write_recovery_file", {
        projectId,
        contents: JSON.stringify(document, null, 2),
      });
      if (generation === recoveryGeneration) {
        useAppStore.getState().markAutosaved(projectId, revision, workspaceRevision, autosavedAt);
      }
    });
  } catch (error) {
    if (useAppStore.getState().projectFile.project.id === projectId) {
      useAppStore.getState().setAutosaveState("error", errorMessage(error));
    }
  }
}

export async function confirmDiscardChanges(): Promise<boolean> {
  const state = useAppStore.getState();
  if (!state.contentDirty && !state.workspaceDirty) return true;
  const shouldSave = await message("変更を保存しますか？", {
    title: "Shepherd",
    kind: "warning",
    buttons: { yes: "保存", no: "保存せず続行", cancel: "キャンセル" },
  });
  if (shouldSave === "Cancel") return false;
  if (shouldSave === "Yes") {
    await saveProject(false);
    return useAppStore.getState().saveState !== "error" && Boolean(useAppStore.getState().currentFilePath);
  }
  return true;
}
