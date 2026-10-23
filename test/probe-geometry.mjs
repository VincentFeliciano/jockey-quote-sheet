/* Exact geometry probe: instruments the canvas, renders a filled quote, and
   records every fillRect (colour squares) and fillText (text box) with real
   coordinates. Then it asks the one question that matters: does any text
   overlap a square? Writes test/geometry.json for chipcheck.py to read.
   Run: node test/probe-geometry.mjs   (server on 127.0.0.1:8789) */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;
const URL = process.env.QS_URL || 'http://127.0.0.1:8789/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-geo-'));
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
  return new Promise((res, rej) => {
    pending.set(id, { resolve: res, reject: rej });
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

/* instrument every 2d context before the export builds its canvas */
await evalJs(`(function(){
  window.__geo = { rects: [], texts: [] };
  var orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, opts){
    var ctx = orig.call(this, type, opts);
    if (type === '2d' && ctx && !ctx.__wrapped) {
      ctx.__wrapped = true;
      var fr = ctx.fillRect.bind(ctx);
      ctx.fillRect = function(x, y, w, h){
        window.__geo.rects.push({ x: x, y: y, w: w, h: h, fill: String(ctx.fillStyle) });
        return fr(x, y, w, h);
      };
      var ft = ctx.fillText.bind(ctx);
      ctx.fillText = function(t, x, y){
        var str = String(t);
        var m = ctx.measureText(str);
        var asc = (m.actualBoundingBoxAscent != null) ? m.actualBoundingBoxAscent : 12;
        var desc = (m.actualBoundingBoxDescent != null) ? m.actualBoundingBoxDescent : 4;
        var left = x;
        if (ctx.textAlign === 'right') left = x - m.width;
        else if (ctx.textAlign === 'center') left = x - m.width / 2;
        window.__geo.texts.push({ t: str, x: left, y: y - asc, w: m.width, h: asc + desc, align: String(ctx.textAlign) });
        return ft(t, x, y);
      };
    }
    return ctx;
  };
  return 'instrumented';
})()`);

/* the same fully-loaded quote the export probe uses */
await evalJs(`(async function(){
  var qs = await QS.store.listQuotes();
  var q = QS.ensureShape(qs[0]);
  q.job = { jockey: 'Stocky the Jockey', due: '2026-11-02', rush: true };
  q.paint.hat = { front: '#ffd60a', left: '#111111', right: '#111111', back: '#ffd60a', bill: '#111111',
    frontDesign: 'gold leaf edge', leftDesign: '', rightDesign: '', backDesign: '', billDesign: '' };
  q.paint.figure = { eyes: '#3b2a1a', hair: '#1a1a1a', body: '#ffffff', sleeves: '#ffd60a',
    cuffs: '#111111', buttons: '#111111', pants: '#ffffff', boots: '#111111', bootCuffs: '#ffd60a',
    eyesDesign: 'gloss', hairDesign: '', bodyDesign: '', sleevesDesign: 'checkerboard on the sleeves',
    cuffsDesign: 'stripes', buttonsDesign: '', pantsDesign: '', bootsDesign: '', bootCuffsDesign: '' };
  q.paint.base = { platform: '#2f7d32', base: '#000000', frontText: 'CRAFTER\\u2019S GALLERY', backText: '2026',
    platformDesign: '', baseDesign: '' };
  q.paint.chestLogo = true; q.paint.chestText = 'CG monogram';
  q.paint.backArt = true; q.paint.backText = 'Saddle and number 7';
  q.paint.method = 'Mixed'; q.paint.custom = 'Vinyl cut lettering on the base, matte top coat.';
  q.pricing = { paintTier: 'complex', decals: 2, decalWhere: 'Front and back', delivery: true };
  q.restore = { concrete: true, work: 'Both', strip: true, resurface: true,
    note: 'Crack down the left shoulder, repointed and sealed.' };
  q.discount = 25; q.taxRate = 0; q.deposit = 100;
  q.notes = 'Customer wants it before the meet. Base lettering in white vinyl, sealed with two coats.';
  q.log = [{ ts: new Date().toISOString(), text: 'Deposit taken' }];
  await QS.store.putQuote(q);
  if (QS.exportDoc.brandReady) await QS.exportDoc.brandReady();
  window.__geo.rects = []; window.__geo.texts = [];
  QS.exportDoc.png(q);
  return window.__geo;
})()`);

const geo = await evalJs('JSON.stringify(window.__geo)');
writeFileSync(resolve('test/geometry.json'), geo);

ws.close();
chrome.kill();
console.log('geometry written: test/geometry.json');
