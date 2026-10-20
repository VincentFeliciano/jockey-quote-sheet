/* Diagnose why the deployed page did not boot in headless Chrome. */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9338;
const URL = process.env.QS_URL || 'https://vincentfeliciano.github.io/jockey-quote-sheet/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-diag-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--disable-extensions', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.consoleAPICalled') {
    logs.push(m.params.type + ': ' + (m.params.args || []).map((a) => a.value || a.description || '').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    logs.push('EXCEPTION: ' + JSON.stringify(m.params.exceptionDetails.exception || m.params.exceptionDetails.text));
  }
  if (m.method === 'Network.loadingFailed') {
    logs.push('LOADFAIL: ' + m.params.errorText + ' ' + (m.params.requestId || ''));
  }
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = (expression) => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  .then((r) => (r.result ? r.result.value : undefined));

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: URL + '#setup' });
await sleep(6000);

const info = await evaluate(`(function(){
  return {
    href: location.href,
    title: document.title,
    bodyLen: (document.body ? document.body.innerHTML.length : -1),
    cls: document.body ? document.body.className : 'nobody',
    hasQS: typeof window.QS,
    scripts: Array.from(document.scripts).map(function(s){return s.src.split('/').slice(-2).join('/') + (s.src ? '' : ' (inline)');}),
    syncBox: !!document.getElementById('syncBox'),
    state: (document.getElementById('savedNote')||{}).textContent || ''
  };
})()`);

console.log(JSON.stringify(info, null, 2));
console.log('\nconsole/network:');
logs.slice(-25).forEach((l) => console.log('  ' + l));
ws.close(); chrome.kill(); process.exit(0);
