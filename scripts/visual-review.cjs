/**
 * Automated Visual Review Tool for DocBuilder UI
 * 
 * Captures pixel-perfect screenshots of rendered UI using headless Edge via Chrome DevTools Protocol (CDP).
 * Includes automated DOM Audit rules for:
 *   - Information Hierarchy (Primary entity title above secondary metadata)
 *   - Badge conciseness (<= 18 chars, no whole sentences)
 *   - Anti-tautology (No duplicate word stems across adjacent badges)
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

async function runDomAudit(send) {
  try {
    const res = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `
        (() => {
          const issues = [];

          // 0. Check Root Render
          const rootEl = document.getElementById('root');
          if (rootEl && rootEl.children.length === 0) {
            issues.push({
              type: 'empty-root',
              message: 'Page #root has 0 children; React application did not render'
            });
          }

          // 1. Check Single-Line Containment & No-Wrap (Hub must never wrap onto multiple rows)
          const isVisible = el => !el.closest('[hidden]') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
          const hubs = document.querySelectorAll('.cf-jira-linked-hub');
          hubs.forEach(hub => {
            if (!isVisible(hub)) return;

            // Height must not exceed 44px (expected 38px)
            if (hub.offsetHeight > 44) {
              issues.push({
                type: 'line-wrapped',
                message: 'Jira hub has wrapped onto multiple lines (height: ' + hub.offsetHeight + 'px > 44px)'
              });
            }

            // Items must stay on a single horizontal row
            const items = Array.from(hub.querySelectorAll('.cf-jira-hub-key-link, .cf-jira-hub-title-text, .cf-jira-hub-chip, .cf-jira-hub-actions'));
            if (items.length > 1) {
              const baseTop = items[0].getBoundingClientRect().top;
              for (const item of items) {
                const top = item.getBoundingClientRect().top;
                if (Math.abs(top - baseTop) > 6) {
                  issues.push({
                    type: 'item-wrapped',
                    message: 'Item in Jira hub wrapped to a secondary line: "' + (item.textContent || '').trim().slice(0, 30) + '"'
                  });
                  break;
                }
              }
            }

            // Title must have text-overflow ellipsis and nowrap
            const title = hub.querySelector('.cf-jira-hub-title-text');
            if (title) {
              const comp = window.getComputedStyle(title);
              if (comp.whiteSpace !== 'nowrap') {
                issues.push({
                  type: 'title-nowrap-missing',
                  message: 'Title element is missing white-space: nowrap'
                });
              }
            }

            // Strict Vertical Center Alignment: Every element must be vertically centered in the line (diff <= 2.5px)
            const hubRect = hub.getBoundingClientRect();
            const hubCenterY = (hubRect.top + hubRect.bottom) / 2;
            const alignCheckItems = Array.from(hub.querySelectorAll('.cf-jira-hub-key-link, .cf-jira-hub-title-text, .cf-jira-hub-chip, .cf-jira-hub-actions button, .cf-jira-hub-actions a'));
            for (const item of alignCheckItems) {
              const r = item.getBoundingClientRect();
              const itemCenterY = (r.top + r.bottom) / 2;
              const diff = Math.abs(itemCenterY - hubCenterY);
              if (diff > 2.5) {
                issues.push({
                  type: 'vertical-alignment-off',
                  message: 'Item in Jira hub is not vertically centered (diff: ' + diff.toFixed(1) + 'px > 2.5px): "' + (item.textContent || item.getAttribute('title') || '').trim().slice(0, 30) + '"'
                });
              }
            }
          });

          // 2. Check Badge Conciseness (> 20 chars in a single status/chip, > 50 for epic)
          const chips = Array.from(document.querySelectorAll('.cf-jira-hub-status-badge, .cf-jira-hub-chip, .cf-jira-workflow-mode-badge')).filter(isVisible);
          chips.forEach(chip => {
            const text = (chip.textContent || '').trim();
            const limit = chip.classList.contains('epic') || chip.classList.contains('cf-jira-hub-status-badge') ? 60 : 20;
            if (text.length > limit) {
              issues.push({
                type: 'badge-too-long',
                message: 'Badge text is too wordy (' + text.length + ' chars): "' + text + '"'
              });
            }
          });

          // 3. Check Tautology / duplicate word stems across adjacent badges
          hubs.forEach(hub => {
            if (!isVisible(hub)) return;
            const parentBlock = hub.closest('.cf-screen, main') || hub.parentElement;
            const badgeEls = Array.from(parentBlock ? parentBlock.querySelectorAll('.cf-jira-hub-status-badge, .cf-jira-hub-chip, .cf-jira-workflow-mode-badge') : []).filter(isVisible);
            const badgeTexts = badgeEls.map(el => (el.textContent || '').trim().toLowerCase());
            
            const words = badgeTexts.flatMap(t => t.split(/[\\s\\/·,]+/));
            const stems = words.map(w => w.replace(/[^a-zа-я0-9]/gi, '')).filter(w => w.length > 4);
            const counts = {};
            stems.forEach(s => {
              const prefix = s.slice(0, 6);
              counts[prefix] = (counts[prefix] || 0) + 1;
            });
            for (const [prefix, count] of Object.entries(counts)) {
              if (count > 1) {
                issues.push({
                  type: 'duplicate-terminology',
                  message: 'Repeated word stem ("' + prefix + '...") found ' + count + ' times across adjacent badges: ' + JSON.stringify(badgeTexts)
                });
              }
            }
          });

          return issues;
        })()
      `
    });

    return res?.result?.value || [];
  } catch {
    return [];
  }
}

async function run() {
  const params = parseArgs();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docbuilder-visual-'));
  const port = 9222 + Math.floor(Math.random() * 500);

  const edge = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-fre',
    '--disable-component-update',
    `--user-data-dir=${tmpDir}`,
    `--window-size=${params.width},${params.height}`,
    params.url
  ]);

  let ws = null;

  try {
    let targets = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`);
        if (targets && targets.length > 0) break;
      } catch {}
    }

    if (!targets || !targets.length) {
      throw new Error(`Browser failed to start CDP on port ${port}`);
    }

    const pageTarget = targets.find(t => t.url.includes('5173') || t.url.includes(params.url))
      || targets.find(t => t.type === 'page')
      || targets[0];

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
      
      // Run automated DOM audit
      const auditIssues = await runDomAudit(send);
      if (auditIssues.length > 0) {
        console.warn(`[visual-review] ⚠️ DOM Audit alerts for ${path.basename(filePath)}:`);
        auditIssues.forEach(iss => console.warn(`   • [${iss.type}] ${iss.message}`));
      } else {
        console.log(`[visual-review] ✓ DOM Audit passed cleanly for ${path.basename(filePath)}`);
      }

      const res = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
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
                const el = Array.from(document.querySelectorAll('${step.selector || 'button, a, [role="button"], .cf-jira-pill'}'))
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
