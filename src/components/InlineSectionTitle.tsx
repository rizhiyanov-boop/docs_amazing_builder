import { useEffect, useRef, useState } from 'react';

type InlineSectionTitleProps = {
  value: string;
  onCommit: (value: string) => void;
};

export function InlineSectionTitle({ value, onCommit }: InlineSectionTitleProps) {
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const initialValueRef = useRef(value);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (isEditing) titleRef.current?.focus({ preventScroll: true });
  }, [isEditing]);

  const startEditing = (): void => {
    initialValueRef.current = value;
    setIsEditing(true);
  };

  useEffect(() => {
    const node = titleRef.current;
    if (!node || document.activeElement === node) return;
    node.textContent = value;
  }, [value]);

  const commit = (): void => {
    if (!isEditing) return;
    onCommit(titleRef.current?.textContent ?? '');
    setIsEditing(false);
  };

  return (
    <span className="inline-section-title-wrap">
    <span
      ref={titleRef}
      className="inline-section-title"
      contentEditable={isEditing}
      suppressContentEditableWarning
      role={isEditing ? 'textbox' : undefined}
      aria-label={isEditing ? 'Название секции' : undefined}
      onDoubleClick={startEditing}
      spellCheck={false}
      onFocus={() => {
        initialValueRef.current = value;
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.textContent = initialValueRef.current;
          event.currentTarget.blur();
        }
      }}
    >
      {value}
    </span>
    <button type="button" className="inline-section-title-edit" aria-label="Редактировать название секции" onClick={startEditing}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>
    </button>
    </span>
  );
}
