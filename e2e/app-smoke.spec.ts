import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_FIXTURE = path.resolve(TEST_DIR, 'fixtures', 'import-workspace.json');
const INVALID_IMPORT_FIXTURE = path.resolve(TEST_DIR, 'fixtures', 'invalid-workspace.json');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('doc-builder-onboarding-entry-suppressed-v1', '1');
  });

  await page.goto('/');
});

test('@smoke loads the main shell and default sections', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Doc Builder' })).toBeVisible();
  await expect(page.getByTestId('section-item-goal')).toBeVisible();
  await expect(page.getByTestId('section-item-request')).toBeVisible();
  await expect(page.getByTestId('export-html-button')).toBeVisible();
  await expect(page.getByTestId('export-wiki-button')).toBeVisible();
});

test('@smoke edits a text section and parses request JSON', async ({ page }) => {
  await page.getByTestId('section-item-goal').click();
  const editor = page.getByTestId('text-editor-goal');
  await editor.click();
  await page.keyboard.type('Smoke goal content');
  await expect(editor).toContainText('Smoke goal content');

  await page.getByTestId('section-item-request').click();
  await page.locator('[data-testid="source-expander-request-server"] summary').click();

  const sourceTextarea = page.getByTestId('source-textarea-request-server');
  await sourceTextarea.fill('{\n  "accountId": "12345",\n  "amount": 1500,\n  "currency": "UZS"\n}');
  await page.getByTestId('parse-button-request-server').click();

  await expect(page.getByRole('cell', { name: 'accountId' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'amount' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'currency' })).toBeVisible();
});

test('@smoke converts triple backticks into a code block with inline language selector', async ({ page }) => {
  await page.getByTestId('section-item-goal').click();
  const editor = page.getByTestId('text-editor-goal');
  await editor.click();
  await page.keyboard.type('```');

  const languageSelect = page.locator('.rich-code-block-language-select').first();
  await expect(languageSelect).toBeVisible();
  await expect(languageSelect).toHaveValue('auto');

  await languageSelect.selectOption('bash');
  await expect(languageSelect).toHaveValue('bash');
});

test('@smoke enables domain model and parses client payload', async ({ page }) => {
  await page.getByTestId('section-item-request').click();

  const domainModelToggle = page.getByTestId('domain-model-toggle-request');
  await domainModelToggle.check();
  await expect(domainModelToggle).toBeChecked();

  await page.locator('[data-testid="source-expander-request-client"] summary').click();

  const clientTextarea = page.getByTestId('source-textarea-request-client');
  await clientTextarea.fill('{\n  "externalId": "abc-123",\n  "sum": 1500\n}');
  await page.getByTestId('parse-button-request-client').click();

  await expect(page.getByRole('cell', { name: 'externalId' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'sum' })).toBeVisible();
});

test('@smoke exports html and wiki documents', async ({ page }) => {
  const [htmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-html-button').click()
  ]);
  expect(htmlDownload.suggestedFilename()).toMatch(/\.html$/i);

  const [wikiDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-wiki-button').click()
  ]);
  expect(wikiDownload.suggestedFilename()).toMatch(/\.wiki$/i);
});

test('@smoke imports a workspace snapshot', async ({ page }) => {
  await page.locator('input.hidden-file-input').setInputFiles(IMPORT_FIXTURE);

  await expect(page.getByTestId('section-item-imported-notes')).toBeVisible();
  await page.getByTestId('section-item-imported-notes').click();
  await expect(page.getByTestId('text-editor-imported-notes')).toContainText('Imported smoke content');
});

test('@smoke shows parser error for invalid request payload', async ({ page }) => {
  await page.getByTestId('section-item-request').click();
  await page.locator('[data-testid="source-expander-request-server"] summary').click();

  const sourceTextarea = page.getByTestId('source-textarea-request-server');
  await sourceTextarea.fill('{"broken": }');
  await page.getByTestId('parse-button-request-server').click();

  await expect(page.locator('.alert.error').first()).toBeVisible();
});

test('@smoke parses response payload flow', async ({ page }) => {
  await page.getByTestId('section-item-response').click();
  await page.locator('[data-testid="source-expander-response-server"] summary').click();

  const sourceTextarea = page.getByTestId('source-textarea-response-server');
  await sourceTextarea.fill('{\n  "status": "ok",\n  "operationId": "resp-1"\n}');
  await page.getByTestId('parse-button-response-server').click();

  await expect(page.getByRole('cell', { name: 'status' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'operationId' })).toBeVisible();
});

test('@smoke reset starts a new endpoint flow', async ({ page }) => {
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Создать новый эндпоинт');
    await dialog.accept();
  });

  await page.getByTestId('new-endpoint-button').click();
  await expect(page.getByRole('heading', { name: 'Как начнем?' })).toBeVisible();
});

test('@smoke shows import error for invalid workspace file', async ({ page }) => {
  await page.locator('input.hidden-file-input').setInputFiles(INVALID_IMPORT_FIXTURE);
  await expect(page.getByText(/Ошибка импорта:/)).toBeVisible();
});
