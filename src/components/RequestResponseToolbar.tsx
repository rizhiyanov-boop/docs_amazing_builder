import type { ReactNode } from 'react';
import type { ParsedSection } from '../types';
import { WBButton } from './primitives/WorkbenchPrimitives';
import { WorkbenchIcon } from './workbench/WorkbenchIcon';

export type RequestActiveSide = 'server' | 'client' | 'mapping';

export type RequestResponseToolbarProps = {
  section: ParsedSection;
  activeSide: RequestActiveSide;
  onSideChange: (side: RequestActiveSide) => void;
  serverCount: number;
  clientCount: number;
  mappedCount: number;
  isImportOpen: boolean;
  onToggleImport: () => void;
  onAddParameter: () => void;
  onAiDescriptions?: () => void;
  onAiMasking?: () => void;
  aiBusy?: boolean;
  isDualModel: boolean;
};

export function RequestResponseToolbar({
  activeSide,
  onSideChange,
  serverCount,
  clientCount,
  mappedCount,
  isImportOpen,
  onToggleImport,
  onAddParameter,
  onAiDescriptions,
  onAiMasking,
  aiBusy,
  isDualModel
}: RequestResponseToolbarProps): ReactNode {
  return (
    <div className="cf-request-toolbar">
      {/* Segmented Control */}
      {isDualModel ? (
        <div className="cf-request-segments" role="tablist" aria-label="Сторона контракта">
          <button
            type="button"
            role="tab"
            aria-selected={activeSide === 'server'}
            className={`cf-request-seg ${activeSide === 'server' ? 'is-active' : ''}`}
            onClick={() => onSideChange('server')}
          >
            <span>Сервер (Master)</span>
            <span className="cf-request-seg-badge">{serverCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSide === 'client'}
            className={`cf-request-seg ${activeSide === 'client' ? 'is-active' : ''}`}
            onClick={() => onSideChange('client')}
          >
            <span>Клиент (BFF)</span>
            <span className="cf-request-seg-badge">{clientCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSide === 'mapping'}
            className={`cf-request-seg ${activeSide === 'mapping' ? 'is-active' : ''}`}
            onClick={() => onSideChange('mapping')}
          >
            <span>Маппинг</span>
            <span className="cf-request-seg-badge">{mappedCount}/{serverCount}</span>
          </button>
        </div>
      ) : (
        <div className="cf-request-single-badge">
          <span className="cf-request-single-title">Контракт</span>
          <span className="cf-request-seg-badge">{serverCount}</span>
        </div>
      )}

      {/* Action Buttons Clustered on Right (Strict 32px height) */}
      <div className="cf-request-actions">
        <WBButton
          size="sm"
          variant={isImportOpen ? 'primary' : 'secondary'}
          onClick={onToggleImport}
          icon={<WorkbenchIcon name="export" />}
          aria-label={isImportOpen ? 'Закрыть импорт' : 'Импорт источника'}
          title={isImportOpen ? 'Скрыть панель импорта' : 'Быстрый импорт JSON, cURL, XML, Schema'}
        >
          {isImportOpen ? 'Скрыть импорт' : '↓ Импорт'}
        </WBButton>

        {onAiDescriptions && (
          <WBButton
            size="sm"
            variant="ghost"
            onClick={onAiDescriptions}
            disabled={aiBusy}
            icon={<WorkbenchIcon name="highlight" />}
            title="AI: заполнить описания параметров"
          >
            Описания
          </WBButton>
        )}

        {onAiMasking && (
          <WBButton
            size="sm"
            variant="ghost"
            onClick={onAiMasking}
            disabled={aiBusy}
            icon={<WorkbenchIcon name="check" />}
            title="AI: определить поля для маскирования"
          >
            Маскирование
          </WBButton>
        )}

        <WBButton
          size="sm"
          variant="secondary"
          onClick={onAddParameter}
          icon={<WorkbenchIcon name="plus" />}
          title={`Добавить параметр в ${activeSide === 'client' ? 'Client' : 'Server'}`}
        >
          {activeSide === 'client' ? 'Client параметр' : isDualModel && activeSide === 'server' ? 'Server параметр' : 'Параметр'}
        </WBButton>
      </div>
    </div>
  );
}
