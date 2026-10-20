/* Focused diagnostic: load the live URL with #setup and report boot state,
   console errors, and uncaught exceptions. */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9341;
const URL = (process.env.QS_URL || 'https://vincentfeliciano.github.io/jockey-quote-sheet/') + '#setup';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-diag-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('no page target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    console.log('CONSOLE', msg.params.type + ':', msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    console.log('EXCEPTION:', d.text, '|', d.exception?.description || d.exception?.value || '');
  }
  if (msg.method === 'Log.entryAdded') {
    console.log('LOG', msg.params.entry.level + ':', msg.params.entry.text);
  }
};
function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  screenWidth: 390, screenHeight: 844
});
await send('Page.navigate', { url: URL });

for (let i = 0; i < 20; i++) {
  await sleep(1000);
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      href: location.href,
      hash: location.hash,
      readyState: document.readyState,
      bodyClass: document.body ? document.body.className : '(no body)',
      hasQS: typeof window.QS,
      hasBoot: !!(window.QS && document.querySelectorAll('#sections .card').length),
      cards: document.querySelectorAll('#sections .card').length,
      settingsDisplay: document.getElementById('screenSettings') ? getComputedStyle(document.getElementById('screenSettings')).display : 'missing',
      sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      note: document.getElementById('savedNote') ? document.getElementById('savedNote').textContent : 'n/a'
    })`,
    returnByValue: true
  });
  console.log(`t=${i + 1}s`, r.result.value);
  const state = JSON.parse(r.result.value);
  if (state.bodyClass.includes('view-settings')) { console.log('--- reached settings (cold load) ---'); break; }
}

/* ---------- phase 2: the app is ALREADY OPEN, then the link is tapped ---------- */
console.log('\n--- phase 2: hashchange on an open app ---');
const plain = 'https://vincentfeliciano.github.io/jockey-quote-sheet/';
await send('Page.navigate', { url: plain });
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const r = await send('Runtime.evaluate', {
    expression: "!!(window.QS && document.body && /view-list|view-detail/.test(document.body.className))",
    returnByValue: true
  }).catch(() => null);
  if (r && r.result && r.result.value) break;
}
await sleep(500);
const before = await send('Runtime.evaluate', {
  expression: "JSON.stringify({href:location.href, cls:document.body.className})", returnByValue: true
});
console.log('before tap:', before.result.value);

const nav = await send('Page.navigate', { url: plain + '#setup' });
console.log('navigate result:', JSON.stringify(nav));

for (let i = 0; i < 10; i++) {
  await sleep(700);
  const r = await send('Runtime.evaluate', {
    expression: "JSON.stringify({href:location.href, hash:location.hash, cls:document.body.className, settings:getComputedStyle(document.getElementById('screenSettings')).display})",
    returnByValue: true
  });
  console.log(`  +${(i + 1) * 0.7}s`, r.result.value);
  if (JSON.parse(r.result.value).cls.includes('view-settings')) break;
}

ws.close();
chrome.kill();
process.exit(0);
