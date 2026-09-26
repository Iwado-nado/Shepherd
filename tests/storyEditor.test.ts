import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectFile } from "../src/domain/project";
import { parseProjectFile } from "../src/domain/projectFile";
import { toFlowNodes, type ShepherdFlowNode } from "../src/features/canvas/flowAdapter";
import { activateNodeByDoubleClick } from "../src/features/canvas/nodeInteractions";
import { shouldHandleSelectionDelete } from "../src/features/canvas/selectionCommands";
import { commitFocusedEditor } from "../src/features/editor/focusedEditor";
import { shouldCloseStoryEditor } from "../src/features/editor/StoryEditor";
import {
  autosaveRecovery,
  completeCloseRequest,
  openProject,
  parseRecoveryFile,
  saveProject,
} from "../src/features/project/projectPersistence";
import { useAppStore } from "../src/store/appStore";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  message: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
  message: mocks.message,
  open: mocks.open,
  save: mocks.save,
}));

function createCards(count = 1) {
  for (let index = 0; index < count; index += 1) useAppStore.getState().createCardAtCenter();
  return useAppStore.getState().projectFile.project.cards;
}

function cardNode(cardId: string): ShepherdFlowNode {
  return { type: "card", data: { cardId } } as ShepherdFlowNode;
}

function renderedTitles(canvasIndex: number): string[] {
  const state = useAppStore.getState();
  const canvas = state.projectFile.project.canvases[canvasIndex];
  return toFlowNodes(canvas, state.projectFile.project.cards, [], null, "", [], "any", "dim")
    .filter((node) => node.type === "card")
    .map((node) => node.data.title);
}

describe("Story Editor", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.message.mockReset().mockResolvedValue("No");
    mocks.open.mockReset().mockResolvedValue(null);
    mocks.save.mockReset().mockResolvedValue("/tmp/story.storyflow");
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "list_recovery_files" || command === "list_project_backups") return [];
      if (command === "project_file_modified_at") return 0;
      return undefined;
    });
    useAppStore.getState().newProject("Story Editor test");
  });

  it("commits edited Story body when the large Editor closes", () => {
    const card = createCards()[0];
    const historyBefore = useAppStore.getState().past.length;
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorBody("長い物語の本文です。\n第二段落です。");

    useAppStore.getState().closeStoryEditor();

    const state = useAppStore.getState();
    expect(state.projectFile.project.cards[0].body).toBe("長い物語の本文です。\n第二段落です。");
    expect(state.storyEditor).toBeNull();
    expect(state.past).toHaveLength(historyBefore + 1);
  });

  it("opens the existing large Editor for a double-clicked Card Node", () => {
    const card = createCards()[0];
    const toggleArea = vi.fn();

    activateNodeByDoubleClick(cardNode(card.id), useAppStore.getState().openStoryEditor, toggleArea);

    expect(useAppStore.getState().storyEditor?.cardId).toBe(card.id);
    expect(toggleArea).not.toHaveBeenCalled();
  });

  it("keeps a single Card click as selection without opening the Editor", () => {
    createCards();
    const placement = useAppStore.getState().projectFile.project.canvases[0].placements[0];

    useAppStore.getState().setSelection({ type: "placements", ids: [placement.id] });

    expect(useAppStore.getState().selection).toEqual({ type: "placements", ids: [placement.id] });
    expect(useAppStore.getState().storyEditor).toBeNull();
  });

  it("commits title edits to the Card and derived Canvas Node", () => {
    const card = createCards()[0];
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorTitle("改稿後のタイトル");

    commitFocusedEditor();

    expect(useAppStore.getState().projectFile.project.cards[0].title).toBe("改稿後のタイトル");
    expect(renderedTitles(0)).toEqual(["改稿後のタイトル"]);
  });

  it("reflects a shared Card title on Placements in both Canvases", () => {
    useAppStore.getState().createUnplacedCard();
    const card = useAppStore.getState().projectFile.project.cards[0];
    useAppStore.getState().placeExistingCard(card.id);
    useAppStore.getState().addCanvas();
    useAppStore.getState().placeExistingCard(card.id);
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorTitle("両Canvas共通タイトル");

    commitFocusedEditor();

    expect(renderedTitles(0)).toEqual(["両Canvas共通タイトル"]);
    expect(renderedTitles(1)).toEqual(["両Canvas共通タイトル"]);
  });

  it("adds a Tag to the Card domain used by Inspector and the Project registry", () => {
    const card = createCards()[0];
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorTagInput("伏線");

    commitFocusedEditor();

    expect(useAppStore.getState().projectFile.project.cards[0].tags).toEqual(["伏線"]);
    expect(useAppStore.getState().projectFile.project.tags).toContain("伏線");
  });

  it("commits multiple Tags separated by half/full-width spaces in the large Editor", () => {
    const card = createCards()[0];
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorTagInput("Alice 伏線　王都,後半");

    commitFocusedEditor();

    expect(useAppStore.getState().projectFile.project.cards[0].tags).toEqual(["Alice", "伏線", "王都", "後半"]);
    expect(useAppStore.getState().projectFile.project.tags).toEqual(["Alice", "伏線", "王都", "後半"]);
  });

  it("keeps confirmed Tag chips separate from pending text until the Editor commits", () => {
    const card = createCards()[0];
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorTags(["A", "B"]);
    useAppStore.getState().updateStoryEditorTagInput("入力中");
    const before = useAppStore.getState().past.length;

    expect(useAppStore.getState().storyEditor).toMatchObject({ tags: ["A", "B"], tagInput: "入力中", dirty: true });
    expect(useAppStore.getState().projectFile.project.cards[0].tags).toEqual([]);

    commitFocusedEditor();
    expect(useAppStore.getState().projectFile.project.cards[0].tags).toEqual(["A", "B", "入力中"]);
    expect(useAppStore.getState().storyEditor).toMatchObject({ tags: ["A", "B", "入力中"], tagInput: "", dirty: false });
    expect(useAppStore.getState().past).toHaveLength(before + 1);
    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.cards[0].tags).toEqual([]);
    useAppStore.getState().redo();
    expect(useAppStore.getState().projectFile.project.cards[0].tags).toEqual(["A", "B", "入力中"]);
  });

  it("removes a Tag only from the Card and keeps the Project registry", () => {
    const card = createCards()[0];
    useAppStore.getState().updateCard(card.id, { tags: ["Alice", "伏線"] });
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorTags(["Alice"]);

    commitFocusedEditor();

    expect(useAppStore.getState().projectFile.project.cards[0].tags).toEqual(["Alice"]);
    expect(useAppStore.getState().projectFile.project.tags).toEqual(expect.arrayContaining(["Alice", "伏線"]));
  });

  it("commits the active Editor before Manual Save and preserves it through Open", async () => {
    const project = createProjectFile("Saved Story");
    useAppStore.getState().loadProject(project, "/tmp/story.storyflow");
    const card = createCards()[0];
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorTitle("保存タイトル");
    useAppStore.getState().updateStoryEditorTags(["保存Tag"]);
    useAppStore.getState().updateStoryEditorBody("Manual Saveに含まれる本文");
    let savedContents = "";
    mocks.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "write_project_file_atomic") {
        savedContents = String(args?.contents);
        return undefined;
      }
      if (command === "delete_recovery_file") return undefined;
      if (command === "read_project_file") return savedContents;
      if (command === "project_file_modified_at") return Date.now();
      if (command === "list_recovery_files") return [];
      return undefined;
    });

    await saveProject();
    expect(parseProjectFile(savedContents).project.cards[0]).toEqual(expect.objectContaining({
      title: "保存タイトル",
      tags: ["保存Tag"],
      body: "Manual Saveに含まれる本文",
    }));

    useAppStore.getState().newProject("Restarted");
    mocks.open.mockResolvedValue("/tmp/story.storyflow");
    await openProject();
    expect(useAppStore.getState().projectFile.project.cards[0]).toEqual(expect.objectContaining({
      title: "保存タイトル",
      tags: ["保存Tag"],
      body: "Manual Saveに含まれる本文",
    }));
  });

  it("commits the active Editor into Recovery Autosave", async () => {
    const card = createCards()[0];
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorTitle("Recoveryタイトル");
    useAppStore.getState().updateStoryEditorTagInput("RecoveryTag");
    useAppStore.getState().updateStoryEditorBody("Recoveryへ保存する本文");

    await autosaveRecovery();

    const call = mocks.invoke.mock.calls.find(([command]) => command === "write_recovery_file");
    expect(call).toBeDefined();
    const recovery = parseRecoveryFile(call![1].contents);
    expect(recovery.projectFile.project.cards[0]).toEqual(expect.objectContaining({
      title: "Recoveryタイトル",
      tags: ["RecoveryTag"],
      body: "Recoveryへ保存する本文",
    }));
    expect(useAppStore.getState().storyEditor?.dirty).toBe(false);
  });

  it("flushes the active Editor to Recovery before Window Close without Manual Save", async () => {
    const card = createCards()[0];
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorBody("終了直前の未保存本文");
    const destroy = vi.fn().mockResolvedValue(undefined);

    expect(await completeCloseRequest(destroy)).toBe(true);

    const call = mocks.invoke.mock.calls.find(([command]) => command === "write_recovery_file");
    expect(call).toBeDefined();
    expect(parseRecoveryFile(call![1].contents).projectFile.project.cards[0].body).toBe("終了直前の未保存本文");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("keeps Backspace and Delete inside title, Tag, and Story fields out of Canvas deletion", () => {
    const card = createCards()[0];
    const placement = useAppStore.getState().projectFile.project.canvases[0].placements[0];
    useAppStore.getState().setSelection({ type: "placements", ids: [placement.id] });
    const textarea = { tagName: "TEXTAREA", isContentEditable: false } as unknown as EventTarget;
    const input = { tagName: "INPUT", isContentEditable: false } as unknown as EventTarget;

    expect(shouldHandleSelectionDelete("Backspace", textarea)).toBe(false);
    expect(shouldHandleSelectionDelete("Delete", textarea)).toBe(false);
    expect(shouldHandleSelectionDelete("Backspace", input)).toBe(false);
    expect(shouldHandleSelectionDelete("Delete", input)).toBe(false);
    expect(useAppStore.getState().projectFile.project.cards[0].id).toBe(card.id);
    expect(useAppStore.getState().projectFile.project.canvases[0].placements[0].id).toBe(placement.id);
  });

  it("commits Card A before switching the Editor session to Card B", () => {
    const [cardA, cardB] = createCards(2);
    useAppStore.getState().openStoryEditor(cardA.id);
    useAppStore.getState().updateStoryEditorBody("Card Aの編集中本文");

    useAppStore.getState().openStoryEditor(cardB.id);

    const state = useAppStore.getState();
    expect(state.projectFile.project.cards.find((card) => card.id === cardA.id)?.body).toBe("Card Aの編集中本文");
    expect(state.storyEditor).toEqual({
      cardId: cardB.id,
      title: cardB.title,
      tags: cardB.tags,
      tagInput: "",
      body: cardB.body,
      dirty: false,
    });
  });

  it("leaves Canvas selection, dragging, and Edge creation operational after closing", () => {
    const [cardA] = createCards(2);
    const canvas = useAppStore.getState().projectFile.project.canvases[0];
    const [placementA, placementB] = canvas.placements;
    activateNodeByDoubleClick(cardNode(cardA.id), useAppStore.getState().openStoryEditor, vi.fn());
    useAppStore.getState().closeStoryEditor();

    useAppStore.getState().setSelection({ type: "placements", ids: [placementA.id, placementB.id] });
    useAppStore.getState().movePlacements([{ id: placementA.id, position: { x: 240, y: 160 } }]);
    useAppStore.getState().createEdge(placementA.id, placementB.id);

    const state = useAppStore.getState();
    expect(state.selection).toEqual({ type: "placements", ids: [placementA.id, placementB.id] });
    expect(state.projectFile.project.canvases[0].placements[0].position).toEqual({ x: 240, y: 160 });
    expect(state.projectFile.project.canvases[0].edges).toHaveLength(1);
  });

  it("does not close for IME composition Escape and closes for a normal Escape", () => {
    expect(shouldCloseStoryEditor("Escape", true, true)).toBe(false);
    expect(shouldCloseStoryEditor("Escape", false, true)).toBe(false);
    expect(shouldCloseStoryEditor("Escape", false, false)).toBe(true);
    expect(shouldCloseStoryEditor("Backspace", false, false)).toBe(false);
  });

  it("creates one Domain history entry per commit and retains Undo/Redo behavior", () => {
    const card = createCards()[0];
    const originalBody = card.body;
    const historyBefore = useAppStore.getState().past.length;
    useAppStore.getState().openStoryEditor(card.id);
    useAppStore.getState().updateStoryEditorBody("a");
    useAppStore.getState().updateStoryEditorBody("ab");
    useAppStore.getState().updateStoryEditorBody("abc");

    commitFocusedEditor();
    expect(useAppStore.getState().past).toHaveLength(historyBefore + 1);
    expect(useAppStore.getState().projectFile.project.cards[0].body).toBe("abc");

    useAppStore.getState().closeStoryEditor();
    useAppStore.getState().undo();
    expect(useAppStore.getState().projectFile.project.cards[0].body).toBe(originalBody);
    useAppStore.getState().redo();
    expect(useAppStore.getState().projectFile.project.cards[0].body).toBe("abc");
  });
});
