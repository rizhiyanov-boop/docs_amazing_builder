import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocSection, MethodDocument } from '../../types';
import { WorkbenchSidebar } from './WorkbenchSidebar';

afterEach(() => {
  cleanup();
});

const methods: MethodDocument[] = [
  {
    id: 'method-1',
    name: 'Create order',
    updatedAt: '2026-05-07T00:00:00.000Z',
    sections: []
  }
];

const sections: DocSection[] = [
  {
    id: 'goal',
    title: 'Goal',
    enabled: true,
    kind: 'text',
    value: ''
  }
];

function renderSidebar(overrides: Partial<Parameters<typeof WorkbenchSidebar>[0]> = {}) {
  const onSelectProject = vi.fn();
  const props: Parameters<typeof WorkbenchSidebar>[0] = {
    projectName: 'Документация для партнёров',
    methods,
    groups: [],
    activeMethodId: 'method-1',
    sections,
    selectedSectionId: 'goal',
    serverProjects: [
      { id: 'project-1', name: 'Документация для партнёров' },
      { id: 'project-2', name: 'ГРК сервис оформления длинное название' },
      { id: 'project-3', name: 'Orders API' }
    ],
    currentProjectId: 'project-1',
    switchingProjectId: null,
    methodCounts: {
      'project-1': 4,
      'project-2': 12,
      'project-3': 0
    },
    getMethodHttpMethod: () => 'POST',
    onSwitchMethod: vi.fn(),
    onSelectSection: vi.fn(),
    resolveSectionTitle: (section) => section.title,
    onSelectProject,
    onCreateMethod: vi.fn(),
    onCreateProject: vi.fn(),
    onOpenSearch: vi.fn(),
    ...overrides
  };

  return {
    ...render(<WorkbenchSidebar {...props} />),
    onSelectProject
  };
}

describe('WorkbenchSidebar project switcher', () => {
  it('opens project dropdown with counts and without the unsupported folder emoji', async () => {
    const user = userEvent.setup();
    const { container } = renderSidebar();

    expect(container.querySelector('select')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('🗂');

    await user.click(screen.getByRole('button', { name: /Документация для партнёров/i }));

    expect(screen.getByRole('listbox')).toHaveStyle({ minWidth: '240px' });
    expect(screen.getByText('ГРК сервис оформления длинное название')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(container.textContent).toContain('✓');
  });

  it('ignores current project selection and keeps dropdown open while selecting a different project', async () => {
    const user = userEvent.setup();
    const { onSelectProject } = renderSidebar();

    await user.click(screen.getByRole('button', { name: /Документация для партнёров/i }));
    await user.click(screen.getByRole('option', { name: /Документация для партнёров/i }));
    expect(onSelectProject).not.toHaveBeenCalled();

    await user.click(screen.getByRole('option', { name: /ГРК сервис оформления длинное название/i }));
    expect(onSelectProject).toHaveBeenCalledWith('project-2');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('shows project switching state and blocks project selection while loading', async () => {
    const user = userEvent.setup();
    const { onSelectProject } = renderSidebar({ switchingProjectId: 'project-2' });

    expect(screen.getByText('Загрузка...')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Документация для партнёров/i }));

    expect(screen.getByText('⟳')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /ГРК сервис оформления длинное название/i })).toBeDisabled();
    await user.click(screen.getByRole('option', { name: /Orders API/i }));
    expect(onSelectProject).not.toHaveBeenCalled();
  });

  it('closes dropdown after project switching completes', async () => {
    const user = userEvent.setup();
    const view = renderSidebar({ switchingProjectId: 'project-2' });

    await user.click(screen.getByRole('button', { name: /Документация для партнёров/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    view.rerender(
      <WorkbenchSidebar
        projectName="ГРК сервис оформления длинное название"
        methods={methods}
        groups={[]}
        activeMethodId="method-1"
        sections={sections}
        selectedSectionId="goal"
        serverProjects={[
          { id: 'project-1', name: 'Документация для партнёров' },
          { id: 'project-2', name: 'ГРК сервис оформления длинное название' },
          { id: 'project-3', name: 'Orders API' }
        ]}
        currentProjectId="project-2"
        switchingProjectId={null}
        methodCounts={{ 'project-1': 4, 'project-2': 12, 'project-3': 0 }}
        getMethodHttpMethod={() => 'POST'}
        onSwitchMethod={vi.fn()}
        onSelectSection={vi.fn()}
        resolveSectionTitle={(section) => section.title}
        onSelectProject={view.onSelectProject}
        onCreateMethod={vi.fn()}
        onCreateProject={vi.fn()}
        onOpenSearch={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
});
