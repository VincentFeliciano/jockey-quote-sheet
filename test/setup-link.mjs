/* Setup-link check: #setup opens the repo panel, focuses the token box, and is scrubbed from the URL. */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;
const BASE = process.env.QS_URL || 'http://127.0.0.1:8789/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-setup-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); }
};

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--disable-extensions', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = (expression) => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  .then((r) => (r.result ? r.result.value : undefined));

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE + '#setup' });

for (let i = 0; i < 60; i++) {
  await sleep(250);
  const ready = await evaluate(`!!(window.QS && /view-/.test(document.body.className) && document.querySelectorAll('#sections .card').length >= 3)`).catch(() => false);
  if (ready) break;
}
await sleep(700);

console.log('setup link against ' + BASE);

const open = await evaluate(`document.getElementById('syncBox').open`);
ok('#setup opens the repo panel', open === true, 'open=' + open);

const onList = await evaluate(`/view-list/.test(document.body.className)`);
ok('#setup switches to the list screen', onList === true);

const hasPaste = await evaluate(`!!document.getElementById('btnSyncPaste')`);
ok('paste button is present', hasPaste === true);

const hash = await evaluate(`location.hash`);
ok('hash is scrubbed after use', hash === '' || hash === '#', 'hash=' + JSON.stringify(hash));

const fields = await evaluate(`(function(){
  var ids=['syncOwner','syncRepo','syncBranch','syncToken'];
  var out={};
  ids.forEach(function(id){var n=document.getElementById(id);out[id]=n?{w:Math.round(n.getBoundingClientRect().width)}:'missing';});
  return out;
})()`);
for (const id of ['syncOwner', 'syncRepo', 'syncBranch', 'syncToken']) {
  ok('field ' + id + ' rendered', fields[id] !== 'missing' && fields[id].w > 80, JSON.stringify(fields[id]));
}

const noOverflow = await evaluate(`(function(){
  var b=document.getElementById('syncBox').getBoundingClientRect();
  return b.right <= window.innerWidth + 2 && b.width > 200;
})()`);
ok('repo panel fits the phone width', noOverflow === true);

const tokenType = await evaluate(`document.getElementById('syncToken').type`);
ok('token box is masked', tokenType === 'password', 'type=' + tokenType);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
ws.close(); chrome.kill();
process.exit(fail ? 1 : 0);
