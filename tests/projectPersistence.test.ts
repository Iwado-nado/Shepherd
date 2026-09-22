import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectFile } from "../src/domain/project";
import { serializeProjectFile } from "../src/domain/projectFile";
import { useAppStore } from "../src/store/appStore";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  message: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  message: mocks.message,
  open: mocks.open,
  save: mocks.save,
}));

import {
  autosaveRecovery,
  openProject,
  parseRecoveryFile,
  recoverProject,
  restoreBackup,
  saveProject,
  type RecoveryDocument,
} from "../src/features/project/projectPersistence";

function recoveryFor(projectFile = createProjectFile("Recovered"), overrides: Partial<RecoveryDocument> = {}): RecoveryDocument {
  return {
    formatVersion: 1,
    projectId: projectFile.project.id,
    originalFilePath: "/tmp/project.storyflow",
    autosavedRevision: 4,
    autosavedAt: "2026-09-22T12:00:00.000Z",
    projectFile,
    ...overrides,
  };
}

describe("Project persistence", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.message.mockReset().mockResolvedValue("No");
    mocks.open.mockReset().mockResolvedValue(null);
    mocks.save.mockReset().mockResolvedValue("/tmp/new-project.storyflow");
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_recovery_files" || command === "list_project_backups") return [];
      if (command === "project_file_modified_at") return 0;
      return undefined;
    });
    useAppStore.getState().newProject("Persistence test");
  });

  it("parses a recovery wrapper without changing the project file format", () => {
    const recovery = recoveryFor();
    expect(parseRecoveryFile(JSON.stringify(recovery))).toEqual(recovery);
    expect(recovery.projectFile.formatVersion).toBe(3);
  });

  it("rejects a recovery wrapper whose project ID does not match", () => {
    const recovery = recoveryFor();
    expect(() => parseRecoveryFile(JSON.stringify({ ...recovery, projectId: "other" }))).toThrow(/project ID/);
  });

  it("autosaves an unsaved project only to recovery and keeps it dirty", async () => {
    await autosaveRecovery();

    const write = mocks.invoke.mock.calls.find(([command]) => command === "write_recovery_file");
    expect(write).toBeDefined();
    expect(mocks.invoke).not.toHaveBeenCalledWith("write_project_file_atomic", expect.anything());
    expect(parseRecoveryFile(write![1].contents).originalFilePath).toBeNull();
    expect(useAppStore.getState().contentDirty).toBe(true);
    expect(useAppStore.getState().autosavedRevision).toBe(useAppStore.getState().currentRevision);
  });

  it("skips recovery when both content and workspace revisions were already autosaved", async () => {
    await autosaveRecovery();
    await autosaveRecovery();
    expect(mocks.invoke.mock.calls.filter(([command]) => command === "write_recovery_file")).toHaveLength(1);
  });

  it("manual Save writes the project with backups, marks the snapshot saved, and removes recovery", async () => {
    const project = createProjectFile("Manual save");
    useAppStore.getState().loadProject(project, "/tmp/project.storyflow");
    useAppStore.getState().createCardAtCenter();

    await saveProject(false, false);

    expect(mocks.invoke).toHaveBeenCalledWith("write_project_file_atomic", expect.objectContaining({
      path: "/tmp/project.storyflow",
      createBackup: true,
    }));
    expect(mocks.invoke).toHaveBeenCalledWith("delete_recovery_file", { projectId: project.project.id });
    expect(useAppStore.getState().contentDirty).toBe(false);
    expect(useAppStore.getState().currentFilePath).toBe("/tmp/project.storyflow");
  });

  it("Save As writes the selected path and updates the current path", async () => {
    await saveProject(true, false);
    expect(mocks.invoke).toHaveBeenCalledWith("write_project_file_atomic", expect.objectContaining({
      path: "/tmp/new-project.storyflow",
    }));
    expect(useAppStore.getState().currentFilePath).toBe("/tmp/new-project.storyflow");
  });

  it("serializes an in-flight recovery before Manual Save and deletes it afterward", async () => {
    const project = createProjectFile("Race");
    useAppStore.getState().loadProject(project, "/tmp/race.storyflow");
    useAppStore.getState().createCardAtCenter();
    let finishRecovery!: () => void;
    const recoveryPending = new Promise<void>((resolve) => { finishRecovery = resolve; });
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "write_recovery_file") return recoveryPending;
      return undefined;
    });

    const autosave = autosaveRecovery();
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("write_recovery_file", expect.anything()));
    const manualSave = saveProject(false, false);
    finishRecovery();
    await Promise.all([autosave, manualSave]);

    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual([
      "write_recovery_file",
      "write_project_file_atomic",
      "delete_recovery_file",
    ]);
    expect(useAppStore.getState().contentDirty).toBe(false);
  });

  it("cancels a queued stale recovery when Manual Save is requested", async () => {
    const project = createProjectFile("Queued race");
    useAppStore.getState().loadProject(project, "/tmp/race.storyflow");
    useAppStore.getState().createCardAtCenter();
    let finishFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => { finishFirst = resolve; });
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "write_recovery_file") return firstPending;
      return undefined;
    });

    const first = autosaveRecovery();
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    useAppStore.getState().createCardAtCenter();
    const stale = autosaveRecovery();
    const manual = saveProject(false, false);
    finishFirst();
    await Promise.all([first, stale, manual]);

    expect(mocks.invoke.mock.calls.filter(([command]) => command === "write_recovery_file")).toHaveLength(1);
    expect(mocks.invoke.mock.calls.at(-1)?.[0]).toBe("delete_recovery_file");
  });

  it("returns a choice instead of loading when Open finds a newer recovery", async () => {
    const saved = createProjectFile("Saved");
    const recovery = recoveryFor(saved);
    mocks.open.mockResolvedValue("/tmp/saved.storyflow");
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "read_project_file") return serializeProjectFile(saved);
      if (command === "project_file_modified_at") return Date.parse("2026-09-22T11:00:00.000Z");
      if (command === "list_recovery_files") return [{
        path: "/app/recovery/file.json",
        contents: JSON.stringify(recovery),
        modifiedAt: Date.parse(recovery.autosavedAt),
      }];
      return undefined;
    });

    const pending = await openProject();
    expect(pending?.recovery.projectId).toBe(saved.project.id);
    expect(useAppStore.getState().currentFilePath).toBeNull();
    expect(useAppStore.getState().autoSavePaused).toBe(false);
  });

  it("opens the saved file directly when its recovery is older", async () => {
    const saved = createProjectFile("Saved");
    const recovery = recoveryFor(saved, { autosavedAt: "2026-09-22T10:00:00.000Z" });
    mocks.open.mockResolvedValue("/tmp/saved.storyflow");
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "read_project_file") return serializeProjectFile(saved);
      if (command === "project_file_modified_at") return Date.parse("2026-09-22T11:00:00.000Z");
      if (command === "list_recovery_files") return [{ path: "recovery", contents: JSON.stringify(recovery), modifiedAt: 1 }];
      return undefined;
    });

    expect(await openProject()).toBeNull();
    expect(useAppStore.getState().currentFilePath).toBe("/tmp/saved.storyflow");
    expect(useAppStore.getState().contentDirty).toBe(false);
  });

  it("recovers non-destructively, keeps the original path, and clears Undo/Redo", async () => {
    const recovered = createProjectFile("Recovered");
    useAppStore.getState().createCardAtCenter();
    expect(useAppStore.getState().past.length).toBeGreaterThan(0);

    await recoverProject({
      ...recoveryFor(recovered),
      recoveryPath: "/app/recovery/file.json",
      modifiedAt: 1,
    });

    const state = useAppStore.getState();
    expect(state.projectFile).toEqual(recovered);
    expect(state.currentFilePath).toBe("/tmp/project.storyflow");
    expect(state.contentDirty).toBe(true);
    expect(state.past).toEqual([]);
    expect(state.future).toEqual([]);
  });

  it("restores a backup as dirty working state without overwriting the main file", async () => {
    const current = createProjectFile("Current");
    const backup = createProjectFile("Backup");
    useAppStore.getState().loadProject(current, "/tmp/project.storyflow");
    mocks.invoke.mockResolvedValueOnce(serializeProjectFile(backup));

    await restoreBackup({ generation: 1, path: "/tmp/project.storyflow.backup1", modifiedAt: 1 });

    expect(useAppStore.getState().projectFile.project.title).toBe("Backup");
    expect(useAppStore.getState().currentFilePath).toBe("/tmp/project.storyflow");
    expect(useAppStore.getState().contentDirty).toBe(true);
    expect(mocks.invoke).not.toHaveBeenCalledWith("write_project_file_atomic", expect.anything());
  });
});
