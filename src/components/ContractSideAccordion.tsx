import type { ReactNode } from 'react';

type ContractSideAccordionProps = {
  side: 'contract' | 'server' | 'client';
  title: string;
  parameterCount: number;
  metadata?: string[];
  error?: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  onboardingAnchor?: string;
  children: ReactNode;
};

function formatParameterCount(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return `${count} параметров`;
  if (remainder10 === 1) return `${count} параметр`;
  if (remainder10 >= 2 && remainder10 <= 4) return `${count} параметра`;
  return `${count} параметров`;
}

export function ContractSideAccordion({
  side,
  title,
  parameterCount,
  metadata = [],
  error,
  open,
  onToggle,
  onboardingAnchor,
  children
}: ContractSideAccordionProps): ReactNode {
  const summaryItems = [formatParameterCount(parameterCount), ...metadata.filter(Boolean)];

  return (
    <details
      className={`contract-side contract-side-${side}`}
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
      data-onboarding-anchor={onboardingAnchor}
    >
      <summary className="contract-side-summary">
        {side !== 'contract' && (
          <span className={`contract-side-badge contract-side-badge-${side}`}>{side.toUpperCase()}</span>
        )}
        <span className="contract-side-heading">
          <span className="contract-side-title">{title}</span>
          <span className="contract-side-meta">{summaryItems.join(' · ')}</span>
        </span>
        {error && <span className="contract-side-error" title={error}>Ошибка парсинга</span>}
      </summary>
      <div className="contract-side-body">{children}</div>
    </details>
  );
}
