/* One-off layout probe: dump rects for the phone detail screen. */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9335;
const URL = 'http://127.0.0.1:8789/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-probe-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: URL });

for (let i = 0; i < 60; i++) {
  await sleep(250);
  const r = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `!!(window.QS && document.body && /view-/.test(document.body.className) && document.querySelectorAll('#sections .card').length >= 3)`
  }).catch(() => null);
  if (r && r.result && r.result.value) break;
}
await sleep(500);

/* add a couple of steps so the task list is populated */
await send('Runtime.evaluate', {
  expression: `document.getElementById('taskInput').value='Cut fabric';document.getElementById('btnAddTask').click();
               document.getElementById('taskInput').value='Embroidery';document.getElementById('btnAddTask').click();1`
});
await sleep(400);

const r = await send('Runtime.evaluate', {
  returnByValue: true, awaitPromise: true,
  expression: `(function(){
    var ids = ['screenDetail','workCard','stageSteps','progText','btnPin','btnComplete','taskInput','btnAddTask','taskList','photoGrid','dTitle','quoteNo','btnBack','btnSave','btnCamera','btnLibrary'];
    var out = { vw: window.innerWidth, vh: window.innerHeight, docW: document.documentElement.scrollWidth, cls: document.body.className };
    ids.forEach(function(id){
      var n = document.getElementById(id);
      if (!n) { out[id] = 'missing'; return; }
      var b = n.getBoundingClientRect();
      out[id] = { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) };
    });
    out.steps = Array.from(document.querySelectorAll('#stageSteps .step')).map(function(s){
      var b = s.getBoundingClientRect();
      return { l: s.textContent.trim(), x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height) };
    });
    out.stepsOverflow = document.getElementById('stageSteps').scrollWidth > document.getElementById('stageSteps').clientWidth + 1;
    out.tasks = Array.from(document.querySelectorAll('#taskList .task')).map(function(t){
      var b = t.getBoundingClientRect();
      return { t: t.textContent.trim().slice(0,18), h: Math.round(b.height), right: Math.round(b.right) };
    });
    out.cards = Array.from(document.querySelectorAll('#screenDetail .card')).map(function(c){
      var b = c.getBoundingClientRect();
      return { h2: (c.querySelector('h2')||{textContent:''}).textContent.slice(0,14), x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height) };
    });
    var s = document.getElementById('sheet');
    out.sheet = { scrollH: s.scrollHeight, clientH: s.clientHeight, scrollW: s.scrollWidth, clientW: s.clientWidth };
    /* anything wider than the viewport */
    var wide = [];
    document.querySelectorAll('#screenDetail *').forEach(function(n){
      var b = n.getBoundingClientRect();
      if (b.width > 0 && b.right > window.innerWidth + 2) wide.push((n.id || n.className || n.tagName) + ':' + Math.round(b.right));
    });
    out.spill = wide.slice(0, 8);
    return out;
  })()`
});
console.log(JSON.stringify(r.result.value, null, 2));
ws.close(); chrome.kill(); process.exit(0);
