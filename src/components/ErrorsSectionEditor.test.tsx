import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorsSectionEditor } from './ErrorsSectionEditor';

describe('ErrorsSectionEditor', () => {
  it('shows the errors table and hides the validation rules table', () => {
    render(
      <ErrorsSectionEditor
        section={{
          id: 'errors',
          title: 'Ошибки',
          enabled: true,
          kind: 'errors',
          rows: [{
            clientHttpStatus: '400',
            clientResponse: 'Bad request',
            clientResponseCode: '',
            trigger: 'Validation failed',
            errorType: 'BusinessException',
            serverHttpStatus: '400',
            internalCode: '100101',
            message: 'Bad request',
            responseCode: ''
          }],
          validationRules: [{
            parameter: 'request.id',
            validationCase: 'NotNull',
            condition: '',
            cause: 'request.id must not be null'
          }]
        }}
        sections={[]}
        validationCaseOptions={['NotNull']}
        openInternalCodeKey={null}
        highlightedInternalCodeIndex={-1}
        internalCodePopoverState={null}
        internalCodeAnchorRefs={{ current: {} }}
        internalCodePopoverRef={{ current: null }}
        setOpenInternalCodeKey={vi.fn()}
        setHighlightedInternalCodeIndex={vi.fn()}
        updateErrorRow={vi.fn()}
        formatClientResponseCode={vi.fn()}
        applyInternalCode={vi.fn()}
        formatErrorResponseCode={vi.fn()}
        deleteErrorRow={vi.fn()}
        addErrorRow={vi.fn()}
        updateValidationRuleRow={vi.fn()}
        deleteValidationRuleRow={vi.fn()}
        addValidationRuleRow={vi.fn()}
        autofillValidationRulesFromRequestSchema={vi.fn()}
        getSectionRows={() => []}
        getDynamicTextareaRows={() => 1}
        validateJsonDraft={() => ''}
        renderUiIcon={(name) => name}
      />
    );

    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'Client HTTP Status' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'cause' })).not.toBeInTheDocument();
  });
});
