import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiRequestProgress } from './AiRequestProgress';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('AI request progress', () => {
  it('tracks elapsed time across stages and clears its timer after completion', () => {
    vi.useFakeTimers();
    const view = render(<AiRequestProgress message="Загружаем эпики…" />);
    expect(screen.getByRole('status', { name: 'Статус запроса к ИИ' })).toHaveTextContent('Прошло 0 с');
    act(() => { vi.advanceTimersByTime(22000); });
    expect(screen.getByText('Прошло 22 с · Ожидание продолжается.')).toHaveAttribute('aria-live', 'off');
    view.rerender(<AiRequestProgress message="Ожидаем ответ ИИ…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Ожидаем ответ ИИ…');
    expect(screen.getByRole('status')).toHaveTextContent('Прошло 22 с');
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
