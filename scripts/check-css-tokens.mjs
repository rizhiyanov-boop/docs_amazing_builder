import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const srcDir = path.join(workspaceRoot, 'src');
const allowedTokenFiles = new Set([
  path.join(srcDir, 'tokens.css'),
  path.join(srcDir, 'tokens.foundation.css'),
  path.join(srcDir, 'tokens.semantic.css')
]);

const cssFiles = [];

function walk(dirPath) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.css')) {
      cssFiles.push(fullPath);
    }
  }
}

walk(srcDir);

const watchedProperties = new Set([
  'font-size',
  'gap',
  'row-gap',
  'column-gap',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius'
]);

const sizeWithPxRe = /-?\d*\.?\d+px\b/;
const violations = [];

for (const filePath of cssFiles) {
  if (allowedTokenFiles.has(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^\s*([a-z-]+)\s*:\s*([^;]+);/i);
    if (!match) continue;

    const prop = match[1].toLowerCase();
    const value = match[2].trim();

    if (!watchedProperties.has(prop)) continue;
    if (!sizeWithPxRe.test(value)) continue;

    violations.push({
      filePath: path.relative(workspaceRoot, filePath).replaceAll('\\', '/'),
      line: i + 1,
      prop,
      value
    });
  }
}

if (violations.length > 0) {
  console.error('Found hardcoded px in tokenized CSS properties:');
  for (const violation of violations) {
    console.error(`- ${violation.filePath}:${violation.line} ${violation.prop}: ${violation.value}`);
  }
  process.exit(1);
}

console.log('Token check passed: no hardcoded px found in watched CSS properties.');
