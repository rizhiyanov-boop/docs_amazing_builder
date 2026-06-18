import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContractSideAccordion } from './ContractSideAccordion';

describe('ContractSideAccordion', () => {
  it('renders side context and reports independent toggle state', () => {
    const onToggle = vi.fn();
    render(
      <ContractSideAccordion
        side="server"
        title="Server Request"
        parameterCount={8}
        metadata={['POST', 'REST']}
        open={false}
        onToggle={onToggle}
      >
        <div>Server fields</div>
      </ContractSideAccordion>
    );

    expect(screen.getByText('SERVER')).toBeInTheDocument();
    expect(screen.getByText('Server Request')).toBeInTheDocument();
    expect(screen.getByText('8 параметров · POST · REST')).toBeInTheDocument();

    const details = screen.getByText('Server Request').closest('details');
    expect(details).not.toHaveAttribute('open');
    if (!details) throw new Error('Contract details not found');
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('shows a parsing error indicator in the collapsed summary', () => {
    render(
      <ContractSideAccordion
        side="client"
        title="Client Response"
        parameterCount={1}
        error="Invalid JSON"
        open={false}
        onToggle={vi.fn()}
      >
        <div>Client fields</div>
      </ContractSideAccordion>
    );

    expect(screen.getByText('CLIENT')).toBeInTheDocument();
    expect(screen.getByText('1 параметр')).toBeInTheDocument();
    expect(screen.getByText('Ошибка парсинга')).toHaveAttribute('title', 'Invalid JSON');
  });

  it('supports a neutral single-contract context', () => {
    render(
      <ContractSideAccordion
        side="contract"
        title="Response"
        parameterCount={2}
        open={false}
        onToggle={vi.fn()}
      >
        <div>Response fields</div>
      </ContractSideAccordion>
    );

    expect(screen.getByText('CONTRACT')).toBeInTheDocument();
    expect(screen.getByText('Response')).toBeInTheDocument();
    expect(screen.getByText('2 параметра')).toBeInTheDocument();
  });
});
