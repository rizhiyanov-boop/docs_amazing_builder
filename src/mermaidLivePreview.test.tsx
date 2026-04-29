import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MermaidLivePreview } from './components/MermaidLivePreview';

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn()
}));

vi.mock('mermaid', () => ({
  default: mermaidMock
}));

describe('MermaidLivePreview', () => {
  beforeEach(() => {
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockResolvedValue({ svg: '<svg viewBox="0 0 10 10"></svg>' });
  });

  it('initializes mermaid in strict security mode', async () => {
    render(<MermaidLivePreview code="flowchart TD&#10;A-->B" />);

    await waitFor(() => {
      expect(mermaidMock.initialize).toHaveBeenCalledWith({ startOnLoad: false, securityLevel: 'strict' });
    });
  });
});
