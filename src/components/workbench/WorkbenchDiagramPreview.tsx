import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getDiagramImageUrl } from '../../diagramUtils';
import type { DiagramEngine } from '../../types';
import { MermaidLivePreview } from '../MermaidLivePreview';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.05;
const EMPTY_SIZE = { width: 0, height: 0 };
const EMPTY_VIEWPORT_METRICS = { width: 0, height: 0, paddingLeft: 0, paddingTop: 0 };

type DiagramSize = typeof EMPTY_SIZE;
type ViewportMetrics = typeof EMPTY_VIEWPORT_METRICS;

type WorkbenchDiagramPreviewProps = {
  code: string;
  engine: DiagramEngine;
  title: string;
};

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function readViewportMetrics(viewport: HTMLDivElement): ViewportMetrics {
  const styles = window.getComputedStyle(viewport);
  const paddingX = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
  const paddingY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);

  return {
    width: Math.max(1, viewport.clientWidth - paddingX),
    height: Math.max(1, viewport.clientHeight - paddingY),
    paddingLeft: Number.parseFloat(styles.paddingLeft) || 0,
    paddingTop: Number.parseFloat(styles.paddingTop) || 0
  };
}

export function WorkbenchDiagramPreview({ code, engine, title }: WorkbenchDiagramPreviewProps): ReactNode {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const dragRef = useRef({ active: false, x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const initialFitAppliedRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<DiagramSize>(EMPTY_SIZE);
  const [viewportSize, setViewportSize] = useState<ViewportMetrics>(EMPTY_VIEWPORT_METRICS);
  const [isModalContentReady, setIsModalContentReady] = useState(false);

  const updateViewportSize = useCallback((): ViewportMetrics => {
    const viewport = viewportRef.current;
    if (!viewport) return EMPTY_VIEWPORT_METRICS;

    const nextSize = readViewportMetrics(viewport);
    setViewportSize((current) => {
      if (current.width === nextSize.width && current.height === nextSize.height) return current;
      return nextSize;
    });
    return nextSize;
  }, []);

  const computeFitZoom = useCallback((size: DiagramSize): number => {
    const viewport = viewportRef.current;
    if (!viewport || size.width <= 0 || size.height <= 0) return 1;

    const viewportMetrics = readViewportMetrics(viewport);
    return clampZoom(Math.min(viewportMetrics.width / size.width, viewportMetrics.height / size.height));
  }, []);

  const measureNaturalSize = useCallback(() => {
    updateViewportSize();

    const host = contentRef.current;
    const previewNode = host?.querySelector<HTMLElement>('.diagram-preview');
    if (!previewNode) return;

    const nextSize = {
      width: Math.ceil(Math.max(previewNode.scrollWidth, previewNode.offsetWidth)),
      height: Math.ceil(Math.max(previewNode.scrollHeight, previewNode.offsetHeight))
    };

    if (nextSize.width <= 1 || nextSize.height <= 1) return;

    setNaturalSize((current) => {
      if (current.width === nextSize.width && current.height === nextSize.height) return current;
      return nextSize;
    });
    setFitZoom(computeFitZoom(nextSize));
  }, [computeFitZoom, updateViewportSize]);

  const applyFitZoom = useCallback(() => {
    updateViewportSize();
    const nextFitZoom = computeFitZoom(naturalSize);
    setFitZoom(nextFitZoom);
    setZoom(nextFitZoom);
    setIsModalContentReady(true);

    window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
  }, [computeFitZoom, naturalSize, updateViewportSize]);

  const openModal = useCallback(() => {
    initialFitAppliedRef.current = false;
    dragRef.current.active = false;
    setIsPanning(false);
    setZoom(1);
    setFitZoom(1);
    setNaturalSize(EMPTY_SIZE);
    setViewportSize(EMPTY_VIEWPORT_METRICS);
    setIsModalContentReady(false);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    function stopPanning(): void {
      dragRef.current.active = false;
      setIsPanning(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mouseup', stopPanning);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mouseup', stopPanning);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;

    const host = contentRef.current;
    if (!host) return undefined;
    const modalHost = host;

    let observedPreview: Element | null = null;
    const animationFrameId = window.requestAnimationFrame(measureNaturalSize);
    const delayedFrameId = window.requestAnimationFrame(() => window.requestAnimationFrame(measureNaturalSize));
    const timeoutId = window.setTimeout(measureNaturalSize, 350);
    const lateTimeoutId = window.setTimeout(measureNaturalSize, 900);

    if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') {
      window.addEventListener('resize', measureNaturalSize);
      return () => {
        window.cancelAnimationFrame(animationFrameId);
        window.cancelAnimationFrame(delayedFrameId);
        window.clearTimeout(timeoutId);
        window.clearTimeout(lateTimeoutId);
        window.removeEventListener('resize', measureNaturalSize);
      };
    }

    const resizeObserver = new ResizeObserver(() => measureNaturalSize());
    resizeObserver.observe(viewportRef.current ?? modalHost);

    function observePreview(): void {
      const previewNode = modalHost.querySelector('.diagram-preview');
      if (!previewNode || previewNode === observedPreview) return;
      if (observedPreview) resizeObserver.unobserve(observedPreview);
      resizeObserver.observe(previewNode);
      observedPreview = previewNode;
    }

    observePreview();

    const mutationObserver = new MutationObserver(() => {
      observePreview();
      measureNaturalSize();
    });
    mutationObserver.observe(modalHost, { attributes: true, childList: true, subtree: true });

    window.addEventListener('resize', measureNaturalSize);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.cancelAnimationFrame(delayedFrameId);
      window.clearTimeout(timeoutId);
      window.clearTimeout(lateTimeoutId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', measureNaturalSize);
    };
  }, [code, engine, isOpen, measureNaturalSize]);

  useLayoutEffect(() => {
    if (!isOpen || initialFitAppliedRef.current || naturalSize.width <= 0 || naturalSize.height <= 0) return;
    initialFitAppliedRef.current = true;
    const animationFrameId = window.requestAnimationFrame(applyFitZoom);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [applyFitZoom, isOpen, naturalSize]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const wheelViewport = viewport;

    function handleWheel(event: WheelEvent): void {
      event.preventDefault();
      event.stopPropagation();

      const currentZoom = zoomRef.current;
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextZoom = clampZoom(currentZoom + direction * ZOOM_STEP);
      if (nextZoom === currentZoom) return;

      const rect = wheelViewport.getBoundingClientRect();
      const viewportMetrics = readViewportMetrics(wheelViewport);
      const cursorX = event.clientX - rect.left - viewportMetrics.paddingLeft;
      const cursorY = event.clientY - rect.top - viewportMetrics.paddingTop;
      const currentContentWidth = naturalSize.width * currentZoom;
      const currentContentHeight = naturalSize.height * currentZoom;
      const currentCenterOffsetX = Math.max(0, (viewportMetrics.width - currentContentWidth) / 2);
      const currentCenterOffsetY = Math.max(0, (viewportMetrics.height - currentContentHeight) / 2);
      const pointX = (wheelViewport.scrollLeft + cursorX - currentCenterOffsetX) / currentZoom;
      const pointY = (wheelViewport.scrollTop + cursorY - currentCenterOffsetY) / currentZoom;

      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      window.requestAnimationFrame(() => {
        const viewportMetrics = readViewportMetrics(wheelViewport);
        const newContentWidth = naturalSize.width * nextZoom;
        const newContentHeight = naturalSize.height * nextZoom;
        const maxScrollLeft = Math.max(0, newContentWidth - viewportMetrics.width);
        const maxScrollTop = Math.max(0, newContentHeight - viewportMetrics.height);
        const nextCenterOffsetX = Math.max(0, (viewportMetrics.width - newContentWidth) / 2);
        const nextCenterOffsetY = Math.max(0, (viewportMetrics.height - newContentHeight) / 2);
        const nextScrollLeft = pointX * nextZoom + nextCenterOffsetX - cursorX;
        const nextScrollTop = pointY * nextZoom + nextCenterOffsetY - cursorY;

        wheelViewport.scrollLeft = newContentWidth <= viewportMetrics.width
          ? 0
          : Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
        wheelViewport.scrollTop = newContentHeight <= viewportMetrics.height
          ? 0
          : Math.max(0, Math.min(maxScrollTop, nextScrollTop));
      });
    }

    wheelViewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => wheelViewport.removeEventListener('wheel', handleWheel);
  }, [isOpen, naturalSize]);

  const zoomPercent = Math.round(zoom * 100);
  const renderedWidth = naturalSize.width * zoom;
  const renderedHeight = naturalSize.height * zoom;
  const centerOffsetX = Math.max(0, (viewportSize.width - renderedWidth) / 2);
  const centerOffsetY = Math.max(0, (viewportSize.height - renderedHeight) / 2);
  const spacerStyle = naturalSize.width > 0 && naturalSize.height > 0
    ? {
        width: Math.max(renderedWidth, viewportSize.width),
        height: Math.max(renderedHeight, viewportSize.height)
      }
    : undefined;

  const preview = engine === 'mermaid'
    ? <MermaidLivePreview code={code} />
    : (
        <div className="diagram-preview">
          <img className="diagram-preview-image" src={getDiagramImageUrl(engine, code, 'svg')} alt={title} loading="lazy" />
        </div>
      );

  const modal = isOpen
    ? createPortal(
        <div
          className="workbench-diagram-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div className="workbench-diagram-modal" role="dialog" aria-modal="true" aria-label={title}>
            <div className="workbench-diagram-modal-head">
              <div className="workbench-diagram-modal-title">{title}</div>
              <div className="workbench-diagram-toolbar" aria-label="Diagram zoom">
                <button
                  className="workbench-diagram-zoom-value"
                  type="button"
                  aria-label="Fit diagram to view"
                  title={`Fit to view (${Math.round(fitZoom * 100)}%)`}
                  onClick={applyFitZoom}
                >
                  {zoomPercent}%
                </button>
                <button
                  className="workbench-diagram-close-button"
                  type="button"
                  aria-label="Close diagram"
                  title="Close"
                  onClick={() => setIsOpen(false)}
                >
                  x
                </button>
              </div>
            </div>
            <div
              ref={viewportRef}
              className={`workbench-diagram-modal-viewport${isPanning ? ' is-panning' : ''}`}
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                const viewport = viewportRef.current;
                if (!viewport) return;
                dragRef.current = {
                  active: true,
                  x: event.clientX,
                  y: event.clientY,
                  scrollLeft: viewport.scrollLeft,
                  scrollTop: viewport.scrollTop
                };
                setIsPanning(true);
              }}
              onMouseMove={(event) => {
                const viewport = viewportRef.current;
                const drag = dragRef.current;
                if (!viewport || !drag.active) return;
                viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
                viewport.scrollTop = drag.scrollTop - (event.clientY - drag.y);
              }}
            >
              <div className="workbench-diagram-spacer" style={spacerStyle}>
                <div
                  ref={contentRef}
                  className="workbench-diagram-zoom-content"
                  style={{
                    left: centerOffsetX,
                    top: centerOffsetY,
                    transform: `scale(${zoom})`,
                    visibility: isModalContentReady ? 'visible' : 'hidden'
                  }}
                >
                  {engine === 'mermaid' && <MermaidLivePreview code={code} />}
                  {engine === 'plantuml' && (
                    <div className="diagram-preview">
                      <img
                        className="diagram-preview-image"
                        src={getDiagramImageUrl(engine, code, 'svg')}
                        alt={title}
                        loading="lazy"
                        onLoad={measureNaturalSize}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="workbench-diagram-shell">
      <button
        className="workbench-diagram-inline"
        type="button"
        aria-label={`Open diagram: ${title}`}
        onClick={openModal}
      >
        <span className="workbench-diagram-open-hint" aria-hidden="true">[]</span>
        {preview}
      </button>
      {modal}
    </div>
  );
}
