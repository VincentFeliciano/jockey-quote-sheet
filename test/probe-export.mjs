/* Builds a filled quote and writes the exported PNG and PDF to test/.
   Run: node test/probe-export.mjs   (server on 127.0.0.1:8789) */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9336;
const URL = process.env.QS_URL || 'http://127.0.0.1:8789/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-export-'));
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

/* fill a realistic quote */
await evalJs(`(async function(){
  var qs = await QS.store.listQuotes();
  var q = QS.ensureShape(qs[0]);
  q.job = { jockey: 'Stocky the Jockey', due: '2026-11-02', rush: true };
  q.paint.hat = { front: '#ffd60a', left: '#111111', right: '#111111', back: '#ffd60a', bill: '#111111' };
  q.paint.figure = { eyes: '#3b2a1a', hair: '#1a1a1a', body: '#ffffff', sleeves: '#ffd60a',
    cuffs: '#111111', buttons: '#111111', pants: '#ffffff', boots: '#111111', bootCuffs: '#ffd60a' };
  q.paint.base = { platform: '#2f7d32', base: '#000000', frontText: 'CRAFTER\\u2019S GALLERY', backText: '2026' };
  q.paint.chestLogo = true; q.paint.chestText = 'CG monogram';
  q.paint.backArt = true; q.paint.backText = 'Saddle and number 7';
  q.paint.method = 'Mixed'; q.paint.custom = 'Vinyl cut lettering on the base, matte top coat.';
  q.pricing = { paintTier: 'complex', decals: 2, decalWhere: 'Front and back', delivery: true };
  q.discount = 25; q.taxRate = 0; q.deposit = 100;
  q.notes = 'Customer wants it before the meet. Base lettering in white vinyl, sealed with two coats.';
  q.log = [{ ts: new Date().toISOString(), text: 'Deposit taken' }];
  await QS.store.putQuote(q);
  return q.number;
})()`);

const png = await evalJs(`(async function(){
  var qs = await QS.store.listQuotes();
  var out = QS.exportDoc.png(QS.ensureShape(qs[0]));
  var b = new Uint8Array(await out.blob.arrayBuffer());
  var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return { name: out.name, b64: btoa(s), pages: out.pages };
})()`);
writeFileSync(resolve('test/export-sample.png'), Buffer.from(png.b64, 'base64'));

const pdf = await evalJs(`(async function(){
  var qs = await QS.store.listQuotes();
  var out = QS.exportDoc.pdf(QS.ensureShape(qs[0]));
  var b = new Uint8Array(await out.blob.arrayBuffer());
  var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return { name: out.name, b64: btoa(s), pages: out.pages };
})()`);
writeFileSync(resolve('test/export-sample.pdf'), Buffer.from(pdf.b64, 'base64'));

console.log('png ' + png.name + ' pages=' + png.pages + ' bytes=' + Buffer.from(png.b64, 'base64').length);
console.log('pdf ' + pdf.name + ' pages=' + pdf.pages + ' bytes=' + Buffer.from(pdf.b64, 'base64').length);

ws.close();
chrome.kill();
