import { useAppStore } from "../../store/appStore";

export function commitFocusedEditor(): void {
  useAppStore.getState().commitStoryEditor();
}
