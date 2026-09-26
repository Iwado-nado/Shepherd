import { useRef, type ChangeEvent } from "react";
import { normalizeTags, tagsFromInput } from "../../store/appStore";

const TAG_SEPARATOR = /[#,，\s\u3000]+/u;

export function splitTagDraft(value: string): { confirmed: string[]; pending: string } {
  const parts = value.split(TAG_SEPARATOR);
  if (parts.length === 1) return { confirmed: [], pending: value };
  return { confirmed: tagsFromInput(parts.slice(0, -1).join(",")), pending: parts.at(-1) ?? "" };
}

interface TagInputProps {
  id?: string;
  label: string;
  tags: string[];
  input: string;
  placeholder?: string;
  commitEmptyOnBlur?: boolean;
  onTagsChange: (tags: string[]) => void;
  onInputChange: (value: string) => void;
  onCommit: (tags: string[]) => void;
}

export function TagInput({ id, label, tags, input, placeholder, commitEmptyOnBlur = false, onTagsChange, onInputChange, onCommit }: TagInputProps) {
  const composing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInput = (value: string) => {
    const { confirmed, pending } = splitTagDraft(value);
    if (confirmed.length) onTagsChange(normalizeTags([...tags, ...confirmed]));
    onInputChange(pending);
  };

  const commitInput = () => {
    if (!input.trim()) {
      if (input) onInputChange("");
      if (commitEmptyOnBlur) onCommit(tags);
      return;
    }
    const next = normalizeTags([...tags, ...tagsFromInput(input)]);
    if (input) onInputChange("");
    if (next.join("\0") !== tags.join("\0")) onTagsChange(next);
    onCommit(next);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (composing.current) onInputChange(event.target.value);
    else handleInput(event.target.value);
  };

  return (
    <div className="tag-token-field" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }}>
      {tags.map((tag) => (
        <button key={tag} type="button" className="tag-token" aria-label={`#${tag}を解除`} onMouseDown={(event) => event.preventDefault()} onClick={() => {
          const next = normalizeTags([...tags.filter((item) => item !== tag), ...tagsFromInput(input).filter((item) => item !== tag)]);
          if (input) onInputChange("");
          onTagsChange(next);
          onCommit(next);
        }}>
          <span>#{tag}</span><span aria-hidden="true">×</span>
        </button>
      ))}
      <input
        ref={inputRef}
        id={id}
        aria-label={label}
        value={input}
        placeholder={tags.length ? "Tagを追加" : placeholder ?? "Tagを入力"}
        onChange={onChange}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(event) => {
          composing.current = false;
          handleInput(event.currentTarget.value);
        }}
        onBlur={commitInput}
        onKeyDown={(event) => {
          if (composing.current || event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            commitInput();
          } else if (event.key === "Backspace" && !input && tags.length) {
            event.preventDefault();
            const next = tags.slice(0, -1);
            onTagsChange(next);
            onCommit(next);
          } else if (event.key === "Escape" && input) {
            event.preventDefault();
            event.stopPropagation();
            onInputChange("");
          }
        }}
      />
    </div>
  );
}
