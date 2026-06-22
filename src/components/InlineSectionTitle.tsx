import { useEffect, useRef } from 'react';

type InlineSectionTitleProps = {
  value: string;
  onCommit: (value: string) => void;
};

export function InlineSectionTitle({ value, onCommit }: InlineSectionTitleProps) {
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const initialValueRef = useRef(value);

  useEffect(() => {
    const node = titleRef.current;
    if (!node || document.activeElement === node) return;
    node.textContent = value;
  }, [value]);

  const commit = (): void => {
    onCommit(titleRef.current?.textContent ?? '');
  };

  return (
    <span
      ref={titleRef}
      className="inline-section-title"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Название секции"
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
  );
}
