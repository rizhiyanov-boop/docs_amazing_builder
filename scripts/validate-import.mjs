import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

const args = process.argv.slice(2);
const compat = args.includes('--compat');
const paths = args.filter(arg => arg !== '--compat');
if (!paths.length || paths.some(path => path.startsWith('--'))) {
  console.error('Usage: npm run validate:import -- [--compat] file.json [other.json ...]');
  process.exitCode = 2;
} else {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dom = new JSDOM('');
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.Node = dom.window.Node;
  const server = await createServer({
    root, configFile: false, server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] }
  });
  try {
    const { loadWorkspaceProjectFromPayload, ProjectImportError } = await server.ssrLoadModule('/src/projectImport.ts');
    const { validateCodexProjectImport } = await server.ssrLoadModule('/src/codexImportValidation.ts');
    for (const path of paths) {
      try {
        const payload = JSON.parse(await readFile(resolve(path), 'utf8'));
        if (!compat) {
          const issues = validateCodexProjectImport(payload);
          if (issues.length) throw new ProjectImportError(issues);
        }
        const workspace = loadWorkspaceProjectFromPayload(payload);
        console.log(`OK ${path}: ${workspace.methods.length} method(s), workspace v${workspace.version}${compat ? ' (compatibility)' : ' (codex-v1)'}`);
      } catch (error) {
        process.exitCode = 1;
        console.error(`FAIL ${path}\n${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await server.close();
    dom.window.close();
  }
}
