/* Header lockup probe: PLYMR mark, the word "for", the CG mark.
   Geometry + containment, so the bar can be judged without a vision model. */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9341;
const URL = process.env.QS_URL || 'http://127.0.0.1:8789/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-brand-'));
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
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  }
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
    expression: `!!(window.QS && document.body && /view-list/.test(document.body.className) && document.querySelector('.brand .cg'))`
  }).catch(() => null);
  if (r && r.result && r.result.value) break;
}
await sleep(500);

/* the app restores whichever screen was last open — get back to the list,
   that is where the brand bar lives */
await send('Runtime.evaluate', { expression: `(function(){
  var b = document.getElementById('btnBack');
  if (/view-detail/.test(document.body.className) && b) b.click();
  return document.body.className;
})()` });
await sleep(600);

const r = await send('Runtime.evaluate', {
  returnByValue: true, awaitPromise: true,
  expression: `(function(){
    function rect(n){ var b=n.getBoundingClientRect(); return {x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height), right:Math.round(b.right), bottom:Math.round(b.bottom)}; }
    var bar = document.querySelector('#screenList .bar');
    var bb = bar.getBoundingClientRect();
    var out = { vw: window.innerWidth, view: document.body.className,
                bar: { x:Math.round(bb.x), y:Math.round(bb.y), w:Math.round(bb.width), h:Math.round(bb.height) } };

    var items = [];
    document.querySelectorAll('.brand > *').forEach(function(n){
      var q = rect(n);
      q.tag = n.tagName.toLowerCase() + (n.className ? '.' + n.className.split(' ').join('.') : '');
      if (n.tagName === 'IMG') { q.src = n.getAttribute('src'); q.natural = n.naturalWidth + 'x' + n.naturalHeight; q.loaded = !!(n.complete && n.naturalWidth); }
      else { q.text = n.textContent; }
      items.push(q);
    });
    out.items = items;
    out.brandBox = rect(document.querySelector('.brand'));
    out.tools = rect(document.querySelector('.bar-tools'));
    out.brandOverlapsTools = out.brandBox.right > out.tools.x;

    /* every item inside the bar, in order, no overlaps */
    out.insideBar = items.every(function(q){ return q.y >= Math.round(bb.y) - 1 && q.bottom <= Math.round(bb.bottom) + 1 && q.right <= Math.round(bb.right) + 1; });
    var overlaps = [];
    for (var i = 1; i < items.length; i++) if (items[i].x < items[i-1].right - 0.5) overlaps.push(items[i-1].tag + ' / ' + items[i].tag);
    out.itemOverlaps = overlaps;
    out.verticalCentre = items.map(function(q){ return Math.round((q.y + q.bottom) / 2 - (bb.y + bb.height / 2)); });

    out.spill = [];
    document.querySelectorAll('#screenList .bar *').forEach(function(n){
      var b = n.getBoundingClientRect();
      if (b.width > 0 && b.right > window.innerWidth + 1) out.spill.push((n.id || n.className || n.tagName) + ':' + Math.round(b.right));
    });
    return out;
  })()`
});
console.log(JSON.stringify(r.result.value, null, 2));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(process.cwd(), 'test', 'probe-brand.png'), Buffer.from(shot.data, 'base64'));

ws.close(); chrome.kill(); process.exit(0);
