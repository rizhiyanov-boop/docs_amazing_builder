import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const DYNAMIC_IMPORT_RELOAD_KEY = 'doc-builder-dynamic-import-reload';

function isDynamicImportFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('failed to fetch dynamically imported module')
    || normalized.includes('importing a module script failed')
    || normalized.includes('error loading dynamically imported module');
}

function reloadOnDynamicImportFailure(message: string): void {
  if (!isDynamicImportFailureMessage(message)) return;

  try {
    if (sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) === '1') return;
    sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, '1');
  } catch {
    return;
  }

  window.location.reload();
}

window.addEventListener('error', (event) => {
  reloadOnDynamicImportFailure(event.message || '');
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message =
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
        ? reason.message
        : '';

  reloadOnDynamicImportFailure(message);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
