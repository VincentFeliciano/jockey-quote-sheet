/* Layout audit for the exported sheet, without eyes on it: wraps canvas text
   drawing, renders a full quote, and reports overflow, collisions and empty
   pages. Run: node test/probe-layout.mjs   (server on 127.0.0.1:8789) */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;
const URL = process.env.QS_URL || 'http://127.0.0.1:8789/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-layout-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome never exposed a page target');
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
await send('Page.navigate', { url: URL });
for (let i = 0; i < 60; i++) {
  await sleep(250);
  const r = await send('Runtime.evaluate', {
    expression: "!!(window.QS && document.body && /view-/.test(document.body.className))",
    returnByValue: true
  }).catch(() => null);
  if (r && r.result && r.result.value) break;
}
await sleep(500);

async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

const report = await evalJs(`(async function(){
  var W = 1240, H = 1754, M = 84, CW = W - M * 2;

  var qs = await QS.store.listQuotes();
  var q = QS.ensureShape(qs[0]);
  q.job = { jockey: 'Stocky the Jockey', due: '2026-11-02', rush: true };
  q.paint.hat = { front: '#ffd60a', left: '#111111', right: '#111111', back: '#ffd60a', bill: '#111111' };
  q.paint.figure = { eyes: '#3b2a1a', hair: '#1a1a1a', body: '#ffffff', sleeves: '#ffd60a',
    cuffs: '#111111', buttons: '#111111', pants: '#ffffff', boots: '#111111', bootCuffs: '#ffd60a' };
  q.paint.base = { platform: '#2f7d32', base: '#000000',
    frontText: 'CRAFTER\\u2019S GALLERY', backText: '2026' };
  q.paint.chestLogo = true; q.paint.chestText = 'CG monogram';
  q.paint.backArt = true; q.paint.backText = 'Saddle and number 7';
  q.paint.method = 'Mixed';
  q.paint.custom = 'Vinyl cut lettering on the base, matte top coat, extra detail on the boots.';
  q.pricing = { paintTier: 'complex', decals: 2, decalWhere: 'Front and back', delivery: true };
  q.restore = { concrete: true, work: 'Both', strip: true, resurface: true,
    note: 'Crack down the left shoulder, repointed and sealed.' };
  q.discount = 25; q.taxRate = 0; q.deposit = 100;
  q.notes = 'Customer wants it before the meet. Base lettering in white vinyl, sealed with two coats.';
  q.log = [{ ts: new Date().toISOString(), text: 'Deposit taken' }];

  var pages = QS.exportDoc.render(q);

  /* replay the drawing, recording every string the renderer puts down.
     Each canvas is numbered as its 2d context is first taken, so the recorder
     knows which page a string landed on. */
  var proto = CanvasRenderingContext2D.prototype;
  var realFillText = proto.fillText;
  var realGet = HTMLCanvasElement.prototype.getContext;
  var counter = 0;
  var marks = [];

  HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d' && this.__pid === undefined) this.__pid = ++counter;
    return realGet.apply(this, arguments);
  };

  proto.fillText = function (text, x, y) {
    if (this.canvas && this.canvas.__pid !== undefined) {
      var w = this.measureText(String(text)).width;
      var align = this.textAlign || 'left';
      var left = align === 'right' ? x - w : (align === 'center' ? x - w / 2 : x);
      marks.push({ page: this.canvas.__pid - 1, text: String(text), left: left, right: left + w, y: y,
        size: parseFloat(this.font) || 20 });
    }
    return realFillText.apply(this, arguments);
  };

  counter = 0;
  var pages2 = QS.exportDoc.render(q);
  proto.fillText = realFillText;
  HTMLCanvasElement.prototype.getContext = realGet;

  pages = pages2;
  var out = { pages: pages.length, overflow: [], intoFooter: [], collisions: [], lowest: [] };

  marks.forEach(function (m) {
    if (m.right > W - M + 2 || m.left < M - 2) {
      out.overflow.push({ page: m.page, text: m.text.slice(0, 42), left: Math.round(m.left), right: Math.round(m.right) });
    }
    if (m.y > H - 110 && !/^Page \\d+ of \\d+$/.test(m.text) &&
        m.text.indexOf(String(q.number || 'Quote')) !== 0) {
      out.intoFooter.push({ page: m.page, text: m.text.slice(0, 42), y: Math.round(m.y) });
    }
  });

  /* two strings on the same page at the same height are a collision */
  for (var i = 0; i < marks.length; i++) {
    for (var j = i + 1; j < marks.length; j++) {
      var a = marks[i], b = marks[j];
      if (a.page !== b.page) continue;
      if (Math.abs(a.y - b.y) > 6) continue;
      var overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (overlap > 2) {
        out.collisions.push({
          page: a.page, a: a.text.slice(0, 30), b: b.text.slice(0, 30), overlap: Math.round(overlap)
        });
      }
    }
  }

  for (var p = 0; p < pages.length; p++) {
    var body = marks.filter(function (m) { return m.page === p && m.y < H - 96; });
    out.lowest.push(body.length ? Math.round(Math.max.apply(null, body.map(function (m) { return m.y; }))) : 0);
  }

  /* and every page must have ink on it */
  out.emptyPages = [];
  pages.forEach(function (c, i) {
    var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    var ink = 0;
    for (var k = 0; k < d.length; k += 64) {
      if (d[k] < 200 || d[k + 1] < 200 || d[k + 2] < 200) ink++;
    }
    if (ink < 200) out.emptyPages.push(i + 1);
  });

  out.marks = marks.length;
  out.text = marks.map(function (m) {
    return { page: m.page, y: m.y, text: m.text };
  });
  return out;
})()`);

console.log('pages           ' + report.pages);
console.log('strings drawn   ' + report.marks);
console.log('lowest content  ' + report.lowest.join(', ') + '   (page height 1754, footer band starts 1658)');
console.log('empty pages     ' + (report.emptyPages.length ? report.emptyPages.join(', ') : 'none'));
console.log('past the margin ' + (report.overflow.length ? JSON.stringify(report.overflow, null, 1) : 'none'));
console.log('in the footer   ' + (report.intoFooter.length ? JSON.stringify(report.intoFooter, null, 1) : 'none'));
console.log('collisions      ' + (report.collisions.length ? JSON.stringify(report.collisions, null, 1) : 'none'));

console.log('\n--- every string on the sheet, in drawing order ---');
report.text.forEach(function (t) {
  console.log('p' + (t.page + 1) + ' y' + String(Math.round(t.y)).padStart(4) + '  ' + t.text);
});

const bad = report.emptyPages.length + report.overflow.length + report.intoFooter.length + report.collisions.length;
ws.close();
chrome.kill();
process.exit(bad ? 1 : 0);
