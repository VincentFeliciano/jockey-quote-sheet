/* Phone smoke test — drives headless Chrome at iPhone size over CDP.
   Run:  node test/mobile.mjs        (server must be on 127.0.0.1:8789)
   Exits 0 on pass, 1 on any failure. Writes test/mobile.png, mobile-list.png,
   mobile-settings.png. */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9334;
const URL = process.env.QS_URL || 'http://127.0.0.1:8789/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-mobile-'));
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
await send('DOM.enable');

/* iPhone 13-ish: 390 x 844, 2x, touch */
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  screenWidth: 390, screenHeight: 844
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: URL });
/* wait for boot to settle (a single load, so no double-boot race) */
for (let i = 0; i < 60; i++) {
  await sleep(250);
  const r = await send('Runtime.evaluate', {
    expression: "!!(window.QS && document.body && /view-/.test(document.body.className) && document.querySelectorAll('#sections .card').length >= 5)",
    returnByValue: true
  }).catch(() => null);
  if (r && r.result && r.result.value) break;
}
await sleep(400);

let failures = 0;
let checks = 0;

async function evalJs(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr, awaitPromise: true, returnByValue: true
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr.slice(0, 90));
  return r.result.value;
}

async function check(name, expr, want) {
  checks++;
  let got;
  try { got = await evalJs(expr); } catch (e) { got = 'ERR ' + e.message; }
  const ok = want === undefined ? got === true : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : `   want=${JSON.stringify(want)} got=${JSON.stringify(got)}`));
}

function setField(labelText, value) {
  return `(function(){
    var labels = document.querySelectorAll('#sections label');
    for (var i=0;i<labels.length;i++){
      var s = labels[i].querySelector('span');
      if (s && s.textContent.trim() === ${JSON.stringify(labelText)}) {
        var inp = labels[i].querySelector('input,textarea');
        if (!inp) return false;
        inp.value = ${JSON.stringify(value)};
        inp.dispatchEvent(new Event('input', {bubbles:true}));
        return true;
      }
    }
    return false;
  })()`;
}

/* ---------- first run ---------- */
await check('app booted', "!!window.QS && !!document.querySelector('.bar')", true);
await check('viewport is phone width', 'window.innerWidth', 390);
await check('no horizontal overflow', 'document.documentElement.scrollWidth <= window.innerWidth + 1', true);
await check('first run opens a quote', "document.body.classList.contains('view-detail')", true);
await check('detail screen visible', "getComputedStyle(document.getElementById('screenDetail')).display", 'flex');
await check('list screen hidden', "getComputedStyle(document.getElementById('screenList')).display", 'none');
await check('quote number allocated', "/^JQ-\\d{4}-\\d{3}$/.test(document.getElementById('quoteNo').textContent)", true);
await check('camera input has capture', "document.getElementById('photoCamera').getAttribute('capture')", 'environment');
await check('library input allows multiple', "document.getElementById('photoFile').hasAttribute('multiple')", true);

/* ---------- the statue spec ---------- */
await check('six spec cards', "document.querySelectorAll('#sections .card').length", 6);
await check('card titles', "(function(){var t=[];document.querySelectorAll('#sections .card h2').forEach(function(h){t.push(h.textContent.trim());});return t.join('|');})()",
  'The piece|Hat|Jockey|Platform & base|Custom request|Restoration');
await check('hat has five panels', "document.querySelectorAll('#sections input[type=color][data-k^=\"paint.hat.\"]').length", 5);
await check('jockey has nine colours', "document.querySelectorAll('#sections input[type=color][data-k^=\"paint.figure.\"]').length", 9);
await check('hat panel names', "(function(){var t=[];document.querySelectorAll('#sections input[type=color][data-k^=\"paint.hat.\"]').forEach(function(i){t.push(i.closest('label').querySelector('span').textContent.trim());});return t.join('|');})()",
  'Front panel|Left side|Right side|Back panel|Bill');
await check('platform defaults to green',
  "document.querySelector('#sections input[data-k=\"paint.base.platform\"]').value", '#2f7d32');
await check('base defaults to black',
  "document.querySelector('#sections input[data-k=\"paint.base.base\"]').value", '#000000');
await check('chest logo switch present', "!!document.querySelector('#sections label[data-k=\"paint.chestLogo\"] input[type=checkbox]')", true);
await check('back artwork switch present', "!!document.querySelector('#sections label[data-k=\"paint.backArt\"] input[type=checkbox]')", true);
await check('base front and back text', "(function(){var n=0;document.querySelectorAll('#sections label span').forEach(function(s){if(/^Text on base/.test(s.textContent.trim()))n++;});return n;})()", 2);
await check('custom request field', "(function(){var l=document.querySelectorAll('#sections label');for(var i=0;i<l.length;i++){var s=l[i].querySelector('span');if(s&&s.textContent.trim()==='What they asked for')return !!l[i].querySelector('textarea');}return false;})()", true);
await check('method select', "!!document.querySelector('#sections select')", true);
await check('no valid-until field', "!!document.getElementById('metaValid')", false);
await check('meta row is number, status, prepared by',
  "(function(){return document.querySelectorAll('.doc-head .meta-row label').length;})()", 3);
await check('prepared by is Vincent', "document.getElementById('metaPreparedBy').value", 'Vincent Feliciano');
await check('no silks section left', "/silks/i.test(document.getElementById('sections').innerText)", false);

/* ---------- restoration ---------- */
await check('restoration card present',
  "(function(){var h=document.querySelectorAll('#sections .card h2');for(var i=0;i<h.length;i++){if(h[i].textContent.trim()==='Restoration')return true;}return false;})()", true);
await check('concrete switch present', "!!document.querySelector('#sections label[data-k=\"restore.concrete\"] input[type=checkbox]')", true);
await check('strip switch present', "!!document.querySelector('#sections label[data-k=\"restore.strip\"] input[type=checkbox]')", true);
await check('resurface switch present', "!!document.querySelector('#sections label[data-k=\"restore.resurface\"] input[type=checkbox]')", true);
await check('work type choices',
  "(function(){var s=document.querySelector('#sections select[data-k=\"restore.work\"]');if(!s)return 'missing';var o=[];s.querySelectorAll('option').forEach(function(x){o.push(x.value);});return o.join('|');})()",
  '|None|Surface work|Structure work|Both');
await check('strip line hidden until needed', "document.getElementById('rowStrip').hidden", true);
await check('resurface line hidden until needed', "document.getElementById('rowSurface').hidden", true);

/* ---------- pricing: paint tier, decals, delivery ---------- */
await check('paint job card exists', "!!document.getElementById('tierRow')", true);
await check('three paint tiers', "document.querySelectorAll('#tierRow .tier').length", 3);
await check('tier names and prices', "(function(){var t=[];document.querySelectorAll('#tierRow .tier').forEach(function(b){t.push(b.querySelector('.tier-label').textContent+'='+b.querySelector('.tier-price').textContent);});return t.join('|');})()",
  'Simple=$150.00|Standard=$175.00|Complex=$200.00');
await check('standard selected by default', "document.querySelector('#tierRow .tier.on .tier-label').textContent", 'Standard');
await check('decal count starts at zero', "document.getElementById('decalCount').textContent", '0');
await check('decal rate shown', "document.getElementById('decalRate').textContent", '$10.00 each');
await check('delivery rate shown', "document.getElementById('deliveryRate').textContent", '$25.00');
await check('delivery off by default', "document.getElementById('delivery').checked", false);
await check('paint line shows the tier price', "document.getElementById('pPaint').textContent", '$175.00');

/* pick the complex tier */
await evalJs(`document.querySelector('#tierRow .tier[data-tier="complex"]').click()`);
await sleep(300);
await check('complex tier selects', "document.querySelector('#tierRow .tier.on .tier-label').textContent", 'Complex');
await check('paint line follows the tier', "document.getElementById('pPaint').textContent", '$200.00');
await check('total follows the tier', "document.getElementById('tTotal').textContent", '$200.00');

/* two decals at ten each */
await evalJs(`document.getElementById('btnDecalPlus').click()`);
await sleep(200);
await evalJs(`document.getElementById('btnDecalPlus').click()`);
await sleep(300);
await check('decal stepper counts up', "document.getElementById('decalCount').textContent", '2');
await check('decals priced at ten each', "document.getElementById('pDecals').textContent", '$20.00');
await check('total includes decals', "document.getElementById('tTotal').textContent", '$220.00');

/* minus goes back down and never below zero */
await evalJs(`document.getElementById('btnDecalMinus').click()`);
await sleep(250);
await check('decal stepper counts down', "document.getElementById('decalCount').textContent", '1');
await evalJs(`document.getElementById('btnDecalMinus').click()`);
await sleep(150);
await evalJs(`document.getElementById('btnDecalMinus').click()`);
await sleep(250);
await check('decals never go negative', "document.getElementById('decalCount').textContent", '0');

/* delivery */
await evalJs(`document.getElementById('delivery').click()`);
await sleep(300);
await check('delivery switches on', "document.getElementById('delivery').checked", true);
await check('delivery line shows the fee', "document.getElementById('pDelivery').textContent", '$25.00');
await check('total includes delivery', "document.getElementById('tTotal').textContent", '$225.00');

/* restoration — strip and resurface are separate charges */
await evalJs(`document.querySelector('#sections label[data-k="restore.concrete"] input').click()`);
await sleep(200);
await evalJs(`document.querySelector('#sections label[data-k="restore.strip"] input').click()`);
await sleep(300);
await check('concrete switch toggles',
  "document.querySelector('#sections label[data-k=\"restore.concrete\"] input').checked", true);
await check('strip switches on',
  "document.querySelector('#sections label[data-k=\"restore.strip\"] input').checked", true);
await check('strip line appears', "document.getElementById('rowStrip').hidden", false);
await check('strip costs 150', "document.getElementById('pStrip').textContent", '$150.00');
await check('total includes the strip', "document.getElementById('tTotal').textContent", '$375.00');

await evalJs(`document.querySelector('#sections label[data-k="restore.resurface"] input').click()`);
await sleep(300);
await check('resurface line appears', "document.getElementById('rowSurface').hidden", false);
await check('resurface costs 100', "document.getElementById('pSurface').textContent", '$100.00');
await check('total includes both', "document.getElementById('tTotal').textContent", '$475.00');

/* turning the strip back off takes its money away again */
await evalJs(`document.querySelector('#sections label[data-k="restore.strip"] input').click()`);
await sleep(300);
await check('strip line hides again', "document.getElementById('rowStrip').hidden", true);
await check('total drops the strip', "document.getElementById('tTotal').textContent", '$325.00');
await evalJs(`document.querySelector('#sections label[data-k="restore.strip"] input').click()`);
await sleep(250);

/* the whole thing survives a reload, since it is saved to the store */
await sleep(900);
await check('pricing persisted', 
  "(async function(){var qs=await QS.store.listQuotes();return qs[0].pricing.paintTier+'/'+qs[0].pricing.decals+'/'+qs[0].pricing.delivery+'/'+qs[0].restore.concrete+'/'+qs[0].restore.strip+'/'+qs[0].restore.resurface;})()",
  'complex/0/true/true/true/true');

/* extras and customer details are gone — this is the shop's own sheet */
await check('no extras card', "(function(){var h=document.querySelectorAll('.card h2');for(var i=0;i<h.length;i++){if(/^Extras/.test(h[i].textContent.trim()))return true;}return false;})()", false);
await check('no line-item table', "!!document.getElementById('itemRows')", false);
await check('no add-line button', "!!document.getElementById('btnAddItem')", false);
await check('no customer labels', "(function(){var t=document.getElementById('sections').innerText;return /Customer|Business \\/ owner/.test(t);})()", false);

/* the corner mark */
await check('plymr mark in the header', "!!document.querySelector('.brand img.plymr')", true);
await check('plymr mark loads', "(function(){var i=document.querySelector('.brand img.plymr');return i.complete && i.naturalWidth>0;})()", true);
await check('plymr mark is yellow on transparent', 
  "(function(){var c=document.createElement('canvas');var i=document.querySelector('.brand img.plymr');c.width=i.naturalWidth;c.height=i.naturalHeight;var x=c.getContext('2d');x.drawImage(i,0,0);var d=x.getImageData(0,0,c.width,c.height).data;var y=0,clear=0;for(var p=0;p<d.length;p+=4){if(d[p+3]<8){clear++;}else if(d[p]>200&&d[p+1]>160&&d[p+2]<90){y++;}}return y>500 && clear>500;})()",
  true);

/* ---------- fill a quote ---------- */
await evalJs(setField('Jockey name', 'Vince Test'));
await evalJs(setField('Due date', '2026-11-02'));
await evalJs(setField('Platform', '#1f7a3a'));
await evalJs(setField('Bill', '#ffd60a'));
await evalJs(setField('Boots', '#1a1a1a'));
await sleep(1000);
await check('jockey name in title', "document.getElementById('dTitle').textContent", 'Vince Test');
await check('due date kept', "(function(){var l=document.querySelectorAll('#sections label');for(var i=0;i<l.length;i++){var s=l[i].querySelector('span');if(s&&s.textContent.trim()==='Due date')return l[i].querySelector('input').value;}return null;})()", '2026-11-02');
await check('rush job switch present', "!!document.querySelector('#sections label[data-k=\"job.rush\"] input[type=checkbox]')", true);
await check('no size field on the piece', "(function(){var l=document.querySelectorAll('#sections label span');for(var i=0;i<l.length;i++){if(/^size$/i.test(l[i].textContent.trim()))return true;}return false;})()", false);
await check('hat bill colour kept',
  "document.querySelector('#sections input[data-k=\"paint.hat.bill\"]').value", '#ffd60a');
await check('platform colour kept',
  "document.querySelector('#sections input[data-k=\"paint.base.platform\"]').value", '#1f7a3a');

/* ---------- camera photo through the real file input ---------- */
const iconPath = resolve('icons/icon-192.png');
const doc = await send('DOM.getDocument', { depth: 1 });
const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#photoCamera' });
await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [iconPath] });
await evalJs(`document.getElementById('photoCamera').dispatchEvent(new Event('change', {bubbles:true}))`);
await sleep(1500);
await check('camera photo ingested', "document.querySelectorAll('#photoGrid .photo').length", 1);
await check('photo stored against the quote',
  "(async function(){var qs=await QS.store.listQuotes();var ps=await QS.store.photosFor(qs[0].id);return ps.length;})()", 1);

/* ---------- work card ---------- */
await evalJs(`document.getElementById('taskInput').value='Prime'; document.getElementById('btnAddTask').click(); true`);
await evalJs(`document.getElementById('taskInput').value='Stencil and top coat'; document.getElementById('btnAddTask').click(); true`);
await sleep(400);
await check('two tasks listed', "document.querySelectorAll('#taskList .task').length", 2);
await evalJs(`document.querySelectorAll('#taskList .task input[type=checkbox]')[0].click()`);
await sleep(300);
await check('task ticks off', "document.querySelectorAll('#taskList .task.done').length", 1);
await check('progress text', "document.getElementById('progText').textContent", '1 of 2 steps');

await evalJs(`document.querySelectorAll('#stageSteps .step')[2].click()`);
await sleep(400);
await check('stage moved to production', "document.querySelector('#stageSteps .step.on .slabel').textContent", 'In production');

await evalJs(`document.getElementById('btnPin').click()`);
await sleep(500);
await check('pin applied', "document.getElementById('btnPin').textContent", 'Unpin');

/* ---------- list view ---------- */
await evalJs(`document.getElementById('btnBack').click()`);
await sleep(700);
await check('back to list', "document.body.classList.contains('view-list')", true);
await check('one working quote', "document.querySelectorAll('#workList .qrow').length", 1);
await check('row shows pinned', "document.querySelectorAll('#workList .qrow.pinned').length", 1);
await check('row shows stage', "document.querySelector('#workList .stage').textContent", 'In production');
await check('row shows steps', "document.querySelector('#workList .frac').textContent", '1/2');
await check('no horizontal overflow (list)', 'document.documentElement.scrollWidth <= window.innerWidth + 1', true);

/* ---------- new quote, complete it ---------- */
await evalJs(`document.getElementById('btnNew').click()`);
await sleep(1000);
await check('new quote opens detail', "document.body.classList.contains('view-detail')", true);
await evalJs(setField('Jockey name', 'Second Job'));
await sleep(900);
await evalJs(`document.getElementById('btnComplete').click()`);
await sleep(800);
await check('done banner shown', "!document.getElementById('doneBanner').hidden", true);
await evalJs(`document.getElementById('btnBack').click()`);
await sleep(700);
await check('completed quote left working list', "document.querySelectorAll('#workList .qrow').length", 1);
await check('completed quote in previous', "document.querySelectorAll('#prevList .qrow').length", 1);
await check('previous row marked done', "document.querySelectorAll('#prevList .qrow.done').length", 1);

/* ---------- reopen from the row tick ---------- */
await evalJs(`document.querySelector('#prevList .qrow .tick').click()`);
await sleep(800);
await check('reopened back to working', "document.querySelectorAll('#workList .qrow').length", 2);
await check('previous empty again', "document.querySelectorAll('#prevList .qrow').length", 0);

/* ---------- layout sanity ---------- */
await check('search field full width', "Math.round(document.getElementById('search').getBoundingClientRect().width) > 300", true);
await check('row buttons are touch sized',
  "Math.min.apply(null, Array.from(document.querySelectorAll('#workList .tool')).map(function(b){return b.getBoundingClientRect().height})) >= 32", true);

/* ---------- the list is down to one action: Save ---------- */
await check('list Save button', "document.getElementById('btnSaveAll').textContent.trim()", 'Save');
await check('only one main action on the list',
  "document.querySelectorAll('.list-tools-main button').length", 1);
await check('no sync fields anywhere',
  "document.querySelectorAll('#syncToken,#syncOwner,#syncRepo,#syncBranch').length", 0);
await check('settings button is touch sized',
  "Math.round(document.getElementById('btnSettings').getBoundingClientRect().width) >= 44", true);

/* ---------- settings screen ---------- */
await evalJs(`document.getElementById('btnSettings').click()`);
await sleep(500);
await check('settings opens', "document.body.classList.contains('view-settings')", true);
await check('settings screen visible', "getComputedStyle(document.getElementById('screenSettings')).display", 'flex');
await check('list hidden behind settings', "getComputedStyle(document.getElementById('screenList')).display", 'none');
await check('settings does not spill',
  "(function(){var vw=document.documentElement.clientWidth;var bad=0;document.querySelectorAll('#screenSettings *').forEach(function(n){var r=n.getBoundingClientRect();if(r.width>0&&r.right>vw+0.5)bad++;});return bad;})()", 0);
await check('settings headings', "(function(){var t=[];document.querySelectorAll('#screenSettings .card h2').forEach(function(h){t.push(h.textContent.trim());});return t.join('|');})()", 'Save & load');
await check('backup controls in settings', "!!document.getElementById('btnDownload') && !!document.getElementById('btnImport')", true);
await evalJs(`document.getElementById('btnSettingsBack').click()`);
await sleep(500);
await check('back from settings to list', "document.body.classList.contains('view-list')", true);

/* ---------- export: a picture or a PDF to text or email ---------- */
await check('send image button', "document.getElementById('btnSendImage').textContent.trim()", 'Send image');
await check('send PDF button', "document.getElementById('btnSendPdf').textContent.trim()", 'Send PDF');
await check('sheet card has three ways out',
  "document.querySelectorAll('.card-tools .list-tools button').length", 3);
await check('export module loaded',
  "typeof QS.exportDoc.png === 'function' && typeof QS.exportDoc.pdf === 'function'", true);
await check('the sheet actually draws ink', `(async function(){
  var qs = await QS.store.listQuotes();
  var pages = QS.exportDoc.render(QS.ensureShape(qs[0]));
  var c = pages[0], x = c.getContext('2d');
  var d = x.getImageData(0, 0, c.width, c.height).data;
  var ink = 0, yellow = 0;
  for (var p = 0; p < d.length; p += 16) {
    if (d[p] < 200 || d[p+1] < 200 || d[p+2] < 200) ink++;
    if (d[p] > 230 && d[p+1] > 190 && d[p+2] < 90) yellow++;
  }
  return c.width === 1240 && ink > 2000 && yellow > 50;
})()`, true);
await check('picture export is a real png', `(async function(){
  var qs = await QS.store.listQuotes();
  var out = QS.exportDoc.png(QS.ensureShape(qs[0]));
  var b = new Uint8Array(await out.blob.arrayBuffer());
  return b.length > 20000 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71 &&
    /^JQ-\\d{4}-\\d{3}\\.png$/.test(out.name);
})()`, true);
await check('pdf export is a real pdf', `(async function(){
  var qs = await QS.store.listQuotes();
  var out = QS.exportDoc.pdf(QS.ensureShape(qs[0]));
  var b = new Uint8Array(await out.blob.arrayBuffer());
  var head = String.fromCharCode.apply(null, b.slice(0, 8));
  var tail = String.fromCharCode.apply(null, b.slice(b.length - 6));
  return b.length > 20000 && head === '%PDF-1.4' && tail === '%%EOF\\n' &&
    /^JQ-\\d{4}-\\d{3}\\.pdf$/.test(out.name);
})()`, true);
await check('pdf keeps the quote to one page', `(async function(){
  var qs = await QS.store.listQuotes();
  var out = QS.exportDoc.pdf(QS.ensureShape(qs[0]));
  var txt = await out.blob.text();
  return (txt.match(/\\/Type \\/Page[^s]/g) || []).length === 1;
})()`, true);

/* ---------- it is a quote to send, not a form to sign ---------- */
await check('the sheet carries no signature block', `(function(){
  var html = QS.printDoc.build(QS.newQuote('JQ-TEST-001'), []);
  return !/Please confirm|Signed|p-sign/.test(html);
})()`, true);
await check('a typed design is printed and labelled', `(function(){
  var q = QS.newQuote('JQ-TEST-002');
  q.paint.hat.front = '#ffd60a';
  q.paint.hat.frontName = 'Yellow';
  q.paint.hat.frontDesign = 'checkerboard on the sleeves';
  return /Design: checkerboard on the sleeves/.test(QS.printDoc.build(q, []));
})()`, true);
await check('the quote date is on the sheet', `(function(){
  var q = QS.newQuote('JQ-TEST-003');
  q.date = '2026-10-22';
  return /Dated Oct 22, 2026/.test(QS.printDoc.build(q, []));
})()`, true);

/* ---------- one square per colour, not one per part ---------- */
await check('parts sharing a colour share one square', `(function(){
  function chips(same) {
    var q = QS.newQuote('JQ-TEST-007');
    q.paint.figure.eyes = '#000000';
    q.paint.figure.hair = same ? '#000000' : '#222222';
    q.paint.figure.boots = same ? '#000000' : '#333333';
    return (QS.printDoc.build(q, []).match(/p-chip/g) || []).length;
  }
  return chips(true) === chips(false) - 2;
})()`, true);
await check('the shared row names every part', `(function(){
  var q = QS.newQuote('JQ-TEST-008');
  q.paint.figure.eyes = '#000000'; q.paint.figure.eyesName = 'Black';
  q.paint.figure.hair = '#000000'; q.paint.figure.hairName = 'Black';
  q.paint.figure.boots = '#000000'; q.paint.figure.bootsName = 'Black';
  return /Eyes, Hair, Boots/.test(QS.printDoc.build(q, []));
})()`, true);
await check('a shared row keeps each part design note', `(function(){
  var q = QS.newQuote('JQ-TEST-009');
  q.paint.figure.eyes = '#000000'; q.paint.figure.eyesDesign = 'gloss';
  q.paint.figure.hair = '#000000'; q.paint.figure.hairDesign = 'stripes';
  return /Design: Eyes: gloss/.test(QS.printDoc.build(q, []));
})()`, true);
await check('the exported sheet groups the colours too', `(function(){
  var q = QS.newQuote('JQ-TEST-010');
  q.paint.figure.eyes = '#000000'; q.paint.figure.eyesName = 'Black';
  q.paint.figure.hair = '#000000'; q.paint.figure.hairName = 'Black';
  q.paint.figure.boots = '#000000'; q.paint.figure.bootsName = 'Black';
  var seen = [];
  var proto = CanvasRenderingContext2D.prototype;
  var real = proto.fillText;
  proto.fillText = function (t) { seen.push(String(t)); return real.apply(this, arguments); };
  try { QS.exportDoc.render(q); } finally { proto.fillText = real; }
  return seen.indexOf('Eyes, Hair, Boots') !== -1;
})()`, true);

/* ---------- the sheet is not labelled "Quote" ---------- */
await check('the sheet carries no QUOTE heading', `(function(){
  var html = QS.printDoc.build(QS.newQuote('JQ-TEST-011'), []);
  return !/<h1>\\s*Quote\\s*<\\/h1>/i.test(html) && /<h1>JQ-TEST-011<\\/h1>/.test(html);
})()`, true);
await check('the exported sheet says the number, not QUOTE', `(function(){
  var q = QS.newQuote('JQ-TEST-012');
  var seen = [];
  var proto = CanvasRenderingContext2D.prototype;
  var real = proto.fillText;
  proto.fillText = function (t) { seen.push(String(t)); return real.apply(this, arguments); };
  try { QS.exportDoc.render(q); } finally { proto.fillText = real; }
  return seen.indexOf('QUOTE') === -1 && seen.indexOf('JQ-TEST-012') !== -1;
})()`, true);
await check('notes reach the sheet', `(function(){
  var q = QS.newQuote('JQ-TEST-004');
  q.notes = 'Customer wants the silks bright.';
  return /Customer wants the silks bright/.test(QS.printDoc.build(q, []));
})()`, true);
await check('a reference photo goes on the exported sheet', `(async function(){
  var c = document.createElement('canvas');
  c.width = 120; c.height = 90;
  var x = c.getContext('2d');
  x.fillStyle = '#ffd60a'; x.fillRect(0, 0, 120, 90);
  x.fillStyle = '#000'; x.fillRect(20, 20, 60, 40);
  var ph = { id: 'testphoto', name: 'test.png', caption: 'front', dataUrl: c.toDataURL('image/png') };
  await QS.exportDoc.preload([ph]);
  var q = QS.newQuote('JQ-TEST-005');
  return QS.exportDoc.ready([ph]) &&
    QS.exportDoc.measure(q, [ph]) > QS.exportDoc.measure(q, []);
})()`, true);
await check('photos keep the pdf to one page', `(async function(){
  var c = document.createElement('canvas');
  c.width = 120; c.height = 90;
  var x = c.getContext('2d');
  x.fillStyle = '#ffd60a'; x.fillRect(0, 0, 120, 90);
  var ph = { id: 'testphoto2', name: 'test.png', caption: 'front', dataUrl: c.toDataURL('image/png') };
  await QS.exportDoc.preload([ph]);
  var q = QS.newQuote('JQ-TEST-006');
  var txt = await QS.exportDoc.pdf(q, [ph]).blob.text();
  return (txt.match(/\\/Type \\/Page[^s]/g) || []).length === 1;
})()`, true);

/* ---------- save confirmation ---------- */
await check('save modal hidden at rest', "getComputedStyle(document.getElementById('saveModal')).display", 'none');

/* Save is a local save: it writes to this phone and never calls the network. */
await evalJs(`(function(){ window.__fetchCount = 0; var of = window.fetch;
  window.fetch = function(){ window.__fetchCount++; return of.apply(this, arguments); }; return true; })()`);
await check('Save keeps the quote on this phone', `(async function(){
  document.getElementById('btnSaveAll').click();
  await new Promise(function(r){ setTimeout(r, 1400); });
  var qs = await QS.store.listQuotes();
  return qs.length >= 1 && !!qs[0].id;
})()`, true);
await check('Save never touches the network', "window.__fetchCount", 0);
await check('list Save confirms', "getComputedStyle(document.getElementById('saveModal')).display", 'flex');
await check('confirmation says Saved', "document.getElementById('saveModalTitle').textContent", 'Saved');
await check('confirmation says where it went', "/phone|repo/i.test(document.getElementById('saveModalNote').textContent)", true);
await check('confirmation has one way out', "document.getElementById('btnSaveDone').textContent.trim()", 'Done');
await check('confirmation does not spill', "(function(){var r=document.querySelector('#saveModal .modal-card').getBoundingClientRect();return r.left>=0 && r.right<=document.documentElement.clientWidth+0.5;})()", true);
await evalJs(`document.getElementById('btnSaveDone').click()`);
await sleep(500);
await check('confirmation closes', "getComputedStyle(document.getElementById('saveModal')).display", 'none');
await check('still on the list after confirming', "document.body.classList.contains('view-list')", true);

/* ---------- save confirmation from the detail screen ---------- */
await evalJs(`document.querySelector('#workList .qrow').click()`);
await sleep(800);
await check('opened a quote from the list', "document.body.classList.contains('view-detail')", true);
await evalJs(`document.getElementById('btnSave').click()`);
await sleep(1400);
await check('detail Save confirms too', "getComputedStyle(document.getElementById('saveModal')).display", 'flex');
await evalJs(`document.getElementById('btnSaveDone').click()`);
await sleep(500);
await check('confirming from detail lands back on the list', "document.body.classList.contains('view-list')", true);

/* ---------- screenshots ---------- */
await evalJs(`document.getElementById('btnNew').click()`);
await sleep(1000);
await evalJs(setField('Jockey name', 'Crafters Gallery'));
await evalJs(`document.getElementById('taskInput').value='Prime'; document.getElementById('btnAddTask').click();
  document.getElementById('taskInput').value='Stencil'; document.getElementById('btnAddTask').click();
  document.getElementById('taskInput').value='Top coat'; document.getElementById('btnAddTask').click(); true`);
await sleep(1000);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve('test/mobile.png'), Buffer.from(shot.data, 'base64'));

await evalJs(`document.querySelector('#sections .card:nth-child(3)').scrollIntoView({block:'start'}); true`);
await sleep(600);
const shotSpec = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve('test/mobile-spec.png'), Buffer.from(shotSpec.data, 'base64'));

/* the pricing card, scrolled to the top of the sheet */
await evalJs(`(function(){var c=document.querySelector('#tierRow').closest('.card'); c.scrollIntoView({block:'start'}); return true;})()`);
await sleep(600);
const shotPrice = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve('test/mobile-pricing.png'), Buffer.from(shotPrice.data, 'base64'));

await evalJs(`document.getElementById('btnBack').click()`);
await sleep(700);
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve('test/mobile-list.png'), Buffer.from(shot2.data, 'base64'));

await evalJs(`document.getElementById('btnSettings').click()`);
await sleep(600);
const shot3 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve('test/mobile-settings.png'), Buffer.from(shot3.data, 'base64'));
await evalJs(`document.getElementById('btnSettingsBack').click()`);
await sleep(400);

/* ---------- the update clears what the old version left behind ---------- */
await evalJs("localStorage.setItem('qs.sync', JSON.stringify({token:'leftover'})); true");
await send('Page.reload', {});
let reborn = false;
for (let i = 0; i < 60; i++) {
  await sleep(250);
  const r = await send('Runtime.evaluate', {
    expression: "!!(window.QS && document.body && document.getElementById('btnSaveAll'))",
    returnByValue: true
  }).catch(() => null);
  if (r && r.result && r.result.value) { reborn = true; break; }
}
if (!reborn) throw new Error('the app did not come back after a reload');
await sleep(900);
await check('the old token is gone', "localStorage.getItem('qs.sync')", null);
await check('the old sync module is gone', `(async function(){
  try { var r = await fetch('js/sync.js', {cache:'no-store'}); return r.status; }
  catch (e) { return 'blocked'; }
})()`, 404);

/* ---------- overflow sweep ---------- */
const overflow = await evalJs(`(function(){
  var wide = [];
  document.querySelectorAll('#screenList *, #screenDetail *, #screenSettings *').forEach(function(n){
    var r = n.getBoundingClientRect();
    if (r.width > 0 && r.right > window.innerWidth + 2) wide.push(n.className || n.tagName);
  });
  return wide.slice(0, 6);
})()`);
checks++;
if (overflow.length) { failures++; console.log('FAIL  elements past the right edge: ' + overflow.join(', ')); }
else console.log('PASS  nothing spills past the right edge');

console.log('\n' + (checks - failures) + '/' + checks + ' checks passed');
ws.close();
chrome.kill();
process.exit(failures ? 1 : 0);
