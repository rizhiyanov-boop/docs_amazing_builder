import { useMemo, useState, type ReactNode } from 'react';
import type { DocSection, MethodDocument, MethodGroup, RequestMethod } from '../../types';
import { HttpChip, SidebarItem, WBButton } from '../primitives/WorkbenchPrimitives';

type ServerProjectPreview = {
  id: string;
  name: string;
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

export function WorkbenchSidebar({
  projectName,
  methods,
  groups,
  activeMethodId,
  sections,
  selectedSectionId,
  serverProjects,
  currentProjectId,
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
    <aside className="wb-sidebar">
      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--wb-border)' }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--wb-text)', color: 'var(--wb-bg-surface)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>D</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--wb-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName || 'doc-builder'}</div>
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
          <span aria-hidden="true">⌕</span>
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

      <div role="tree" aria-label="Проекты, методы и секции" style={{ padding: '4px 0', flex: 1, overflowY: 'auto' }}>
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

      <div style={{ borderTop: '1px solid var(--wb-border)', padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wb-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Workspace</div>
        <select
          value={currentProjectId ?? ''}
          onChange={(event) => onSelectProject(event.target.value || null)}
          style={{
            width: '100%',
            background: 'var(--wb-bg-surface)',
            border: '1px solid var(--wb-border-soft)',
            borderRadius: 'var(--wb-radius-sm)',
            color: 'var(--wb-text)',
            fontFamily: 'var(--wb-font-sans)',
            fontSize: 12,
            padding: '6px 8px'
          }}
          title={projectName}
        >
          <option value="">{projectName}</option>
          {serverProjects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          <WBButton size="sm" variant="accent" onClick={onCreateMethod} fullWidth>+ Метод</WBButton>
          <WBButton size="sm" variant="secondary" onClick={onCreateProject} fullWidth>+ Сервис</WBButton>
        </div>
      </div>
    </aside>
  );
}

export function MethodHttpPreview({ method }: { method: RequestMethod }): ReactNode {
  return <HttpChip method={method} size="sm" />;
}
