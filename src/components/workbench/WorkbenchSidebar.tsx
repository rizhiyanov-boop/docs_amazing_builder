import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DocSection, MethodDocument, MethodGroup, RequestMethod } from '../../types';
import { HttpChip, SidebarItem, WBButton } from '../primitives/WorkbenchPrimitives';

type ServerProjectPreview = {
  id: string;
  name: string;
};

type ProjectSwitcherProps = {
  projectName: string;
  currentProjectId: string | null;
  serverProjects: ServerProjectPreview[];
  switchingProjectId: string | null;
  methodCounts: Record<string, number>;
  onSelectProject: (projectId: string | null) => void;
};

type WorkbenchSidebarProps = {
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
  getMethodHttpMethod: (method: MethodDocument) => RequestMethod;
  onSwitchMethod: (method: MethodDocument) => void;
  onSelectSection: (sectionId: string) => void;
  resolveSectionTitle: (section: DocSection) => string;
  onSelectProject: (projectId: string | null) => void;
  onCreateMethod: () => void;
  onCreateProject: () => void;
  onOpenSearch: () => void;
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
  currentProjectId,
  serverProjects,
  switchingProjectId,
  methodCounts,
  onSelectProject
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

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => {
          if (!hasProjects) return;
          setOpen((value) => !value);
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
  getMethodHttpMethod,
  onSwitchMethod,
  onSelectSection,
  resolveSectionTitle,
  onSelectProject,
  onCreateMethod,
  onCreateProject,
  onOpenSearch
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

  return (
    <aside className="wb-sidebar" style={{ position: 'relative' }}>
      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--wb-border)' }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--wb-text)', color: 'var(--wb-bg-surface)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>D</div>
        <ProjectSwitcher
          projectName={projectName}
          currentProjectId={currentProjectId}
          serverProjects={serverProjects}
          switchingProjectId={switchingProjectId}
          methodCounts={methodCounts}
          onSelectProject={onSelectProject}
        />
        <button type="button" onClick={onOpenSearch} style={{ border: 0, background: 'transparent', color: 'var(--wb-text-muted)', cursor: 'pointer', fontSize: 14 }}>⌘K</button>
      </div>

      <div style={{ padding: '8px' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--wb-bg-surface)',
            border: '1px solid var(--wb-border-soft)',
            borderRadius: 'var(--wb-radius-sm)',
            padding: '4px 8px',
            fontSize: 12,
            color: 'var(--wb-text-muted)'
          }}
        >
          <span aria-hidden>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск метода..."
            style={{
              minWidth: 0,
              flex: 1,
              border: 0,
              outline: 0,
              background: 'transparent',
              color: 'var(--wb-text)',
              fontFamily: 'var(--wb-font-sans)',
              fontSize: 12
            }}
          />
        </label>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {switchingProjectId && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--wb-bg-sidebar)',
            opacity: 0.7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            fontSize: 12,
            color: 'var(--wb-text-muted)'
          }}
          >
            Загрузка...
          </div>
        )}

        <div role="tree" aria-label="Сервисы, методы и секции" style={{ padding: '4px 0', height: '100%', overflowY: 'auto' }}>
          {visibleGroups.length === 0 ? (
            <div style={{ margin: 12, padding: 12, border: '1px dashed var(--wb-border-strong)', borderRadius: 'var(--wb-radius)', color: 'var(--wb-text-muted)', fontSize: 13 }}>
              Ничего не найдено
            </div>
          ) : (
            visibleGroups.map((group) => (
              <div key={group.id} style={{ marginBottom: 8 }}>
                <div role="treeitem" aria-expanded="true">
                  <SidebarItem emoji="▣" expandable expanded>{group.name}</SidebarItem>
                </div>
                {group.methods.map((method) => (
                  <div key={method.id}>
                    <div role="treeitem" aria-selected={method.id === activeMethodId}>
                      <SidebarItem depth={1} http={getMethodHttpMethod(method)} active={method.id === activeMethodId} onClick={() => onSwitchMethod(method)}>
                        {method.name}
                      </SidebarItem>
                    </div>
                    {method.id === activeMethodId && sections.map((section) => (
                      <div key={section.id} role="treeitem" aria-selected={section.id === selectedSectionId}>
                        <SidebarItem depth={2} active={section.id === selectedSectionId} dim={!section.enabled} onClick={() => onSelectSection(section.id)}>
                          {resolveSectionTitle(section)}
                        </SidebarItem>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--wb-border)', padding: 10, display: 'flex', gap: 6 }}>
        <WBButton size="sm" variant="accent" onClick={onCreateMethod} fullWidth>+ Метод</WBButton>
        <WBButton size="sm" variant="secondary" onClick={onCreateProject} fullWidth>+ Сервис</WBButton>
      </div>
    </aside>
  );
});

export function MethodHttpPreview({ method }: { method: RequestMethod }): ReactNode {
  return <HttpChip method={method} size="sm" />;
}
