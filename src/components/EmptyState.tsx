import type { ReactNode } from 'react';
import { WBButton } from './primitives/WorkbenchPrimitives';

type EmptyStateProps = {
  kind: 'no-method' | 'no-workspace' | 'no-results';
  onPrimary?: () => void;
  onSecondary?: () => void;
  onReset?: () => void;
};

const COPY = {
  'no-method': { icon: '□', title: 'Метод пока пустой', text: 'Добавьте секцию или импортируйте OpenAPI, чтобы собрать документацию.', primary: 'Импорт OpenAPI', secondary: 'Создать вручную' },
  'no-workspace': { icon: '▣', title: 'Workspace пуст', text: 'Создайте сервис и первый метод для новой документации.', primary: 'Новый сервис', secondary: 'Шаблон' },
  'no-results': { icon: '⌕', title: 'Ничего не найдено', text: 'Попробуйте другой запрос или сбросьте поиск.', primary: 'Сбросить поиск', secondary: '' }
};

export function EmptyState({ kind, onPrimary, onSecondary, onReset }: EmptyStateProps): ReactNode {
  const copy = COPY[kind];
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 260, padding: 32 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', color: 'var(--wb-text)' }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>{copy.icon}</div>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{copy.title}</h2>
        <p style={{ margin: '8px 0 18px', color: 'var(--wb-text-soft)', fontSize: 14, lineHeight: 1.5 }}>{copy.text}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <WBButton variant="accent" onClick={kind === 'no-results' ? onReset : onPrimary}>{copy.primary}</WBButton>
          {copy.secondary && <WBButton variant="secondary" onClick={onSecondary}>{copy.secondary}</WBButton>}
        </div>
      </div>
    </div>
  );
}
