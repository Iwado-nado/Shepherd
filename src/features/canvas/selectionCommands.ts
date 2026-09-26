import { confirm } from "@tauri-apps/plugin-dialog";
import { getActiveCanvas, useAppStore } from "../../store/appStore";

export type SelectionDeleteKey = "Backspace" | "Delete";

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as HTMLElement;
  const tagName = element.tagName?.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    Boolean(element.isContentEditable) ||
    Boolean(element.closest?.("[contenteditable]:not([contenteditable='false'])"))
  );
}

export function isSelectionDeleteKey(key: string): key is SelectionDeleteKey {
  return key === "Backspace" || key === "Delete";
}

export function isMutedShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat" | "isComposing">): boolean {
  return event.key === "0" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
    !event.repeat && !event.isComposing;
}

export function shouldHandleSelectionDelete(key: string, target: EventTarget | null): key is SelectionDeleteKey {
  return isSelectionDeleteKey(key) && !isEditableTarget(target);
}

export async function deleteSelectionByKey(key: SelectionDeleteKey): Promise<void> {
  const state = useAppStore.getState();
  const selection = state.selection;
  if (!selection) return;

  if (key === "Backspace") {
    if (selection.type !== "card") state.deleteSelection();
    return;
  }

  if (selection.type !== "placements" && selection.type !== "card") {
    state.deleteSelection();
    return;
  }

  const activeCanvas = getActiveCanvas(state);
  const cardIds = selection.type === "card"
    ? [selection.id]
    : [...new Set(selection.ids.flatMap((placementId) => {
        const placement = activeCanvas?.placements.find((item) => item.id === placementId);
        return placement ? [placement.cardId] : [];
      }))];
  if (cardIds.length === 0) {
    state.setSelection(null);
    return;
  }

  const cards = cardIds.flatMap((cardId) => {
    const card = state.projectFile.project.cards.find((item) => item.id === cardId);
    if (!card) return [];
    const canvasCount = state.projectFile.project.canvases.filter((canvas) =>
      canvas.placements.some((placement) => placement.cardId === cardId),
    ).length;
    return [{ card, canvasCount }];
  });
  const sharedCards = cards.filter(({ canvasCount }) => canvasCount > 1);

  try {
    if (sharedCards.length > 0) {
      const details = cards
        .map(({ card, canvasCount }) => `「${card.title || "Untitled Card"}」: ${canvasCount} Canvas`)
        .join("\n");
      const accepted = await confirm(
        `複数Canvasで使用中のCardをProjectから完全削除します。\n\n${details}\n\n続行しますか？`,
        { title: "Shepherd", kind: "warning" },
      );
      if (!accepted) return;
    }
    useAppStore.getState().deleteCards(cards.map(({ card }) => card.id));
  } catch (error) {
    useAppStore.getState().setSaveState("error", error instanceof Error ? error.message : String(error));
  }
}
