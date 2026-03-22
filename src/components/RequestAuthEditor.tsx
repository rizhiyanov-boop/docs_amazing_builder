import {
  DEFAULT_API_KEY_EXAMPLE,
  DEFAULT_API_KEY_HEADER,
  DEFAULT_BASIC_PASSWORD,
  DEFAULT_BASIC_USERNAME,
  DEFAULT_BEARER_TOKEN_EXAMPLE
} from '../requestHeaders';
import type { ParsedSection, RequestAuthType } from '../types';

type ParseTarget = 'server' | 'client';

type RequestAuthEditorProps = {
  section: ParsedSection;
  target: ParseTarget;
  isExpanderOpen: (sectionId: string, blockId: string) => boolean;
  setExpanderOpen: (sectionId: string, blockId: string, isOpen: boolean) => void;
  updateParsedSection: (id: string, updater: (section: ParsedSection) => ParsedSection) => void;
};

export function RequestAuthEditor({
  section,
  target,
  isExpanderOpen,
  setExpanderOpen,
  updateParsedSection
}: RequestAuthEditorProps) {
  if (section.sectionType !== 'request') return null;

  const isExternal = target === 'client';
  const authType = isExternal ? section.externalAuthType ?? 'none' : section.authType ?? 'none';
  const tokenExample = isExternal ? section.externalAuthTokenExample ?? '' : section.authTokenExample ?? '';
  const username = isExternal ? section.externalAuthUsername ?? '' : section.authUsername ?? '';
  const password = isExternal ? section.externalAuthPassword ?? '' : section.authPassword ?? '';
  const headerName = isExternal ? section.externalAuthHeaderName ?? DEFAULT_API_KEY_HEADER : section.authHeaderName ?? DEFAULT_API_KEY_HEADER;
  const apiKeyExample = isExternal ? section.externalAuthApiKeyExample ?? '' : section.authApiKeyExample ?? '';
  const title = isExternal ? 'Авторизация внешнего запроса' : 'Авторизация';
  const blockId = isExternal ? 'auth-client' : 'auth-server';

  const applyAuthPatch = (patch: Partial<ParsedSection>) => {
    updateParsedSection(section.id, (current) => ({ ...current, ...patch }));
  };

  const applyAuthType = (nextAuthType: RequestAuthType) => {
    applyAuthPatch(
      isExternal
        ? {
            externalAuthType: nextAuthType,
            externalAuthHeaderName: section.externalAuthHeaderName || DEFAULT_API_KEY_HEADER,
            externalAuthTokenExample: section.externalAuthTokenExample || DEFAULT_BEARER_TOKEN_EXAMPLE,
            externalAuthUsername: section.externalAuthUsername || DEFAULT_BASIC_USERNAME,
            externalAuthPassword: section.externalAuthPassword || DEFAULT_BASIC_PASSWORD,
            externalAuthApiKeyExample: section.externalAuthApiKeyExample || DEFAULT_API_KEY_EXAMPLE
          }
        : {
            authType: nextAuthType,
            authHeaderName: section.authHeaderName || DEFAULT_API_KEY_HEADER,
            authTokenExample: section.authTokenExample || DEFAULT_BEARER_TOKEN_EXAMPLE,
            authUsername: section.authUsername || DEFAULT_BASIC_USERNAME,
            authPassword: section.authPassword || DEFAULT_BASIC_PASSWORD,
            authApiKeyExample: section.authApiKeyExample || DEFAULT_API_KEY_EXAMPLE
          }
    );
  };

  return (
    <details
      className="expander"
      open={isExpanderOpen(section.id, blockId)}
      onToggle={(e) => setExpanderOpen(section.id, blockId, e.currentTarget.open)}
    >
      <summary className="expander-summary">{title}</summary>
      <div className="expander-body">
        <label className="field">
          <div className="label">Способ</div>
          <select value={authType} onChange={(e) => applyAuthType(e.target.value as RequestAuthType)}>
            <option value="none">Без авторизации</option>
            <option value="bearer">Bearer token</option>
            <option value="basic">Basic auth</option>
            <option value="api-key">API key</option>
          </select>
        </label>

        {authType === 'bearer' && (
          <label className="field">
            <div className="label">Пример токена</div>
            <input
              type="text"
              value={tokenExample}
              onChange={(e) =>
                applyAuthPatch(isExternal ? { externalAuthTokenExample: e.target.value } : { authTokenExample: e.target.value })
              }
              placeholder={DEFAULT_BEARER_TOKEN_EXAMPLE}
            />
          </label>
        )}

        {authType === 'basic' && (
          <div className="row gap auth-grid">
            <label className="field">
              <div className="label">Логин</div>
              <input
                type="text"
                value={username}
                onChange={(e) =>
                  applyAuthPatch(isExternal ? { externalAuthUsername: e.target.value } : { authUsername: e.target.value })
                }
                placeholder={DEFAULT_BASIC_USERNAME}
              />
            </label>
            <label className="field">
              <div className="label">Пароль</div>
              <input
                type="text"
                value={password}
                onChange={(e) =>
                  applyAuthPatch(isExternal ? { externalAuthPassword: e.target.value } : { authPassword: e.target.value })
                }
                placeholder={DEFAULT_BASIC_PASSWORD}
              />
            </label>
          </div>
        )}

        {authType === 'api-key' && (
          <div className="row gap auth-grid">
            <label className="field">
              <div className="label">Имя header</div>
              <input
                type="text"
                value={headerName}
                onChange={(e) =>
                  applyAuthPatch(isExternal ? { externalAuthHeaderName: e.target.value } : { authHeaderName: e.target.value })
                }
                placeholder={DEFAULT_API_KEY_HEADER}
              />
            </label>
            <label className="field">
              <div className="label">Пример API key</div>
              <input
                type="text"
                value={apiKeyExample}
                onChange={(e) =>
                  applyAuthPatch(isExternal ? { externalAuthApiKeyExample: e.target.value } : { authApiKeyExample: e.target.value })
                }
                placeholder={DEFAULT_API_KEY_EXAMPLE}
              />
            </label>
          </div>
        )}

        <div className="muted">Настройка автоматически попадет в headers и в итоговую документацию.</div>
      </div>
    </details>
  );
}
