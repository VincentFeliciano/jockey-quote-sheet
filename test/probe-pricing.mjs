/* Layout probe for the pricing card and the header mark.
   Dumps geometry so the screen can be judged without a vision model. */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;
const URL = 'http://127.0.0.1:8789/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-pp-'));
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
    expression: `!!(window.QS && document.body && /view-/.test(document.body.className) && document.getElementById('tierRow'))`
  }).catch(() => null);
  if (r && r.result && r.result.value) break;
}
await sleep(600);

/* drive it into a realistic state */
await send('Runtime.evaluate', { expression: `document.querySelector('#tierRow .tier[data-tier="complex"]').click();
  document.getElementById('btnDecalPlus').click();
  document.getElementById('btnDecalPlus').click();
  document.getElementById('decalWhere').value='Front and bottom';
  document.getElementById('decalWhere').dispatchEvent(new Event('input',{bubbles:true}));
  document.getElementById('delivery').click(); 1` });
await sleep(600);

const r = await send('Runtime.evaluate', {
  returnByValue: true, awaitPromise: true,
  expression: `(function(){
    var out = { vw: window.innerWidth, docW: document.documentElement.scrollWidth };
    function rect(n){ var b=n.getBoundingClientRect(); return {x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height), right:Math.round(b.right), bottom:Math.round(b.bottom)}; }

    var card = document.getElementById('tierRow').closest('.card');
    card.scrollIntoView({block:'start'});
    out.card = rect(card);

    out.tiers = Array.from(document.querySelectorAll('#tierRow .tier')).map(function(b){
      var q = rect(b);
      q.label = b.querySelector('.tier-label').textContent;
      q.price = b.querySelector('.tier-price').textContent;
      q.on = b.classList.contains('on');
      q.labelW = Math.round(b.querySelector('.tier-label').scrollWidth);
      q.labelBox = Math.round(b.querySelector('.tier-label').getBoundingClientRect().width);
      return q;
    });
    out.tierRowSpill = document.getElementById('tierRow').scrollWidth > document.getElementById('tierRow').clientWidth + 1;

    out.decalRow = rect(document.querySelector('.decal-row'));
    out.stepper = rect(document.querySelector('.stepper'));
    out.decalWhere = rect(document.querySelector('.decal-where'));
    out.toggle = rect(document.querySelector('.toggle-row'));
    out.switchBox = rect(document.getElementById('delivery'));
    out.paintLine = document.getElementById('pPaint').textContent;
    out.decalLine = document.getElementById('pDecals').textContent;
    out.deliveryLine = document.getElementById('pDelivery').textContent;
    out.total = document.getElementById('tTotal').textContent;

    /* vertical stacking: nothing in the card may overlap the thing below it */
    var kids = Array.from(card.children).map(function(n){
      return { tag: n.className || n.tagName, ...rect(n) };
    });
    out.cardChildren = kids;
    var overlaps = [];
    for (var i=1;i<kids.length;i++){
      if (kids[i].y < kids[i-1].bottom - 1) overlaps.push(kids[i-1].tag + ' / ' + kids[i].tag);
    }
    out.overlaps = overlaps;

    /* the header mark */
    var img = document.querySelector('.brand img.plymr');
    out.logo = img ? rect(img) : 'missing';
    out.logoLoaded = img ? (img.complete && img.naturalWidth) : 0;
    out.brandText = document.querySelector('.brand').textContent.trim();
    out.barH = Math.round(document.querySelector('#screenList .bar').getBoundingClientRect().height);

    /* anything spilling past the right edge anywhere in the detail screen */
    var wide = [];
    document.querySelectorAll('#screenDetail *').forEach(function(n){
      var b = n.getBoundingClientRect();
      if (b.width > 0 && b.right > window.innerWidth + 2) wide.push((n.id || n.className || n.tagName) + ':' + Math.round(b.right));
    });
    out.spill = wide.slice(0, 10);
    return out;
  })()`
});
console.log(JSON.stringify(r.result.value, null, 2));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(process.cwd(), 'test', 'probe-pricing.png'), Buffer.from(shot.data, 'base64'));

/* header shot: back to the list, where the mark lives */
await send('Runtime.evaluate', { expression: `document.getElementById('btnBack').click(); 1` });
await sleep(700);

const logoProbe = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(function(){
    var img = document.querySelector('.brand img.plymr');
    var bar = document.querySelector('#screenList .bar');
    var b = img.getBoundingClientRect(), bb = bar.getBoundingClientRect();
    return {
      view: document.body.className,
      bar: { x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.width), h: Math.round(bb.height) },
      logo: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) },
      natural: img.naturalWidth + 'x' + img.naturalHeight,
      insideBar: b.top >= bb.top - 1 && b.bottom <= bb.bottom + 1 && b.left >= bb.left - 1 && b.right <= bb.right + 1,
      brand: document.querySelector('.brand').textContent.trim(),
      overlapNew: (function(){ var n = document.getElementById('btnNew').getBoundingClientRect(); return b.right > n.left; })()
    };
  })()`
});
console.log('\nLIST HEADER:\n' + JSON.stringify(logoProbe.result.value, null, 2));

const shot2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(process.cwd(), 'test', 'probe-header.png'), Buffer.from(shot2.data, 'base64'));

ws.close(); chrome.kill(); process.exit(0);
