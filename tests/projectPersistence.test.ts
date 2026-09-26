import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectFile } from "../src/domain/project";
import { parseProjectFile, serializeProjectFile } from "../src/domain/projectFile";
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
  completeCloseRequest,
  createNewProject,
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

  it.each(["キャンセル", "Cancel", "unexpected"])("keeps an unsaved project intact when New receives %s", async (choice) => {
    useAppStore.getState().createCardAtCenter();
    const before = useAppStore.getState();
    mocks.message.mockResolvedValue(choice);

    await createNewProject();

    const after = useAppStore.getState();
    expect(after.projectFile).toBe(before.projectFile);
    expect(after.projectFile.project.cards).toHaveLength(1);
    expect(after.selection).toEqual(before.selection);
    expect(after.currentRevision).toBe(before.currentRevision);
    expect(after.past).toBe(before.past);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalledWith("write_project_file_atomic", expect.anything());
  });

  it("saves an unsaved project before New when the Japanese Save button is chosen", async () => {
    useAppStore.getState().createCardAtCenter();
    const oldProjectId = useAppStore.getState().projectFile.project.id;
    mocks.message.mockResolvedValue("保存");

    await createNewProject();

    const write = mocks.invoke.mock.calls.find(([command]) => command === "write_project_file_atomic");
    expect(write).toBeDefined();
    expect(parseProjectFile(write![1].contents).project.cards).toHaveLength(1);
    expect(useAppStore.getState().projectFile.project.id).not.toBe(oldProjectId);
    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(0);
  });

  it("continues New only when the Japanese Discard button is chosen", async () => {
    useAppStore.getState().createCardAtCenter();
    mocks.message.mockResolvedValue("保存せず続行");

    await createNewProject();

    expect(useAppStore.getState().projectFile.project.cards).toHaveLength(0);
    expect(mocks.invoke).not.toHaveBeenCalledWith("write_project_file_atomic", expect.anything());
  });

  it("does not open another project after the Japanese Cancel button", async () => {
    useAppStore.getState().createCardAtCenter();
    const before = useAppStore.getState().projectFile;
    mocks.message.mockResolvedValue("キャンセル");

    expect(await openProject()).toBeNull();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(useAppStore.getState().projectFile).toBe(before);
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

  it("preserves resized Placements through Save/Open, Recovery, and Backup restore", async () => {
    const project = createProjectFile("Sizes");
    useAppStore.getState().loadProject(project, "/tmp/sizes.storyflow");
    useAppStore.getState().createCardAtCenter();
    const placementId = useAppStore.getState().projectFile.project.canvases[0].placements[0].id;
    const cardId = useAppStore.getState().projectFile.project.cards[0].id;
    useAppStore.getState().resizePlacement(placementId, { width: 420, height: 310 });
    useAppStore.getState().updateCard(cardId, { color: "sage" });
    useAppStore.getState().toggleMutedSelection();
    await saveProject(false, false);

    const write = mocks.invoke.mock.calls.find(([command]) => command === "write_project_file_atomic");
    expect(write?.[1].createBackup).toBe(true);
    const saved = write![1].contents as string;
    expect(parseProjectFile(saved).project.canvases[0].placements[0].size).toEqual({ width: 420, height: 310 });
    expect(parseProjectFile(saved).project.cards[0]).toMatchObject({ color: "sage", muted: true });

    mocks.open.mockResolvedValue("/tmp/sizes.storyflow");
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "read_project_file") return saved;
      if (command === "project_file_modified_at") return Date.parse("2026-09-22T12:00:00.000Z");
      if (command === "list_recovery_files") return [];
      return undefined;
    });
    useAppStore.getState().newProject("Other");
    expect(await openProject()).toBeNull();
    expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].size)
      .toEqual({ width: 420, height: 310 });
    expect(useAppStore.getState().projectFile.project.cards[0]).toMatchObject({ color: "sage", muted: true });

    useAppStore.getState().resizePlacement(placementId, { width: 264, height: 440 });
    useAppStore.getState().updateCard(cardId, { color: "clay" });
    useAppStore.getState().setSelection({ type: "placements", ids: [placementId] });
    useAppStore.getState().toggleMutedSelection();
    await autosaveRecovery();
    const recoveryWrite = mocks.invoke.mock.calls.find(([command]) => command === "write_recovery_file");
    const recovery = parseRecoveryFile(recoveryWrite![1].contents);
    expect(recovery.projectFile.project.canvases[0].placements[0].size).toEqual({ width: 264, height: 440 });
    expect(recovery.projectFile.project.cards[0]).toMatchObject({ color: "clay", muted: false });
    await recoverProject({ ...recovery, recoveryPath: "/tmp/recovery", modifiedAt: 1 });
    expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].size)
      .toEqual({ width: 264, height: 440 });
    expect(useAppStore.getState().projectFile.project.cards[0]).toMatchObject({ color: "clay", muted: false });

    await restoreBackup({ generation: 1, path: "/tmp/sizes.storyflow.backup1", modifiedAt: 1 });
    expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].size)
      .toEqual({ width: 420, height: 310 });
    expect(useAppStore.getState().projectFile.project.cards[0]).toMatchObject({ color: "sage", muted: true });
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

  it("destroys a clean window without showing a confirmation or writing recovery", async () => {
    useAppStore.getState().loadProject(createProjectFile("Clean"), "/tmp/clean.storyflow");
    const destroy = vi.fn().mockResolvedValue(undefined);

    expect(await completeCloseRequest(destroy)).toBe(true);

    expect(mocks.message).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalledWith("write_recovery_file", expect.anything());
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("finishes Recovery Autosave before destroying a dirty window without Manual Save", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);

    expect(await completeCloseRequest(destroy)).toBe(true);

    expect(mocks.message).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith("write_recovery_file", expect.anything());
    const recoveryOrder = mocks.invoke.mock.invocationCallOrder[
      mocks.invoke.mock.calls.findIndex(([command]) => command === "write_recovery_file")
    ];
    expect(recoveryOrder).toBeLessThan(destroy.mock.invocationCallOrder[0]);
    expect(useAppStore.getState().contentDirty).toBe(true);
  });

  it("cancels window destruction and resumes Recovery Autosave after Cancel", async () => {
    mocks.message.mockResolvedValue("Cancel");
    const destroy = vi.fn().mockResolvedValue(undefined);

    expect(await completeCloseRequest(destroy)).toBe(false);

    expect(destroy).not.toHaveBeenCalled();
    expect(useAppStore.getState().autoSavePaused).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalledWith("write_recovery_file", expect.anything());
  });

  it("completes Manual Save before destroying a dirty saved project", async () => {
    const project = createProjectFile("Dirty saved");
    useAppStore.getState().loadProject(project, "/tmp/dirty.storyflow");
    useAppStore.getState().createCardAtCenter();
    mocks.message.mockResolvedValue("Yes");
    const destroy = vi.fn().mockResolvedValue(undefined);

    expect(await completeCloseRequest(destroy)).toBe(true);

    expect(mocks.invoke).toHaveBeenCalledWith("write_project_file_atomic", expect.objectContaining({
      path: "/tmp/dirty.storyflow",
    }));
    expect(mocks.invoke).not.toHaveBeenCalledWith("write_recovery_file", expect.anything());
    expect(useAppStore.getState().contentDirty).toBe(false);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
