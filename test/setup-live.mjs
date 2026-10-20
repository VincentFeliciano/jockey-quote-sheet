/* Live setup check: warm the deployed page first, THEN set #setup, so a cold CDN
   start cannot race the assertions. */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9341;
const BASE = process.env.QS_URL || 'https://vincentfeliciano.github.io/jockey-quote-sheet/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-live-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); }
};

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

console.log('live setup check against ' + BASE);

/* 1. warm load, no hash */
await send('Page.navigate', { url: BASE });
let booted = false;
for (let i = 0; i < 80; i++) {
  await sleep(300);
  booted = await evaluate(`!!(window.QS && /view-/.test(document.body.className) && !!document.getElementById('syncBox'))`).catch(() => false);
  if (booted) break;
}
ok('deployed page boots', booted === true);

/* 2. now hand it the setup hash exactly as the link would */
await evaluate(`location.hash = '#setup'; 1`);
await sleep(900);

const open = await evaluate(`document.getElementById('syncBox').open`);
ok('#setup opens the repo panel', open === true, 'open=' + open);

const onList = await evaluate(`/view-list/.test(document.body.className)`);
ok('#setup shows the list screen', onList === true);

const paste = await evaluate(`!!document.getElementById('btnSyncPaste')`);
ok('paste button deployed', paste === true);

const hash = await evaluate(`location.hash`);
ok('hash scrubbed after use', hash === '' || hash === '#', 'hash=' + JSON.stringify(hash));

const widths = await evaluate(`(function(){
  var out={};
  ['syncOwner','syncRepo','syncBranch','syncToken'].forEach(function(id){
    var n=document.getElementById(id);
    out[id]=n?Math.round(n.getBoundingClientRect().width):-1;
  });
  return out;
})()`);
for (const id of ['syncOwner', 'syncRepo', 'syncBranch', 'syncToken']) {
  ok('field ' + id + ' visible', widths[id] > 80, 'w=' + widths[id]);
}

const fits = await evaluate(`(function(){
  var b=document.getElementById('syncBox').getBoundingClientRect();
  return b.width > 200 && b.right <= window.innerWidth + 2;
})()`);
ok('repo panel fits phone width', fits === true);

const masked = await evaluate(`document.getElementById('syncToken').type`);
ok('token box masked', masked === 'password', 'type=' + masked);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
ws.close(); chrome.kill();
process.exit(fail ? 1 : 0);
