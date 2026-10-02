import { useEffect, useRef, useState, type ReactNode } from 'react';
import { WBButton, WBInput } from './primitives/WorkbenchPrimitives';
import { isPersonalSpace, readRecentSpaces, rememberSpace } from '../confluenceSpaces';
import type { ConfluenceSpace } from '../confluenceTypes';
import './ConfluenceSpacePicker.css';

export function ConfluenceSpacePicker({ spaces, value, origin, loading, disabled, onChange }: {
  spaces: ConfluenceSpace[]; value: string; origin: string; loading: boolean; disabled: boolean; onChange: (key: string) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [directory, setDirectory] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [personal, setPersonal] = useState(false);
  const [recent, setRecent] = useState(() => readRecentSpaces(origin));
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = spaces.find(space => space.key === value);
  const categories = [...new Set(spaces.flatMap(space => space.categories ?? []))].sort((a, b) => a.localeCompare(b, 'ru'));
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const matching = (space: ConfluenceSpace) => `${space.name} ${space.key}`.toLocaleLowerCase('ru').includes(normalizedQuery) && (!category || space.categories?.includes(category));
  const recentItems = recent.flatMap(key => {
    const space = spaces.find(item => item.key === key);
    return space && matching(space) ? [space] : [];
  });
  const filtered = spaces.filter(space => (personal || !isPersonalSpace(space)) && matching(space)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  function choose(space: ConfluenceSpace) {
    setRecent(rememberSpace(origin, space.key));
    onChange(space.key); setOpen(false); trigger.current?.focus();
  }
  function item(space: ConfluenceSpace) {
    return <li key={space.key}><button type="button" className="cf-space-option" aria-pressed={value === space.key} onClick={() => choose(space)}>
      <span className="cf-space-icon" aria-hidden="true">{isPersonalSpace(space) ? '●' : '◈'}</span>
      <span className="cf-space-name">{space.name}<small>{space.key}{isPersonalSpace(space) ? ' · Личное' : ''}</small></span>
      {value === space.key && <span aria-hidden="true">✓</span>}
    </button></li>;
  }
  return <div className="cf-space-picker" ref={container} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <span className="cf-muted">Пространство</span>
    <button ref={trigger} type="button" className="cf-space-trigger" aria-label={`Пространство: ${selected?.name ?? (value || 'Выберите пространство')}`} aria-expanded={open} aria-haspopup="dialog" disabled={disabled} onClick={() => { setRecent(readRecentSpaces(origin)); setOpen(old => !old); setDirectory(false); setQuery(''); setCategory(''); }}>
      <span>{selected ? `${selected.name} · ${selected.key}` : value || 'Выберите пространство'}</span><span aria-hidden="true">{open ? '▴' : '▾'}</span>
    </button>
    {open && <div className="cf-space-popup" role="dialog" aria-label="Выбор пространства">
      <div className="cf-space-heading">Недавние пространства</div>
      <ul className="cf-space-list">{recentItems.map(item)}</ul>
      {!recentItems.length && <p className="cf-muted">Здесь появятся пространства, выбранные в DocBuilder.</p>}
      {!directory ? <WBButton size="sm" disabled={loading} onClick={() => setDirectory(true)}>Все пространства</WBButton> : <>
        <div className="cf-space-heading">Все пространства</div>
        <WBInput label="Поиск пространства" placeholder="Название или ключ, например DI" value={query} onChange={event => setQuery(event.target.value)} />
        <label className="cf-field">Категория / тег<select aria-label="Категория / тег" value={category} disabled={!categories.length} onChange={event => setCategory(event.target.value)}>
          <option value="">Все категории</option>{categories.map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>
        {!categories.length && <p className="cf-muted">Категории не переданы Confluence или локальным сервисом.</p>}
        <label className="cf-space-personal"><input type="checkbox" checked={personal} onChange={event => setPersonal(event.target.checked)} />Показать личные пространства</label>
        <ul className="cf-space-list cf-space-directory">{filtered.map(item)}</ul>
        {!filtered.length && !loading && <p className="cf-muted">Пространства не найдены. Проверьте поиск и фильтры.</p>}
      </>}
      {loading && <p className="cf-muted" role="status">Загрузка всех пространств…</p>}
    </div>}
  </div>;
}
