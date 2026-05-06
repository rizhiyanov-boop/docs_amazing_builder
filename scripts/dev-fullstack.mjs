import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const port = process.env.PORT || '3001';
const nodeModulesBin = path.join(cwd, 'node_modules', '.bin');
const toolsNodeDir = path.join(cwd, '.tools', 'node');

const env = {
  ...process.env,
  NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
  PATH: `${nodeModulesBin};${toolsNodeDir};${process.env.PATH || ''}`
};

const cliPath = path.join(cwd, 'node_modules', 'vercel', 'dist', 'index.js');
const args = [cliPath, 'dev', '--listen', port, '--yes'];

console.log(`[dev:fullstack] starting Vercel dev on http://127.0.0.1:${port}`);
console.log('[dev:fullstack] NODE_TLS_REJECT_UNAUTHORIZED=' + env.NODE_TLS_REJECT_UNAUTHORIZED);

const child = spawn(process.execPath, args, {
  cwd,
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
