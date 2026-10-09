import React, { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { DocSection, MethodDocument, MethodGroup, RequestMethod } from '../../types';
import { HttpChip, SidebarItem, WBButton } from '../primitives/WorkbenchPrimitives';
import { WORKBENCH_FEATURES } from '../../workbenchFeatures';
import { WorkbenchIcon, type WorkbenchIconName } from './WorkbenchIcon';

type ServerProjectPreview = {
  id: string;
  name: string;
};

type ProjectSwitcherProps = {
  projectName: string;
  editingProjectName: boolean;
  editingProjectNameDraft: string;
  projectNameInputRef: RefObject<HTMLInputElement | null>;
  currentProjectId: string | null;
  serverProjects: ServerProjectPreview[];
  switchingProjectId: string | null;
  methodCounts: Record<string, number>;
  onSelectProject: (projectId: string | null) => void;
  onStartProjectRename: () => void;
  onProjectNameDraftChange: (value: string) => void;
  onFinishProjectRename: () => void;
  onCancelProjectRename: () => void;
};

type WorkbenchSidebarProps = {
  disabled?: boolean;
  projectName: string;
  methods: MethodDocument[];
  groups: MethodGroup[];
  activeMethodId: string | null | undefined;
  sections: DocSection[];
  selectedSectionId: string | null | undefined;
  serverProjects: ServerProjectPreview[];
  currentProjectId: string | null;
  switchingProjectId: string | null;
  methodCounts: Record<string, number>;
  editingProjectName: boolean;
  editingProjectNameDraft: string;
  projectNameInputRef: RefObject<HTMLInputElement | null>;
  editingMethodId: string | null;
  editingMethodNameDraft: string;
  methodNameInputRef: RefObject<HTMLInputElement | null>;
  getMethodHttpMethod: (method: MethodDocument) => RequestMethod;
  onSwitchMethod: (method: MethodDocument) => void;
  onSelectSection: (sectionId: string) => void;
  resolveSectionTitle: (section: DocSection) => string;
  onSelectProject: (projectId: string | null) => void;
  onStartProjectRename: () => void;
  onProjectNameDraftChange: (value: string) => void;
  onFinishProjectRename: () => void;
  onCancelProjectRename: () => void;
  onStartMethodRename: (method: MethodDocument) => void;
  onMethodNameDraftChange: (value: string) => void;
  onFinishMethodRename: () => void;
  onCancelMethodRename: () => void;
  onCreateMethod: () => void;
  onCreateProject: () => void;
  onOpenSearch: () => void;
  onDeleteActiveMethod?: () => void;
  canDeleteActiveMethod?: boolean;
};

function groupMethods(methods: MethodDocument[], groups: MethodGroup[]): Array<{ id: string; name: string; methods: MethodDocument[] }> {
  const byId = new Map(methods.map((method) => [method.id, method]));
  const used = new Set<string>();
  const grouped = groups
    .map((group) => {
      const groupMethods = group.methodIds.map((id) => byId.get(id)).filter((method): method is MethodDocument => Boolean(method));
      groupMethods.forEach((method) => used.add(method.id));
      return { id: group.id, name: group.name, methods: groupMethods };
    })
    .filter((group) => group.methods.length > 0);
  const ungrouped = methods.filter((method) => !used.has(method.id));
  return ungrouped.length > 0 ? [...grouped, { id: 'ungrouped', name: 'Methods', methods: ungrouped }] : grouped;
}

function ProjectSwitcher({
  projectName,
  editingProjectName,
  editingProjectNameDraft,
  projectNameInputRef,
  currentProjectId,
  serverProjects,
  switchingProjectId,
  methodCounts,
  onSelectProject,
  onStartProjectRename,
  onProjectNameDraftChange,
  onFinishProjectRename,
  onCancelProjectRename
}: ProjectSwitcherProps): ReactNode {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasProjects = serverProjects.length > 0;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (switchingProjectId) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [switchingProjectId]);

  function handleSelectProject(projectId: string): void {
    if (projectId === currentProjectId || switchingProjectId) return;
    onSelectProject(projectId);
  }

  if (editingProjectName) {
    return (
      <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <input
          ref={projectNameInputRef}
          type="text"
          value={editingProjectNameDraft}
          onChange={(event) => onProjectNameDraftChange(event.target.value)}
          onBlur={onFinishProjectRename}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              onFinishProjectRename();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancelProjectRename();
            }
          }}
          aria-label="Project name"
          style={{
            width: '100%',
            minWidth: 0,
            border: '1px solid var(--wb-border)',
            borderRadius: 'var(--wb-radius)',
            background: 'var(--wb-bg-surface)',
            color: 'var(--wb-text)',
            fontFamily: 'var(--wb-font-sans)',
            fontSize: 13,
            fontWeight: 700,
            padding: '5px 7px',
            outline: 'none'
          }}
        />
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => {
          if (!hasProjects) return;
          setOpen((value) => !value);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          setOpen(false);
          onStartProjectRename();
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: hasProjects ? 'pointer' : 'default',
          padding: '6px 4px',
          borderRadius: 'var(--wb-radius)',
          color: 'var(--wb-text)'
        }}
      >
        <span style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 700,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'left'
        }}
        >
          {projectName || 'doc-builder'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--wb-text-muted)', flexShrink: 0 }} aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          minWidth: 240,
          zIndex: 100,
          background: 'var(--wb-bg-surface)',
          border: '1px solid var(--wb-border)',
          borderRadius: 'var(--wb-radius-lg)',
          boxShadow: 'var(--wb-shadow-pop)',
          overflow: 'hidden',
          marginTop: 4
        }}
          role="listbox"
        >
          {serverProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              disabled={Boolean(switchingProjectId) || project.id === currentProjectId}
              onClick={() => handleSelectProject(project.id)}
              role="option"
              aria-selected={project.id === currentProjectId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 12px',
                background: project.id === currentProjectId ? 'var(--wb-bg-active)' : 'none',
                border: 'none',
                cursor: switchingProjectId || project.id === currentProjectId ? 'default' : 'pointer',
                fontSize: 13,
                color: 'var(--wb-text)',
                textAlign: 'left',
                opacity: switchingProjectId && switchingProjectId !== project.id ? 0.65 : 1
              }}
            >
              {switchingProjectId === project.id && (
                <span style={{ width: 14, flexShrink: 0, fontSize: 12, color: 'var(--wb-text-muted)' }} aria-hidden>
                  ⟳
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.name}
              </span>
              <span style={{
                fontSize: 11,
                color: 'var(--wb-text-muted)',
                fontFamily: 'var(--wb-font-mono)',
                flexShrink: 0,
                minWidth: 20,
                textAlign: 'right'
              }}
              >
                {methodCounts[project.id] ?? 0}
              </span>
              <span style={{ width: 12, flexShrink: 0, fontSize: 10, color: 'var(--wb-accent)', textAlign: 'right' }} aria-hidden>
                {project.id === currentProjectId && switchingProjectId !== project.id ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const WorkbenchSidebar = React.memo(function WorkbenchSidebar({
  disabled,
  projectName,
  methods,
  groups,
  activeMethodId,
  sections,
  selectedSectionId,
  serverProjects,
  currentProjectId,
  switchingProjectId,
  methodCounts,
  editingProjectName,
  editingProjectNameDraft,
  projectNameInputRef,
  editingMethodId,
  editingMethodNameDraft,
  methodNameInputRef,
  getMethodHttpMethod,
  onSwitchMethod,
  onSelectSection,
  resolveSectionTitle,
  onSelectProject,
  onStartProjectRename,
  onProjectNameDraftChange,
  onFinishProjectRename,
  onCancelProjectRename,
  onStartMethodRename,
  onMethodNameDraftChange,
  onFinishMethodRename,
  onCancelMethodRename,
  onCreateMethod,
  onCreateProject,
  onDeleteActiveMethod,
  canDeleteActiveMethod = false
}: WorkbenchSidebarProps): ReactNode {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    const tree = groupMethods(methods, groups);
    if (!normalizedQuery) return tree;
    return tree
      .map((group) => ({
        ...group,
        methods: group.methods.filter((method) => method.name.toLowerCase().includes(normalizedQuery))
      }))
      .filter((group) => group.methods.length > 0);
  }, [groups, methods, normalizedQuery]);

  const activeMethod = methods.find((method) => method.id === activeMethodId);
  const sectionIcon = (section: DocSection): WorkbenchIconName => {
    if (section.kind === 'diagram') return 'diagram';
    if (section.kind === 'errors') return 'alert';
    if (section.kind === 'parsed') return section.sectionType === 'request' ? 'export' : 'json';
    return section.id === 'functional' ? 'check' : 'document';
  };

  return (
    <aside className="wb-sidebar" style={{ position: 'relative' }} inert={disabled || undefined}>
      <div className="wb-sidebar-header">
        <span className="wb-sidebar-mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4C2 4 8 16 2 16c6 0 0 12 6 12M24 4c6 0 0 12 6 12-6 0 0 12-6 12" /><path d="M12 8h4c6 0 6 8 0 8h-4m0 0h5c6 0 6 8 0 8h-5V8" /></svg></span>
        {WORKBENCH_FEATURES.projects ? <ProjectSwitcher
          projectName={projectName}
          editingProjectName={editingProjectName}
          editingProjectNameDraft={editingProjectNameDraft}
          projectNameInputRef={projectNameInputRef}
          currentProjectId={currentProjectId}
          serverProjects={serverProjects}
          switchingProjectId={switchingProjectId}
          methodCounts={methodCounts}
          onSelectProject={onSelectProject}
          onStartProjectRename={onStartProjectRename}
          onProjectNameDraftChange={onProjectNameDraftChange}
          onFinishProjectRename={onFinishProjectRename}
          onCancelProjectRename={onCancelProjectRename}
        /> : <span className="wb-sidebar-brand">DocBuilder</span>}
      </div>

      <section className="wb-sidebar-methods" aria-label="Методы">
        <div className="wb-sidebar-search-wrap">
          <label className="wb-sidebar-search">
            <WorkbenchIcon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск метода..." aria-label="Поиск метода" />
          </label>
        </div>
        <nav className="wb-sidebar-method-list" aria-label="Методы">
          {switchingProjectId && <div className="wb-sidebar-loading" role="status">Загрузка...</div>}
          {visibleGroups.length === 0 ? <div className="wb-sidebar-empty">{methods.length ? 'Ничего не найдено' : 'Нет методов. Создайте первый метод.'}</div> : visibleGroups.map((group) => (
            <div key={group.id} className="wb-sidebar-method-group">
              {(WORKBENCH_FEATURES.projects || group.id !== 'ungrouped') && <div className="wb-sidebar-group-heading">{group.name}</div>}
              {group.methods.map((method) => {
                const isActiveMethod = method.id === activeMethodId;
                const isEditingMethod = editingMethodId === method.id;
                return (
                  <div key={method.id} className={`wb-sidebar-method-row${isActiveMethod ? ' is-active' : ''}`}>
                    {isEditingMethod ? (
                      <div className="wb-sidebar-rename">
                        <HttpChip method={getMethodHttpMethod(method)} size="sm" appearance="soft" />
                        <input
                          ref={methodNameInputRef}
                          type="text"
                          value={editingMethodNameDraft}
                          onChange={(event) => onMethodNameDraftChange(event.target.value)}
                          onBlur={onFinishMethodRename}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                            event.stopPropagation();
                            if (event.key === 'Enter') { event.preventDefault(); onFinishMethodRename(); }
                            if (event.key === 'Escape') { event.preventDefault(); onCancelMethodRename(); }
                          }}
                          aria-label="Method name"
                        />
                      </div>
                    ) : (
                      <>
                        <SidebarItem navigationKind="method" http={getMethodHttpMethod(method)} active={isActiveMethod} aria-current={isActiveMethod ? 'page' : undefined} onClick={() => onSwitchMethod(method)} onDoubleClick={() => onStartMethodRename(method)}>{method.name}</SidebarItem>
                        <div className="wb-sidebar-method-actions">
                          <button type="button" onClick={() => onStartMethodRename(method)} aria-label={`Переименовать ${method.name}`} title="Переименовать"><WorkbenchIcon name="edit" /></button>
                          {isActiveMethod && onDeleteActiveMethod && <button type="button" disabled={!canDeleteActiveMethod} onClick={onDeleteActiveMethod} aria-label={`Удалить ${method.name}`} title={canDeleteActiveMethod ? 'Удалить метод' : 'Нельзя удалить последний метод'}><WorkbenchIcon name="trash" /></button>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="wb-sidebar-footer">
          <WBButton size="sm" variant="secondary" className="wb-sidebar-create" icon={<WorkbenchIcon name="plus" />} onClick={onCreateMethod} fullWidth style={{ color: 'var(--wb-accent)', borderColor: 'var(--wb-accent-soft)' }}>Новый метод</WBButton>
          {WORKBENCH_FEATURES.projects && <WBButton size="sm" variant="secondary" onClick={onCreateProject} fullWidth>+ Сервис</WBButton>}
        </div>
      </section>

      <section className="wb-sidebar-sections" aria-labelledby="wb-sidebar-sections-heading">
        <div className="wb-sidebar-sections-header">
          <div className="wb-sidebar-list-heading"><span id="wb-sidebar-sections-heading">Разделы</span></div>
        </div>
        <nav className="wb-sidebar-section-list" aria-label="Разделы метода">
          {activeMethod ? sections.map((section) => (
            <SidebarItem key={section.id} navigationKind="section" emoji={<WorkbenchIcon name={sectionIcon(section)} />} active={section.id === selectedSectionId} dim={!section.enabled} aria-current={section.id === selectedSectionId ? 'location' : undefined} onClick={() => onSelectSection(section.id)}>{resolveSectionTitle(section)}</SidebarItem>
          )) : <div className="wb-sidebar-empty">Выберите метод для навигации по разделам.</div>}
        </nav>
      </section>
    </aside>
  );
});

export function MethodHttpPreview({ method }: { method: RequestMethod }): ReactNode {
  return <HttpChip method={method} size="sm" />;
}
