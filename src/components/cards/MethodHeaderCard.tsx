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
  return (
    <Card draggableHandle={false}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingTop: 6 }}>
        <div style={{ fontSize: 36, lineHeight: 1 }} aria-hidden="true">✎</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <HttpChip method={httpMethod} />
            <code style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 12, color: 'var(--wb-text-soft)' }}>{path || '/'}</code>
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
      </div>
    </Card>
  );
}
