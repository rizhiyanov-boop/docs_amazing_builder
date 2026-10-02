import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfluenceSpacePicker } from './ConfluenceSpacePicker';
import { recentSpacesStorageKey, rememberSpace } from '../confluenceSpaces';
import type { ConfluenceSpace } from '../confluenceTypes';

afterEach(() => { cleanup(); localStorage.clear(); });
const origin = 'https://confluence.example';
const spaces: ConfluenceSpace[] = [
  { key: 'DI', name: 'Тестовое пространство интеграции', type: 'global', categories: ['integration'] },
  { key: 'FIN', name: 'Финансы', type: 'global', categories: ['finance'] },
  { key: '~user', name: 'Личное пространство', type: 'personal', categories: ['integration'] }
];

it('searches by key and category, hides personal spaces, and remembers only the selected key', async () => {
  const onChange = vi.fn();
  render(<ConfluenceSpacePicker spaces={spaces} value="DI" origin={origin} loading={false} disabled={false} onChange={onChange} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Пространство:/ }));
  await user.click(screen.getByRole('button', { name: 'Все пространства' }));
  expect(screen.queryByRole('button', { name: /Личное пространство/ })).toBeNull();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Категория / тег' }), 'integration');
  expect(screen.queryByRole('button', { name: /Финансы/ })).toBeNull();
  await user.type(screen.getByLabelText('Поиск пространства'), 'di');
  await user.click(screen.getByRole('button', { name: /Тестовое пространство интеграции.*DI/ }));
  expect(onChange).toHaveBeenCalledWith('DI');
  expect(localStorage.getItem(recentSpacesStorageKey(origin))).toBe('["DI"]');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('keeps recent personal spaces accessible and excludes inaccessible keys', async () => {
  rememberSpace(origin, 'MISSING'); rememberSpace(origin, '~user');
  render(<ConfluenceSpacePicker spaces={spaces} value="~user" origin={origin} loading={false} disabled={false} onChange={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Пространство:/ }));
  const popup = screen.getByRole('dialog', { name: 'Выбор пространства' });
  expect(within(popup).getByRole('button', { name: /Личное пространство/ })).toHaveAttribute('aria-pressed', 'true');
  expect(within(popup).queryByText('MISSING')).toBeNull();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: /^Пространство:/ })).toHaveFocus();
});

it('reveals personal spaces only on explicit request in the complete directory', async () => {
  render(<ConfluenceSpacePicker spaces={spaces} value="DI" origin={origin} loading={false} disabled={false} onChange={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Пространство:/ }));
  await user.click(screen.getByRole('button', { name: 'Все пространства' }));
  await user.click(screen.getByLabelText('Показать личные пространства'));
  expect(screen.getByRole('button', { name: /Личное пространство/ })).toBeInTheDocument();
});
