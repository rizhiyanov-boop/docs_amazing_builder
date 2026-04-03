import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getDiagramImageUrl } from '../diagramUtils';

type MermaidLivePreviewProps = {
  code: string;
};

export function MermaidLivePreview({ code }: MermaidLivePreviewProps): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [fallbackLoadFailed, setFallbackLoadFailed] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function renderDiagram(): Promise<void> {
      const host = hostRef.current;
      if (!host) return;

      const source = code.trim();
      if (!source) {
        host.innerHTML = '';
        setError('');
        setFallbackUrl('');
        setFallbackLoadFailed(false);
        return;
      }

      try {
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
        const graphId = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg } = await mermaid.render(graphId, source);
        if (!isActive) return;
        host.innerHTML = svg;

        const renderedSvg = host.querySelector('svg');
        if (renderedSvg) {
          renderedSvg.classList.add('diagram-mermaid-svg');
          const viewBox = renderedSvg.getAttribute('viewBox')?.trim();
          if (viewBox) {
            const parts = viewBox.split(/\s+/).map((part) => Number(part));
            if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3]) && parts[2] > 0 && parts[3] > 0) {
              renderedSvg.setAttribute('width', String(parts[2]));
              renderedSvg.setAttribute('height', String(parts[3]));
            }
          }
        }

        setError('');
        setFallbackUrl('');
        setFallbackLoadFailed(false);
      } catch (diagramError) {
        if (!isActive) return;
        host.innerHTML = '';
        setError(diagramError instanceof Error ? diagramError.message : 'Ошибка Mermaid рендера');
        setFallbackUrl(getDiagramImageUrl('mermaid', source, 'svg'));
        setFallbackLoadFailed(false);
      }
    }

    void renderDiagram();

    return () => {
      isActive = false;
    };
  }, [code]);

  return (
    <div className="diagram-preview">
      <div ref={hostRef} className="diagram-preview-canvas" />
      {fallbackUrl && !fallbackLoadFailed && (
        <img
          className="diagram-preview-image"
          src={fallbackUrl}
          alt="Mermaid preview"
          loading="lazy"
          onError={() => setFallbackLoadFailed(true)}
        />
      )}
      {error && <div className="inline-error">{error}</div>}
    </div>
  );
}
