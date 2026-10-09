import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocSection, MethodDocument } from '../../types';
import { WorkbenchSidebar } from './WorkbenchSidebar';

// Exercise the retained project implementation explicitly; production hides these tools.
const featureFlags = vi.hoisted(() => ({ projects: true }));
vi.mock('../../workbenchFeatures', () => ({ WORKBENCH_FEATURES: featureFlags }));

afterEach(() => {
  cleanup();
  featureFlags.projects = true;
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
  const onStartProjectRename = vi.fn();
  const onStartMethodRename = vi.fn();
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
    editingProjectName: false,
    editingProjectNameDraft: '',
    projectNameInputRef: createRef<HTMLInputElement>(),
    editingMethodId: null,
    editingMethodNameDraft: '',
    methodNameInputRef: createRef<HTMLInputElement>(),
    getMethodHttpMethod: () => 'POST',
    onSwitchMethod: vi.fn(),
    onSelectSection: vi.fn(),
    resolveSectionTitle: (section) => section.title,
    onSelectProject,
    onStartProjectRename,
    onProjectNameDraftChange: vi.fn(),
    onFinishProjectRename: vi.fn(),
    onCancelProjectRename: vi.fn(),
    onStartMethodRename,
    onMethodNameDraftChange: vi.fn(),
    onFinishMethodRename: vi.fn(),
    onCancelMethodRename: vi.fn(),
    onCreateMethod: vi.fn(),
    onCreateProject: vi.fn(),
    onOpenSearch: vi.fn(),
    ...overrides
  };

  return {
    ...render(<WorkbenchSidebar {...props} />),
    onSelectProject,
    onStartProjectRename,
    onStartMethodRename
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
        editingProjectName={false}
        editingProjectNameDraft=""
        projectNameInputRef={createRef<HTMLInputElement>()}
        editingMethodId={null}
        editingMethodNameDraft=""
        methodNameInputRef={createRef<HTMLInputElement>()}
        getMethodHttpMethod={() => 'POST'}
        onSwitchMethod={vi.fn()}
        onSelectSection={vi.fn()}
        resolveSectionTitle={(section) => section.title}
        onSelectProject={view.onSelectProject}
        onStartProjectRename={vi.fn()}
        onProjectNameDraftChange={vi.fn()}
        onFinishProjectRename={vi.fn()}
        onCancelProjectRename={vi.fn()}
        onStartMethodRename={vi.fn()}
        onMethodNameDraftChange={vi.fn()}
        onFinishMethodRename={vi.fn()}
        onCancelMethodRename={vi.fn()}
        onCreateMethod={vi.fn()}
        onCreateProject={vi.fn()}
        onOpenSearch={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('starts rename from double click on project and active method names', async () => {
    const user = userEvent.setup();
    const { onStartProjectRename, onStartMethodRename } = renderSidebar();
    const projectButton = screen.getAllByRole('button').find((button) => button.getAttribute('aria-haspopup') === 'listbox');

    expect(projectButton).toBeDefined();
    await user.dblClick(projectButton as HTMLButtonElement);
    expect(onStartProjectRename).toHaveBeenCalledTimes(1);

    await user.dblClick(screen.getByRole('button', { name: /^POST Create order$/i }));
    expect(onStartMethodRename).toHaveBeenCalledWith(methods[0]);
  });
});

describe('WorkbenchSidebar two-block production navigation', () => {
  it('keeps selected document sections available when the method filter has no matches', async () => {
    featureFlags.projects = false;
    const user = userEvent.setup();
    const onSelectSection = vi.fn();
    renderSidebar({ onSelectSection });
    await user.type(screen.getByRole('textbox', { name: 'Поиск метода' }), 'unmatched');
    expect(within(screen.getByRole('navigation', { name: 'Методы' })).getByText('Ничего не найдено')).toBeInTheDocument();
    const section = within(screen.getByRole('navigation', { name: 'Разделы метода' })).getByRole('button', { name: 'Goal' });
    expect(section).toHaveAttribute('aria-current', 'location');
    await user.click(section);
    expect(onSelectSection).toHaveBeenCalledWith('goal');
    expect(screen.queryByRole('button', { name: '+ Сервис' })).not.toBeInTheDocument();
  });

  it('routes method selection, rename, search and creation through existing callbacks', async () => {
    featureFlags.projects = false;
    const user = userEvent.setup();
    const onSwitchMethod = vi.fn(), onOpenSearch = vi.fn(), onCreateMethod = vi.fn();
    const view = renderSidebar({ onSwitchMethod, onOpenSearch, onCreateMethod });
    await user.click(screen.getByRole('button', { name: /^POST Create order$/ }));
    expect(onSwitchMethod).toHaveBeenCalledWith(methods[0]);
    await user.click(screen.getByRole('button', { name: 'Переименовать Create order' }));
    expect(view.onStartMethodRename).toHaveBeenCalledWith(methods[0]);
    expect(onSwitchMethod).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Новый метод' }));
    expect(screen.queryByRole('button', { name: 'Поиск по документации (Ctrl+K)' })).not.toBeInTheDocument();
    expect(onCreateMethod).toHaveBeenCalledTimes(1);
  });

  it('offers deletion only for the active method and respects the last-method guard', async () => {
    featureFlags.projects = false;
    const user = userEvent.setup();
    const onDeleteActiveMethod = vi.fn();
    const view = renderSidebar({ methods: [...methods, { ...methods[0], id: 'method-2', name: 'Second method' }], onDeleteActiveMethod, canDeleteActiveMethod: true });
    expect(screen.queryByRole('button', { name: 'Удалить Second method' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Удалить Create order' }));
    expect(onDeleteActiveMethod).toHaveBeenCalledTimes(1);
    view.unmount();
    renderSidebar({ onDeleteActiveMethod, canDeleteActiveMethod: false });
    const guarded = screen.getByRole('button', { name: 'Удалить Create order' });
    expect(guarded).toBeDisabled();
    await user.click(guarded);
    expect(onDeleteActiveMethod).toHaveBeenCalledTimes(1);
  });

  it('preserves keyboard rename and navigation to dim sections', async () => {
    featureFlags.projects = false;
    const user = userEvent.setup();
    const onFinishMethodRename = vi.fn(), onCancelMethodRename = vi.fn(), onSelectSection = vi.fn();
    renderSidebar({ editingMethodId: 'method-1', editingMethodNameDraft: 'Draft name', onFinishMethodRename, onCancelMethodRename, onSelectSection, sections: [{ ...sections[0], enabled: false }] });
    await user.click(screen.getByRole('textbox', { name: 'Method name' }));
    await user.keyboard('{Enter}');
    expect(onFinishMethodRename).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onCancelMethodRename).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Goal' }));
    expect(onSelectSection).toHaveBeenCalledWith('goal');
  });
});
