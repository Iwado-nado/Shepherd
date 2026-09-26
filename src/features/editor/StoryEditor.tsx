import { useEffect, useRef } from "react";
import { useAppStore } from "../../store/appStore";
import { commitFocusedEditor } from "./focusedEditor";
import { TagInput } from "./TagInput";

export function shouldCloseStoryEditor(
  key: string,
  eventIsComposing: boolean,
  compositionActive: boolean,
): boolean {
  return key === "Escape" && !eventIsComposing && !compositionActive;
}

function selectedCardIdFromState(state: ReturnType<typeof useAppStore.getState>): string | null {
  const selection = state.selection;
  if (selection?.type === "card") return selection.id;
  if (selection?.type !== "placements" || selection.ids.length !== 1) return null;
  const placementId = selection.ids[0];
  return state.projectFile.project.canvases
    .flatMap((canvas) => canvas.placements)
    .find((placement) => placement.id === placementId)?.cardId ?? null;
}

interface StoryEditorPanelProps {
  cardId: string;
  committedTitle: string;
}

function StoryEditorPanel({ cardId, committedTitle }: StoryEditorPanelProps) {
  const session = useAppStore((state) => state.storyEditor?.cardId === cardId ? state.storyEditor : null);
  const projectTags = useAppStore((state) => state.projectFile.project.tags);
  const selectedCardId = useAppStore(selectedCardIdFromState);
  const updateTitle = useAppStore((state) => state.updateStoryEditorTitle);
  const updateTags = useAppStore((state) => state.updateStoryEditorTags);
  const updateTagInput = useAppStore((state) => state.updateStoryEditorTagInput);
  const updateBody = useAppStore((state) => state.updateStoryEditorBody);
  const openEditor = useAppStore((state) => state.openStoryEditor);
  const closeEditor = useAppStore((state) => state.closeStoryEditor);
  const composingRef = useRef(false);

  useEffect(() => {
    if (selectedCardId === cardId) return;
    if (selectedCardId) openEditor(selectedCardId);
    else closeEditor();
  }, [cardId, closeEditor, openEditor, selectedCardId]);

  if (!session) return null;
  const { title, tags, tagInput, body, dirty } = session;
  const close = () => closeEditor();
  const lineCount = body ? body.split("\n").length : 1;
  const tagCandidates = projectTags.filter((tag) => !tags.includes(tag));

  return (
    <div
      className="story-editor-backdrop"
      onMouseDown={(event) => event.stopPropagation()}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; }}
      onKeyDown={(event) => {
        if (!shouldCloseStoryEditor(event.key, event.nativeEvent.isComposing, composingRef.current)) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <section className="story-editor-dialog" role="dialog" aria-modal="true" aria-label="Story / Detail Editor">
        <header className="story-editor-heading">
          <div className="story-editor-title-block">
            <span>STORY / DETAIL</span>
            <input
              id="story-editor-title"
              aria-label="Card title"
              value={title}
              onChange={(event) => updateTitle(event.target.value)}
              onBlur={commitFocusedEditor}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || composingRef.current) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitFocusedEditor();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  updateTitle(committedTitle);
                }
              }}
              placeholder="Untitled Card"
            />
          </div>
          <button type="button" aria-label="Story Editorを閉じる" onClick={close}>×</button>
        </header>
        <section className="story-editor-tags" aria-label="Card tags">
          <TagInput
            label="Card tags"
            tags={tags}
            input={tagInput}
            onTagsChange={updateTags}
            onInputChange={updateTagInput}
            onCommit={commitFocusedEditor}
            placeholder="Tagを入力"
          />
          {tagCandidates.length ? (
            <div className="story-editor-tag-candidates">
              <span>EXISTING</span>
              {tagCandidates.map((tag) => (
                <button key={tag} type="button" onClick={() => {
                  const current = useAppStore.getState().storyEditor;
                  updateTags([...(current?.cardId === cardId ? current.tags : tags), tag]);
                  commitFocusedEditor();
                }}>+ {tag}</button>
              ))}
            </div>
          ) : null}
        </section>
        <textarea
          autoFocus
          aria-label={`${title || "Untitled Card"}のStory本文`}
          value={body}
          onChange={(event) => updateBody(event.target.value)}
          placeholder="物語本文、シーン詳細、台詞、メモなどを入力してください。"
          spellCheck
        />
        <footer className="story-editor-footer">
          <span>{dirty ? "Uncommitted changes" : "Committed"}</span>
          <span>{lineCount} lines / {body.length} characters</span>
          <button className="primary-button" type="button" onClick={close}>Commit &amp; Close</button>
        </footer>
      </section>
    </div>
  );
}

export function StoryEditor() {
  const session = useAppStore((state) => state.storyEditor);
  const card = useAppStore((state) => session
    ? state.projectFile.project.cards.find((item) => item.id === session.cardId)
    : undefined);
  const closeEditor = useAppStore((state) => state.closeStoryEditor);

  useEffect(() => {
    if (session && !card) closeEditor();
  }, [card, closeEditor, session]);

  if (!session || !card) return null;
  return <StoryEditorPanel key={card.id} cardId={card.id} committedTitle={card.title} />;
}
