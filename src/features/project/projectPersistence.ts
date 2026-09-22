import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { parseProjectFile, serializeProjectFile } from "../../domain/projectFile";
import { useAppStore } from "../../store/appStore";

const projectFilter = {
  name: "Shepherd Project",
  extensions: ["storyflow"],
};
let saveQueue: Promise<void> = Promise.resolve();

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function commitFocusedEditor(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

export async function confirmDiscardChanges(): Promise<boolean> {
  commitFocusedEditor();
  if (!useAppStore.getState().contentDirty) return true;
  return confirm("保存されていない変更があります。変更を破棄しますか？", {
    title: "Shepherd",
    kind: "warning",
  });
}

export async function createNewProject(): Promise<void> {
  const store = useAppStore.getState();
  store.setAutoSavePaused(true);
  try {
    await saveQueue;
    if (!(await confirmDiscardChanges())) return;
    const title = window.prompt("Project名", "Untitled");
    if (title === null) return;
    useAppStore.getState().newProject(title);
  } catch (error) {
    useAppStore.getState().setSaveState("error", messageFrom(error));
  } finally {
    useAppStore.getState().setAutoSavePaused(false);
  }
}

export async function openProject(): Promise<void> {
  const store = useAppStore.getState();
  store.setAutoSavePaused(true);
  try {
    await saveQueue;
    if (!(await confirmDiscardChanges())) return;
    useAppStore.getState().setSaveState("idle");
    const selected = await open({ multiple: false, filters: [projectFilter] });
    if (!selected || Array.isArray(selected)) return;
    const contents = await invoke<string>("read_project_file", { path: selected });
    const projectFile = parseProjectFile(contents);
    useAppStore.getState().loadProject(projectFile, selected);
  } catch (error) {
    useAppStore.getState().setSaveState("error", messageFrom(error));
  } finally {
    useAppStore.getState().setAutoSavePaused(false);
  }
}

async function performSave(forceSaveAs: boolean): Promise<void> {
  const state = useAppStore.getState();
  let path = forceSaveAs ? null : state.currentFilePath;

  try {
    if (!path) {
      path = await save({
        filters: [projectFilter],
        defaultPath: `${state.projectFile.project.title || "Untitled"}.storyflow`,
      });
    }
    if (!path) return;

    const snapshot = useAppStore.getState();
    const revision = snapshot.currentRevision;
    const contents = serializeProjectFile(snapshot.projectFile);
    snapshot.setSaveState("saving");
    await invoke("write_project_file_atomic", {
      path,
      contents,
      createBackup: true,
    });
    const persisted = await invoke<string>("read_project_file", { path });
    parseProjectFile(persisted);
    if (persisted !== contents) {
      throw new Error("Saved file verification failed.");
    }
    useAppStore.getState().markSaved(path, revision);
  } catch (error) {
    useAppStore.getState().setSaveState("error", messageFrom(error));
  }
}

export function saveProject(forceSaveAs = false, commitEditor = true): Promise<void> {
  if (commitEditor) {
    commitFocusedEditor();
  }
  const operation = saveQueue.then(() => performSave(forceSaveAs));
  saveQueue = operation.catch(() => undefined);
  return operation;
}
