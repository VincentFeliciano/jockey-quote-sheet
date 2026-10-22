/* Checks the printed sheet's brand band without a printer:
   build the HTML, then assert the marks and the strap are in it.
   Run: node test/probe-print.mjs   (server on 127.0.0.1:8789) */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;
const URL = process.env.QS_URL || 'http://127.0.0.1:8789/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-print-'));
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
await sleep(400);

const r = await send('Runtime.evaluate', {
  expression: `(async function(){
    var qs = await QS.store.listQuotes();
    var q = QS.ensureShape(qs[0]);
    var html = QS.printDoc.build(q, []);
    var host = document.createElement('div');
    host.innerHTML = html;
    var band = host.querySelector('.p-brand');
    if (!band) return { band: false };
    var imgs = [].map.call(band.querySelectorAll('img'), function (i) {
      return { src: i.getAttribute('src'), alt: i.alt };
    });
    var tag = band.querySelector('.p-brand-tag');
    /* do the files actually resolve? */
    var loaded = await Promise.all(imgs.map(function (o) {
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () { res(o.src + ' ' + im.naturalWidth + 'x' + im.naturalHeight); };
        im.onerror = function () { res(o.src + ' MISSING'); };
        im.src = o.src;
      });
    }));
    return {
      band: true,
      first: html.indexOf('p-brand') < html.indexOf('p-head'),
      imgs: imgs,
      tag: tag ? tag.textContent : null,
      loaded: loaded
    };
  })()`,
  awaitPromise: true,
  returnByValue: true
});

if (r.exceptionDetails) {
  console.log('ERROR ' + r.exceptionDetails.text);
  process.exitCode = 1;
} else {
  const v = r.result.value;
  console.log('band present   ' + v.band);
  if (v.band) {
    console.log('band first     ' + v.first);
    console.log('tag            ' + JSON.stringify(v.tag));
    v.imgs.forEach((i) => console.log('img            ' + i.src + '  alt=' + JSON.stringify(i.alt)));
    v.loaded.forEach((l) => console.log('resolves       ' + l));
    const ok = v.first && v.imgs.length === 2 && v.tag &&
      v.loaded.every((l) => !/MISSING/.test(l));
    console.log(ok ? 'PASS' : 'FAIL');
    if (!ok) process.exitCode = 1;
  } else {
    process.exitCode = 1;
  }
}

/* ---------- one sheet, not two ---------- */
const built = await send('Runtime.evaluate', {
  expression: `(async function(){
    var qs = await QS.store.listQuotes();
    var q = QS.ensureShape(qs[0]);
    /* the fullest quote the app can hold: every part, a design on each, a
       restoration, notes and a log — if this fits one page, anything fits */
    q.job = { jockey: 'Stocky the Jockey', due: '2026-11-02', rush: true };
    q.paint.hat = { front: '#ffd60a', left: '#111111', right: '#111111', back: '#ffd60a', bill: '#111111',
      frontDesign: 'Checkerboard band across the front', leftDesign: 'CG monogram in vinyl',
      rightDesign: 'Number 7, white outline', backDesign: 'Saddle and reins', billDesign: 'Thin yellow pinstripe' };
    q.paint.figure = { eyes: '#3b2a1a', hair: '#1a1a1a', body: '#ffffff', sleeves: '#ffd60a',
      cuffs: '#111111', buttons: '#111111', pants: '#ffffff', boots: '#111111', bootCuffs: '#ffd60a',
      eyesDesign: 'Wide open, black outline', hairDesign: 'Side parting, painted flat',
      bodyDesign: 'Clean white, two coats', sleevesDesign: 'Checkerboard down the sleeve',
      cuffsDesign: 'Plain black', buttonsDesign: 'Three black buttons', pantsDesign: 'Yellow side stripe',
      bootsDesign: 'Black with yellow tops', bootCuffsDesign: 'Yellow fold-over' };
    q.paint.base = { platform: '#2f7d32', base: '#000000', frontText: 'CRAFTER\\u2019S GALLERY', backText: '2026',
      platformDesign: 'Green felt top', baseDesign: 'Matte black, sealed' };
    q.paint.chestLogo = true; q.paint.chestText = 'CG monogram';
    q.paint.backArt = true; q.paint.backText = 'Saddle and number 7';
    q.paint.method = 'Mixed'; q.paint.custom = 'Vinyl cut lettering on the base, matte top coat.';
    q.pricing = { paintTier: 'complex', decals: 2, decalWhere: 'Front and back', delivery: true };
    q.restore = { concrete: true, work: 'Both', strip: true, resurface: true,
      note: 'Crack down the left shoulder, repointed and sealed.' };
    q.discount = 25; q.taxRate = 0; q.deposit = 100;
    q.notes = 'Customer wants it before the meet. Base lettering in white vinyl, sealed with two coats. ' +
      'Bring the spare hat so the front panel can be matched.';
    q.log = [{ ts: new Date().toISOString(), text: 'Deposit taken' },
             { ts: new Date().toISOString(), text: 'Colours agreed' }];
    await QS.store.putQuote(q);
    var sheet = document.getElementById('printSheet');
    sheet.innerHTML = QS.printDoc.build(q, []);
    return QS.printDoc.fit(sheet);
  })()`,
  awaitPromise: true,
  returnByValue: true
});
if (built.exceptionDetails) {
  console.log('ERROR ' + built.exceptionDetails.text);
  process.exitCode = 1;
} else {
  const v = built.result.value;
  console.log('sheet height   ' + Math.round(v.height) + 'px of 980');
  console.log('sheet width    ' + Math.round(v.width) + 'px of 740');
  console.log('shrink to fit  ' + v.zoom);
  if (v.width > 740) {
    console.log('FAIL — the sheet runs past the page width');
    process.exitCode = 1;
  }
}
await sleep(300);

const printed = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
const pdfTxt = Buffer.from(printed.data, 'base64').toString('latin1');
const pageCount = (pdfTxt.match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log('printed pages  ' + pageCount);
if (pageCount !== 1) {
  console.log('FAIL — the sheet spilled onto a second page');
  process.exitCode = 1;
}

ws.close();
chrome.kill();
