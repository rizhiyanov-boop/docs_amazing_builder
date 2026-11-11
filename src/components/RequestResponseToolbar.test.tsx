import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParsedSection } from '../types';
import { RequestResponseToolbar } from './RequestResponseToolbar';

afterEach(() => {
  cleanup();
});

const mockSection: ParsedSection = {
  id: 's_req',
  title: 'Request',
  enabled: true,
  kind: 'parsed',
  sectionType: 'request',
  format: 'json',
  input: '',
  rows: [],
  error: ''
};

describe('RequestResponseToolbar', () => {
  it('renders dual model segments and triggers onSideChange', () => {
    const onSideChange = vi.fn();
    render(
      <RequestResponseToolbar
        section={mockSection}
        activeSide="server"
        onSideChange={onSideChange}
        serverCount={8}
        clientCount={6}
        mappedCount={6}
        isImportOpen={false}
        onToggleImport={vi.fn()}
        onAddParameter={vi.fn()}
        isDualModel={true}
      />
    );

    expect(screen.getByText('Сервер (Master)')).toBeInTheDocument();
    expect(screen.getByText('Клиент (BFF)')).toBeInTheDocument();
    expect(screen.getByText('Маппинг')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Клиент (BFF)'));
    expect(onSideChange).toHaveBeenCalledWith('client');

    fireEvent.click(screen.getByText('Маппинг'));
    expect(onSideChange).toHaveBeenCalledWith('mapping');
  });

  it('renders single model badge when dual model is disabled', () => {
    render(
      <RequestResponseToolbar
        section={mockSection}
        activeSide="server"
        onSideChange={vi.fn()}
        serverCount={5}
        clientCount={0}
        mappedCount={0}
        isImportOpen={false}
        onToggleImport={vi.fn()}
        onAddParameter={vi.fn()}
        isDualModel={false}
      />
    );

    expect(screen.getByText('Контракт')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.queryByText('Клиент (BFF)')).not.toBeInTheDocument();
  });

  it('triggers onToggleImport and onAddParameter', () => {
    const onToggleImport = vi.fn();
    const onAddParameter = vi.fn();

    render(
      <RequestResponseToolbar
        section={mockSection}
        activeSide="server"
        onSideChange={vi.fn()}
        serverCount={3}
        clientCount={2}
        mappedCount={2}
        isImportOpen={false}
        onToggleImport={onToggleImport}
        onAddParameter={onAddParameter}
        isDualModel={true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Импорт/i }));
    expect(onToggleImport).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Server параметр/i }));
    expect(onAddParameter).toHaveBeenCalledTimes(1);
  });
});
