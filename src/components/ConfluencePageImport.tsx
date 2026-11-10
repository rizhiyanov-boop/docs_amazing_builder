import { useRef, useState } from 'react';
import { buildConfluenceImport, confluenceImportExtras, prepareConfluenceImport, type ConfluenceImportPreview } from '../confluenceImport';
import type { ConfluenceImportSource, ConfluencePage } from '../confluenceTypes';
import type { MethodDocument, ParsedSection } from '../types';
import { WBButton } from './primitives/WorkbenchPrimitives';

const exampleLabels = {
  'server-request': 'Запрос к адаптеру',
  'client-request': 'Запрос во внешнюю систему',
  'server-response': 'Ответ адаптера',
  'client-response': 'Ответ внешней системы'
} as const;
type ExampleGroup = keyof typeof exampleLabels;

type Props = {
  page: ConfluencePage;
  baseUrl: string;
  onOpenExisting?: (source: ConfluenceImportSource) => boolean;
  onImport: (method: MethodDocument) => void;
};

export function ConfluencePageImport({ page, baseUrl, onOpenExisting, onImport }: Props) {
  const [preview, setPreview] = useState<ConfluenceImportPreview>();
  const [externalCall, setExternalCall] = useState('');
  const [examples, setExamples] = useState<Partial<Record<ExampleGroup, string>>>({});
  const [error, setError] = useState('');
  const committed = useRef(false);

  function prepare() {
    if (onOpenExisting?.({ baseUrl, pageId: page.id, version: page.version })) return;
    setPreview(prepareConfluenceImport(page, baseUrl));
  }

  function cancel() {
    setPreview(undefined);
    setExternalCall('');
    setExamples({});
    setError('');
  }

  if (!preview) return <div className="cf-actions">
    <WBButton size="sm" onClick={prepare}>Подготовить импорт</WBButton>
  </div>;

  if (!preview.ok) return <section className="cf-notice cf-error" aria-label="Отказ в импорте">
    <h3>Страница не подходит для импорта</h3>
    <ul>{preview.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    <WBButton size="sm" variant="ghost" onClick={cancel}>Закрыть</WBButton>
  </section>;

  const groups = (Object.keys(exampleLabels) as ExampleGroup[]).map(group => ({
    group, items: preview.examples.filter(example => example.group === group)
  }));
  const needsChoice = preview.externalCalls.length > 1 && !externalCall
    || groups.some(({ group, items }) => items.length > 1 && !examples[group]);
  const request = preview.method.sections.find((section): section is ParsedSection => section.kind === 'parsed' && section.id === 'request');
  const additionalByTitle = confluenceImportExtras(preview, { examples });

  return <section className="cf-notice cf-import-review" aria-label="Предпросмотр импорта">
    <h3>Предпросмотр импорта</h3>
    <p className="cf-import-title">{request?.requestMethod} {request?.requestUrl}</p>
    <ul aria-label="Секции метода">
      {preview.method.sections.map(section => <li key={section.id}>
        {section.title}
        {section.kind === 'parsed' && <> · полей {section.rows.filter(row => row.enabled !== false).length}
          {section.clientRows?.length ? ', внешних ' + section.clientRows.length : ''}</>}
        {section.kind === 'diagram' && <> · {section.diagrams.length}</>}
        {section.kind === 'errors' && <> · {section.rows.length}</>}
      </li>)}
    </ul>
    {preview.warnings.length > 0 && <div className="cf-import-warnings">
      <strong>Проверьте при переносе</strong>
      <ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
    </div>}
    {preview.externalCalls.length > 1 && <label className="cf-import-choice">
      <span>Основной внешний вызов</span>
      <select value={externalCall} onChange={event => { setExternalCall(event.target.value); setError(''); }}>
        <option value="">Выберите вызов</option>
        {preview.externalCalls.map(call => <option key={call.id} value={call.id}>{call.label}</option>)}
      </select>
    </label>}
    {groups.filter(({ items }) => items.length > 1).map(({ group, items }) => <div className="cf-import-example" key={group}>
      <label className="cf-import-choice">
        <span>{exampleLabels[group]} · основной пример</span>
        <select value={examples[group] ?? ''} onChange={event => {
          const value = event.target.value;
          setExamples(old => ({ ...old, [group]: value })); setError('');
        }}>
          <option value="">Выберите пример</option>
          {items.map((item, index) => <option key={item.id} value={item.id}>
            {index + 1}. {item.title.split(' / ').at(-1)} ({item.format})
          </option>)}
        </select>
      </label>
      {examples[group] && <details>
        <summary>Показать выбранный пример</summary>
        <pre className="cf-content">{items.find(item => item.id === examples[group])?.code}</pre>
      </details>}
    </div>)}
    {additionalByTitle.size > 0 && <details className="cf-import-extra">
      <summary>Дополнительные материалы · {additionalByTitle.size}</summary>
      {[...additionalByTitle].map(([title, texts]) => <details key={title}>
        <summary>{title}</summary>
        <pre className="cf-content">{texts.join('\n\n')}</pre>
      </details>)}
    </details>}
    {error && <p role="alert" className="cf-import-warnings">{error}</p>}
    <div className="cf-actions">
      <WBButton size="sm" variant="primary" disabled={needsChoice} onClick={() => {
        if (committed.current) return;
        committed.current = true;
        try { onImport(buildConfluenceImport(preview, { externalCall, examples })); }
        catch (failure) {
          committed.current = false;
          setError(failure instanceof Error ? failure.message : 'Не удалось добавить метод');
        }
      }}>Добавить метод</WBButton>
      <WBButton size="sm" variant="ghost" onClick={cancel}>Отмена</WBButton>
    </div>
  </section>;
}
