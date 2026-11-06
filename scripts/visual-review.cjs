/**
 * Automated Visual Review Tool for DocBuilder UI
 * 
 * Captures pixel-perfect screenshots of rendered UI using headless Edge via Chrome DevTools Protocol (CDP).
 * Can execute interaction flows (clicks, inputs, waits) and capture multi-state flows.
 * 
 * Usage:
 *   node scripts/visual-review.cjs --url <url> [--out <pngPath>] [--width 1280] [--height 900] [--wait 1000]
 *   node scripts/visual-review.cjs --url <url> --flow <flowJsonOrFile>
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    url: 'http://localhost:5173/docs/design/jira-scenarios-preview.html',
    out: path.resolve('output/visual-review.png'),
    width: 1280,
    height: 900,
    wait: 1000,
    flow: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' && args[i + 1]) params.url = args[++i];
    else if (arg === '--out' && args[i + 1]) params.out = path.resolve(args[++i]);
    else if (arg === '--width' && args[i + 1]) params.width = parseInt(args[++i], 10);
    else if (arg === '--height' && args[i + 1]) params.height = parseInt(args[++i], 10);
    else if (arg === '--wait' && args[i + 1]) params.wait = parseInt(args[++i], 10);
    else if (arg === '--flow' && args[i + 1]) params.flow = args[++i];
  }

  return params;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

async function run() {
  const params = parseArgs();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docbuilder-visual-'));
  const port = 9222 + Math.floor(Math.random() * 500);

  const edge = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    `--user-data-dir=${tmpDir}`,
    `--window-size=${params.width},${params.height}`,
    params.url
  ]);

  let ws = null;

  try {
    // Wait for browser debugger port
    let targets = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`);
        if (targets && targets.length > 0) break;
      } catch {
        // continue polling
      }
    }

    if (!targets || !targets.length) {
      throw new Error(`Browser failed to start CDP on port ${port}`);
    }

    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const send = (method, cmdParams = {}) => new Promise((resolve, reject) => {
      const id = msgId++;
      const handler = evt => {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params: cmdParams }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: params.width,
      height: params.height,
      deviceScaleFactor: 1,
      mobile: false
    });

    await new Promise(r => setTimeout(r, params.wait));

    const captureTo = async (filePath) => {
      const outDir = path.dirname(filePath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      console.log(`[visual-review] Screenshot saved: ${filePath}`);
    };

    if (params.flow) {
      let flowSteps;
      if (fs.existsSync(params.flow)) {
        flowSteps = JSON.parse(fs.readFileSync(params.flow, 'utf8'));
      } else {
        flowSteps = JSON.parse(params.flow);
      }

      for (let i = 0; i < flowSteps.length; i++) {
        const step = flowSteps[i];
        if (step.clickText) {
          await send('Runtime.evaluate', {
            expression: `
              (() => {
                const el = Array.from(document.querySelectorAll('${step.selector || 'button, a, [role="button"]'}'))
                  .find(e => e.textContent.includes(${JSON.stringify(step.clickText)}));
                if (el) { el.click(); return true; }
                return false;
              })()
            `
          });
        } else if (step.click) {
          await send('Runtime.evaluate', {
            expression: `
              (() => {
                const el = document.querySelector(${JSON.stringify(step.click)});
                if (el) { el.click(); return true; }
                return false;
              })()
            `
          });
        }

        if (step.eval) {
          await send('Runtime.evaluate', { expression: step.eval });
        }

        const waitTime = step.wait || 500;
        await new Promise(r => setTimeout(r, waitTime));

        if (step.screenshot) {
          const stepOut = path.isAbsolute(step.screenshot)
            ? step.screenshot
            : path.join(path.dirname(params.out), step.screenshot);
          await captureTo(stepOut);
        }
      }
    } else {
      await captureTo(params.out);
    }
  } finally {
    if (ws) {
      try { ws.close(); } catch {}
    }
    edge.kill();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

run().catch(err => {
  console.error('[visual-review] Error:', err);
  process.exit(1);
});
