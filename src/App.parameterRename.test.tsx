import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import App from './App';
import { makeParsedRow, makeRequestSection } from './test/fixtures';

const key = 'doc-builder-project-v2';
const row = (field: string, type = 'string') => makeParsedRow({ field, sourceField: field, type, description: `Description ${field}` });
function setup(domainModelEnabled = false, sharedClient = false) {
  const section = makeRequestSection({ domainModelEnabled, input: '{"customer":{"name":"Ann","id":"1"},"client":{}}',
    rows: [row('customer', 'object'), row('customer.name'), row('customer.id'), row('client', 'object')],
    clientRows: [row('request', 'object'), row('request.key')], clientMappings: sharedClient ? { 'customer.id': 'request.key', 'customer.name': 'request.key' } : { 'customer.id': 'request.key' } });
  localStorage.setItem('doc-builder-onboarding-entry-suppressed-v1', '1');
  localStorage.setItem(key, JSON.stringify({ version: 3, projectName: 'Rename test', activeMethodId: 'rename', methods: [{ id: 'rename', name: 'Rename method', sections: [section] }], groups: [] }));
  render(<App />);
  const user = userEvent.setup();
  const bodyRow = (description: string) => screen.getByText(description).closest('tr')!;
  return { user, bodyRow };
}
afterEach(() => { cleanup(); localStorage.clear(); });

it('edits only the leaf in place, preserves its prefix and refuses a sibling collision', async () => {
  const { user, bodyRow } = setup();
  await user.click(document.querySelector('.contract-side-title')!);
  const leaf = bodyRow('Description customer.name');
  await user.click(within(leaf).getByRole('button', { name: 'Редактировать поле', exact: true }));
  const input = within(leaf).getByRole('textbox', { name: 'Имя параметра' });
  expect(input).toHaveValue('name');
  expect(within(leaf).getByText('customer.')).toBeInTheDocument();
  expect(within(leaf).queryByRole('button', { name: /Сохранить|Отменить/ })).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'id' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('Имя уже занято');
  await user.click(within(bodyRow('Description client')).getByRole('button', { name: 'Редактировать поле', exact: true }));
  expect(screen.getByRole('textbox', { name: 'Имя параметра' })).toHaveValue('id');
  expect(screen.getByRole('textbox', { name: 'Имя параметра' }).closest('tr')).toBe(leaf);
  fireEvent.change(input, { target: { value: 'fullName' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(bodyRow('Description customer.name')).toHaveTextContent('fullName'));
  expect(bodyRow('Description customer.id')).toHaveTextContent('id');
});

it('renames an object as one undoable operation while preserving client links and source text', async () => {
  const { user, bodyRow } = setup(true);
  await user.click(document.querySelector('.contract-side-title')!);
  await user.click(within(bodyRow('Description customer')).getByRole('button', { name: 'Редактировать поле', exact: true }));
  const input = screen.getByRole('textbox', { name: 'Имя параметра' });
  expect(screen.getByText('Обновятся пути вложенных полей: 2')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'buyer' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(bodyRow('Description customer.id')).toHaveTextContent('buyer.');
  expect(bodyRow('Description customer.id')).toHaveTextContent('request.');
  await waitFor(() => {
    const stored = JSON.parse(localStorage.getItem(key)!);
    const section = stored.methods[0].sections.find((s: { kind: string }) => s.kind === 'parsed');
    expect(section.input).toBe('{"customer":{"name":"Ann","id":"1"},"client":{}}');
    expect(section.rows.find((r: { field: string }) => r.field === 'buyer.id').sourceField).toBe('customer.id');
    expect(section.clientMappings['customer.id']).toBe('request.key');
  });
  await user.click(screen.getByRole('button', { name: /^Отменить/ }));
  expect(bodyRow('Description customer')).toHaveTextContent('customer');
  expect(bodyRow('Description customer.id')).toHaveTextContent('customer.');
  expect(bodyRow('Description customer.id')).toHaveTextContent('request.');
});

it('renames the mapped client name independently and persists the server link', async () => {
  const { user, bodyRow } = setup(true, true);
  await user.click(document.querySelector('.contract-side-title')!);
  const mapped = bodyRow('Description customer.id');
  await user.click(within(mapped).getByRole('button', { name: 'Редактировать client поле', exact: true }));
  const input = screen.getByRole('textbox', { name: 'Имя параметра' });
  expect(screen.getAllByRole('textbox', { name: 'Имя параметра' })).toHaveLength(1);
  expect(input).toHaveValue('key');
  fireEvent.change(input, { target: { value: 'reference' } });
  fireEvent.blur(input);
  expect(bodyRow('Description customer.id')).toHaveTextContent('reference');
  expect(bodyRow('Description customer.id')).toHaveTextContent('customer.');
  expect(bodyRow('Description customer.name')).toHaveTextContent('reference');
});

it('renames an unmapped client container and updates its mapped child without renaming Server', async () => {
  const { user, bodyRow } = setup(true);
  await user.click(document.querySelector('.contract-side-title')!);
  await user.click(within(bodyRow('Description request')).getByRole('button', { name: 'Редактировать client поле', exact: true }));
  const input = screen.getByRole('textbox', { name: 'Имя параметра' });
  expect(input).toHaveValue('request');
  fireEvent.change(input, { target: { value: 'payload' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(bodyRow('Description customer.id')).toHaveTextContent('payload.');
  expect(bodyRow('Description customer.id')).toHaveTextContent('customer.');
  await user.click(screen.getByRole('button', { name: /^Отменить/ }));
  expect(bodyRow('Description customer.id')).toHaveTextContent('request.');
});
