import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/tokens.css';
import '../../src/tokens-workbench.css';
import '../../src/App.css';
import '../../src/screens/ConfluenceScreen.css';
import '../../src/components/workbench/workbench-shell.css';
import { applyThemeToRoot } from '../../src/theme';
import { WorkbenchIcon } from '../../src/components/workbench/WorkbenchIcon';
import { WBButton } from '../../src/components/primitives/WorkbenchPrimitives';

applyThemeToRoot('light');
document.documentElement.dataset.wbAccent = 'warm';

export function JiraCreatedCardPreview() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mode, setMode] = useState<'standalone' | 'linked'>('standalone');
  const [hasConfluence, setHasConfluence] = useState(false);
  const [linkedToConfluence, setLinkedToConfluence] = useState(false);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyThemeToRoot(next);
  };

  const issueKey = 'DI-22498';
  const issueUrl = `https://jira.example/browse/${issueKey}`;
  const summary = '[OpenAPI] Implement GET /api/organization/account/info routing to Account Domain';
  const epicKey = 'DI-1083';
  const epicName = 'OpenAPI Improvements';

  return (
    <div className="wb-app-root" data-accent="warm" style={{ padding: '32px', maxWidth: '1080px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--wb-border)', paddingBottom: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Редизайн карточки созданной / привязанной задачи Jira</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--wb-text-muted)', fontSize: '13px' }}>
            Песочница для тестирования UI без отправки запросов в реальную Jira.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="cf-jira-pill"
            onClick={toggleTheme}
            style={{ cursor: 'pointer', padding: '6px 12px' }}
          >
            Тема: {theme === 'light' ? 'Светлая ☀️' : 'Тёмная 🌙'}
          </button>
          <button
            type="button"
            className={`cf-jira-pill ${mode === 'standalone' ? 'cf-jira-pill-active' : ''}`}
            onClick={() => setMode('standalone')}
            style={{ cursor: 'pointer', padding: '6px 12px' }}
          >
            Отдельный сценарий
          </button>
          <button
            type="button"
            className={`cf-jira-pill ${mode === 'linked' ? 'cf-jira-pill-active' : ''}`}
            onClick={() => setMode('linked')}
            style={{ cursor: 'pointer', padding: '6px 12px' }}
          >
            Привязана к методу
          </button>
          <button
            type="button"
            className={`cf-jira-pill ${hasConfluence ? 'cf-jira-pill-active' : ''}`}
            onClick={() => setHasConfluence(!hasConfluence)}
            style={{ cursor: 'pointer', padding: '6px 12px' }}
          >
            {hasConfluence ? 'Confluence: страница есть' : 'Confluence: страницы нет'}
          </button>
        </div>
      </header>

      {/* SECTION 1: КАК БЫЛО (ТЕКУЩИЙ УБОГИЙ ВАРИАНТ) */}
      <section style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--wb-danger)', background: 'color-mix(in srgb, var(--wb-danger) 12%, transparent)', padding: '2px 8px', borderRadius: '4px' }}>
            Было (текущий вид из вашего скриншота)
          </span>
          <span style={{ fontSize: '13px', color: 'var(--wb-text-muted)' }}>Громоздкий notice-блок с оранжевой полосой и 3 строками пояснений</span>
        </div>

        <div className="cf-notice" style={{ margin: '0' }}>
          <h3>{mode === 'standalone' ? 'Созданная задача этого сценария' : 'Метод уже связан с задачей Jira'}</h3>
          <p><a href={issueUrl} target="_blank" rel="noopener noreferrer">{issueKey}</a></p>
          {mode === 'linked' && (
            <p><WBButton disabled>Отвязать задачу</WBButton><span className="cf-muted"> Удаляется только связь в DocBuilder. Задача в Jira остаётся.</span></p>
          )}
          {hasConfluence && (
            <p><WBButton disabled>Добавить ссылку Confluence</WBButton></p>
          )}
          <p>{mode === 'standalone' ? 'Эта задача относится к отдельному сценарию и не привязана к текущему методу.' : 'Ссылка на задачу сохранена в поле Jira метода и включена в Wiki-разметку. В Confluence она появится при следующей публикации страницы.'}</p>
          {!hasConfluence && <p className="cf-muted">После публикации страницы здесь можно добавить ссылку Confluence в задачу.</p>}
          <WBButton disabled>Загрузить из Jira</WBButton>
        </div>
      </section>

      {/* SECTION 2: ВАРИАНТ 1 (РЕКОМЕНДУЕМЫЙ: TICKET HUB CARD) */}
      <section style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)', padding: '2px 8px', borderRadius: '4px' }}>
            Вариант 1 (Рекомендуемый): Компактный Ticket Hub
          </span>
          <span style={{ fontSize: '13px', color: 'var(--wb-text-muted)' }}>Чистая карточка: статус, чип задачи, название, метаданные и аккуратные действия без спама текстом</span>
        </div>

        <div style={{
          background: 'var(--wb-bg-surface)',
          border: '1px solid var(--wb-border)',
          borderRadius: 'var(--wb-radius-md, 8px)',
          padding: '14px 16px',
          boxShadow: 'var(--wb-shadow-xs, 0 1px 2px rgba(0,0,0,0.04))',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Main Top Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'color-mix(in srgb, var(--success) 14%, var(--wb-bg-surface))',
                color: 'var(--success)',
                border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)'
              }}>
                <WorkbenchIcon name="check" />
                <span>{mode === 'standalone' ? 'Задача создана' : 'Связано с Jira'}</span>
              </span>

              <a
                href={issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  fontFamily: 'var(--wb-font-mono, monospace)',
                  background: 'color-mix(in srgb, var(--wb-accent) 12%, var(--wb-bg-surface))',
                  color: 'var(--wb-accent)',
                  border: '1px solid color-mix(in srgb, var(--wb-accent) 25%, transparent)',
                  textDecoration: 'none'
                }}
              >
                <span>{issueKey}</span>
                <span style={{ fontSize: '11px', opacity: 0.8 }}>↗</span>
              </a>

              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--wb-text)' }}>
                {summary}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <a
                href={issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'var(--wb-accent)',
                  color: '#fff',
                  textDecoration: 'none'
                }}
              >
                <span>Открыть в Jira</span>
                <span>↗</span>
              </a>
            </div>
          </div>

          {/* Meta & Secondary Actions Row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '10px',
            borderTop: '1px solid var(--wb-border-subtle, rgba(0,0,0,0.06))',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {/* Meta Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                color: 'var(--wb-text-muted)',
                background: 'var(--wb-bg-hover)',
                border: '1px solid var(--wb-border)'
              }}>
                {mode === 'standalone' ? '⚡ Отдельный сценарий' : '🔗 Привязана к методу'}
              </span>

              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#eab308',
                background: 'color-mix(in srgb, #eab308 10%, var(--wb-bg-surface))',
                border: '1px solid color-mix(in srgb, #eab308 30%, var(--wb-border))',
                fontWeight: 600
              }}>
                ⚡ Medium
              </span>

              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                color: 'var(--wb-text)',
                background: 'var(--wb-bg-hover)',
                border: '1px solid var(--wb-border)'
              }}>
                📁 {epicKey} · {epicName}
              </span>

              {linkedToConfluence && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: 'var(--wb-accent)',
                  background: 'color-mix(in srgb, var(--wb-accent) 10%, var(--wb-bg-surface))',
                  border: '1px solid color-mix(in srgb, var(--wb-accent) 30%, transparent)'
                }}>
                  📄 Confluence связан
                </span>
              )}
            </div>

            {/* Context Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {hasConfluence && !linkedToConfluence && (
                <WBButton
                  size="sm"
                  variant="outline"
                  onClick={() => setLinkedToConfluence(true)}
                >
                  <WorkbenchIcon name="link" />
                  <span>Добавить ссылку Confluence</span>
                </WBButton>
              )}

              <WBButton
                size="sm"
                variant="outline"
                title="Синхронизировать поля задачи из Jira"
              >
                <WorkbenchIcon name="refresh" />
                <span>Синхронизировать с Jira</span>
              </WBButton>

              {mode === 'linked' && (
                <WBButton
                  size="sm"
                  variant="ghost"
                  style={{ color: 'var(--wb-text-muted)' }}
                  title="Отвязать задачу от текущего метода в DocBuilder"
                >
                  <span>Отвязать</span>
                </WBButton>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: ВАРИАНТ 2 (УЛЬТРАКОМПАКТНЫЙ СТАТУС-БАР) */}
      <section style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--wb-accent)', background: 'color-mix(in srgb, var(--wb-accent) 12%, transparent)', padding: '2px 8px', borderRadius: '4px' }}>
            Вариант 2: Ультракомпактный Status Bar
          </span>
          <span style={{ fontSize: '13px', color: 'var(--wb-text-muted)' }}>Занимает минимум места (~42px высоты) прямо в верхней строке панели</span>
        </div>

        <div style={{
          background: 'var(--wb-bg-surface)',
          border: '1px solid var(--wb-border)',
          borderRadius: 'var(--wb-radius-sm, 6px)',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
            <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              <WorkbenchIcon name="check" />
            </span>

            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--wb-font-mono, monospace)',
                fontWeight: 700,
                fontSize: '13px',
                color: 'var(--wb-accent)',
                textDecoration: 'none',
                flexShrink: 0
              }}
            >
              {issueKey} ↗
            </a>

            <span style={{
              fontSize: '13px',
              color: 'var(--wb-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {summary}
            </span>

            <span style={{
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '11px',
              color: 'var(--wb-text-muted)',
              background: 'var(--wb-bg-hover)',
              flexShrink: 0
            }}>
              {mode === 'standalone' ? 'Отдельный сценарий' : 'Привязана'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <WBButton size="sm" variant="outline" title="Синхронизировать с Jira">
              <WorkbenchIcon name="refresh" />
            </WBButton>
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                background: 'var(--wb-accent)',
                color: '#fff',
                textDecoration: 'none'
              }}
            >
              Открыть ↗
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<JiraCreatedCardPreview />);
