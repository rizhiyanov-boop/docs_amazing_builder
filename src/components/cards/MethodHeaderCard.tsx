import type { ReactNode } from 'react';
import type { MethodDocument, RequestMethod, TextSection } from '../../types';
import { Card } from './Card';
import { HttpChip } from '../primitives/WorkbenchPrimitives';
import { richTextToPlainText } from '../../richText';

type MethodHeaderCardProps = {
  method: MethodDocument;
  httpMethod: RequestMethod;
  path: string;
};

export function MethodHeaderCard({ method, httpMethod, path }: MethodHeaderCardProps): ReactNode {
  const description = method.sections.find((section): section is TextSection => section.kind === 'text' && section.value.trim().length > 0)?.value ?? '';
  const endpoint = path || '/';

  function copyEndpoint(): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(`${httpMethod} ${endpoint}`);
    }
  }

  return (
    <Card draggableHandle={false}>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <HttpChip method={httpMethod} />
          <code style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 12, color: 'var(--wb-text-soft)' }}>{endpoint}</code>
          <button
            type="button"
            onClick={copyEndpoint}
            title="Скопировать endpoint"
            aria-label="Скопировать endpoint"
            style={{
              width: 28,
              height: 28,
              border: '1px solid var(--wb-border-soft)',
              borderRadius: 'var(--wb-radius-sm)',
              background: 'var(--wb-bg-soft)',
              color: 'var(--wb-text-soft)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ⧉
          </button>
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 700,
            fontFamily: 'var(--wb-font-sans)',
            color: 'var(--wb-text)',
            overflowWrap: 'anywhere'
          }}
        >
          {method.name || 'Untitled method'}
        </h1>
        {description && (
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--wb-text-soft)', lineHeight: 1.55, maxWidth: 680 }}>
            {richTextToPlainText(description).slice(0, 360)}
          </p>
        )}
      </div>
    </Card>
  );
}
