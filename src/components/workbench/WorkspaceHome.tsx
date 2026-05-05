import type { ReactNode } from 'react';
import type { MethodDocument, MethodGroup, RequestMethod } from '../../types';
import { HttpChip, WBButton } from '../primitives/WorkbenchPrimitives';

type WorkspaceHomeProps = {
  projectName: string;
  methods: MethodDocument[];
  groups: MethodGroup[];
  getMethodHttpMethod: (method: MethodDocument) => RequestMethod;
  onCreateMethod: () => void;
  onImportOpenApi: () => void;
  onCreateService: () => void;
  onOpenMethod: (method: MethodDocument) => void;
};

export function WorkspaceHome({ projectName, methods, groups, getMethodHttpMethod, onCreateMethod, onImportOpenApi, onCreateService, onOpenMethod }: WorkspaceHomeProps): ReactNode {
  return (
    <div style={{ padding: '40px 64px', maxWidth: 980, margin: '0 auto', color: 'var(--wb-text)' }}>
      <div style={{ fontSize: 42, marginBottom: 8 }}>▣</div>
      <h1 style={{ margin: 0, fontSize: 38, fontWeight: 700 }}>{projectName || 'doc-builder'}</h1>
      <p style={{ fontSize: 15, color: 'var(--wb-text-soft)', marginTop: 6, maxWidth: 580 }}>
        Workspace для API-документации. Методы сгруппированы по сервисам, а Workbench собирает документацию карточками.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <WBButton variant="accent" icon="+" onClick={onCreateMethod}>Новый метод</WBButton>
        <WBButton variant="secondary" icon="↑" onClick={onImportOpenApi}>Импорт OpenAPI</WBButton>
        <WBButton variant="ghost" icon="▣" onClick={onCreateService}>Новый сервис</WBButton>
      </div>

      <h2 style={{ marginTop: 32, marginBottom: 10, fontSize: 14, fontWeight: 700, color: 'var(--wb-text-soft)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Недавнее</h2>
      {methods.length === 0 ? (
        <div style={{ background: 'var(--wb-bg-surface)', border: '1px dashed var(--wb-border-strong)', borderRadius: 'var(--wb-radius-lg)', padding: 20, color: 'var(--wb-text-muted)' }}>Методов пока нет.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {methods.slice(0, 6).map((method) => (
            <button key={method.id} type="button" onClick={() => onOpenMethod(method)} style={{ background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 'var(--wb-radius)', boxShadow: 'var(--wb-shadow-card)', padding: 12, cursor: 'pointer', textAlign: 'left', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>□</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <HttpChip method={getMethodHttpMethod(method)} size="sm" />
                <span style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{method.name}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <h2 style={{ marginTop: 36, marginBottom: 10, fontSize: 14, fontWeight: 700, color: 'var(--wb-text-soft)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Структура проекта</h2>
      <div style={{ background: 'var(--wb-bg-surface)', borderRadius: 'var(--wb-radius-lg)', boxShadow: 'var(--wb-shadow-card)', padding: 16 }}>
        {(groups.length > 0 ? groups : [{ id: 'methods', name: 'Methods', methodIds: methods.map((method) => method.id), links: [] }]).map((group) => {
          const groupMethods = methods.filter((method) => group.methodIds.includes(method.id));
          return (
            <div key={group.id} style={{ display: 'grid', gridTemplateColumns: '32px minmax(160px, 1fr) 80px minmax(160px, 1fr)', padding: '10px 4px', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--wb-border-soft)', fontSize: 13 }}>
              <div>▣</div>
              <div style={{ fontWeight: 600 }}>{group.name}</div>
              <div style={{ color: 'var(--wb-text-muted)', fontSize: 12 }}>{groupMethods.length} методов</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {groupMethods.slice(0, 6).map((method) => <HttpChip key={method.id} method={getMethodHttpMethod(method)} size="sm" />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
