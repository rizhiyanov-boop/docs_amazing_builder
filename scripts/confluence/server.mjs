import { createBridge, validateAdditionalOrigin } from './bridge.mjs';
import { createWindowsCredentialStore } from './credential-store.mjs';

function argumentsForBridge(args) {
  const origins = []; let port = 18771;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--origin' && args[i + 1]) origins.push(validateAdditionalOrigin(args[++i]));
    else if (args[i] === '--port' && /^\d+$/.test(args[i + 1] ?? '')) { port = Number(args[++i]); if (port < 1024 || port > 65535) throw new Error('Порт должен быть в диапазоне 1024–65535.'); }
    else throw new Error('Допустимые параметры: --origin https://example.com и --port 18771.');
  }
  return { origins, port };
}
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Нужен Node.js 22 или новее.');
  const { origins, port } = argumentsForBridge(process.argv.slice(2)); const bridge = createBridge({ origins, credentialStore: createWindowsCredentialStore() });
  bridge.server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Порт ${port} занят. Закройте предыдущий сервис или задайте --port.` : 'Не удалось запустить локальный сервис.'); process.exitCode = 1; });
  await bridge.restoreConnection();
  bridge.server.listen(port, '127.0.0.1', () => {
    console.log(`DocBuilder Confluence: http://127.0.0.1:${port}/`);
    console.log('Адрес Confluence и PAT вводятся только в локальной форме. Windows может сохранить их зашифрованными для текущего пользователя.');
    console.log('Для остановки нажмите Ctrl+C. Перезапуск очищает журнал операций; сохранённое подключение восстанавливается автоматически.');
  });
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await bridge.close(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch (error) { console.error(error.message); process.exitCode = 1; }
