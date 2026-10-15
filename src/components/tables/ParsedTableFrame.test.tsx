import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParsedTableFrame } from './ParsedTableFrame';

afterEach(cleanup);

function renderFrame() {
  render(<ParsedTableFrame columns={['field', 'type', 'description', 'example']} fieldColumnWidth={320} label="Parameters">
    <thead><tr><th data-column="field">Field</th><th>Type</th><th>Description</th><th>Example</th></tr></thead>
    <tbody><tr><td data-column="field"><input aria-label="Field name" defaultValue="customer.id" /></td><td><input aria-label="Type" defaultValue="string" /></td><td>Description</td><td>Example</td></tr></tbody>
  </ParsedTableFrame>);
  const viewport = screen.getByRole('region', { name: 'Parameters' });
  function resize(clientWidth: number, scrollWidth: number) {
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: clientWidth },
      scrollWidth: { configurable: true, value: scrollWidth }
    });
    fireEvent(window, new Event('resize'));
  }
  return { viewport, resize };
}

describe('ParsedTableFrame', () => {
  it('keeps both directions stable and disables the button at each edge', () => {
    const { viewport, resize } = renderFrame();
    const scrollBy = vi.fn();
    Object.defineProperty(viewport, 'scrollBy', { value: scrollBy });
    resize(800, 1400);
    const left = screen.getByRole('button', { name: 'Показать колонки слева: Parameters' });
    const right = screen.getByRole('button', { name: 'Показать колонки справа: Parameters' });
    expect(left).toBeDisabled();
    fireEvent.click(right);
    expect(scrollBy).toHaveBeenCalledWith({ left: 384, behavior: 'auto' });
    viewport.scrollLeft = 599.5;
    fireEvent.scroll(viewport);
    expect(right).toBeDisabled();
    expect(left).toBeEnabled();
    fireEvent.click(left);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -384, behavior: 'auto' });
    viewport.scrollLeft = 200;
    resize(400, 1400);
    expect(left).toBeEnabled();
    expect(right).toBeEnabled();
    fireEvent.click(left);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -320, behavior: 'auto' });
    viewport.scrollLeft = 0;
    resize(1400, 1400);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reveals keyboard focus hidden behind the pinned field without scrolling the page', () => {
    const { viewport, resize } = renderFrame();
    resize(800, 1400);
    const scrollBy = vi.fn();
    Object.defineProperty(viewport, 'scrollBy', { value: scrollBy });
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 900 } as DOMRect);
    const field = screen.getByRole('textbox', { name: 'Field name' });
    vi.spyOn(field.closest('td')!, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 420 } as DOMRect);
    const type = screen.getByRole('textbox', { name: 'Type' });
    const rect = vi.spyOn(type, 'getBoundingClientRect').mockReturnValue({ left: 300, right: 436 } as DOMRect);
    fireEvent.focus(type);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -128, behavior: 'auto' });
    rect.mockReturnValue({ left: 850, right: 986 } as DOMRect);
    fireEvent.focus(type);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 94, behavior: 'auto' });
    scrollBy.mockClear();
    fireEvent.focus(field);
    expect(scrollBy).not.toHaveBeenCalled();
    resize(400, 1400);
    rect.mockReturnValue({ left: 300, right: 436 } as DOMRect);
    fireEvent.focus(type);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('preserves column widths and editing values while disabling pinning on narrow panes', () => {
    const { viewport, resize } = renderFrame();
    const frame = viewport.parentElement!;
    const table = viewport.querySelector('table')!;
    resize(800, 1400);
    expect(frame).toHaveAttribute('data-sticky-field', 'true');
    expect(table.style.minWidth).toBe('960px');
    fireEvent.change(screen.getByRole('textbox', { name: 'Field name' }), { target: { value: 'customer.profile.id' } });
    viewport.scrollLeft = 200;
    fireEvent.scroll(viewport);
    expect(frame).toHaveAttribute('data-scrolled', 'true');
    resize(400, 1400);
    expect(frame).toHaveAttribute('data-sticky-field', 'false');
    expect(table.style.minWidth).toBe('960px');
    expect(screen.getByRole('textbox', { name: 'Field name' })).toHaveValue('customer.profile.id');
  });
});
