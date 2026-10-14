import '@testing-library/jest-dom/vitest';

// jsdom lacks Range geometry; ProseMirror reads it when keyboard focus enters text.
if (!Range.prototype.getBoundingClientRect) {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { value: () => new DOMRect(), configurable: true, writable: true });
}
if (!Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    value: () => Object.assign([new DOMRect()], { item: (index: number) => index === 0 ? new DOMRect() : null }),
    configurable: true,
    writable: true
  });
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  });
}

if (!window.ResizeObserver) {
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock
  });
}

if (!window.URL.createObjectURL) {
  Object.defineProperty(window.URL, 'createObjectURL', {
    writable: true,
    value: () => 'blob:mock'
  });
}

if (!window.URL.revokeObjectURL) {
  Object.defineProperty(window.URL, 'revokeObjectURL', {
    writable: true,
    value: () => {}
  });
}
