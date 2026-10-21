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
await check('five spec cards', "document.querySelectorAll('#sections .card').length", 5);
await check('card titles', "(function(){var t=[];document.querySelectorAll('#sections .card h2').forEach(function(h){t.push(h.textContent.trim());});return t.join('|');})()",
  'The piece|Hat|Jockey|Platform & base|Custom request');
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

/* ---------- pricing: paint tier, decals, delivery ---------- */
await check('paint job card exists', "!!document.getElementById('tierRow')", true);
await check('three paint tiers', "document.querySelectorAll('#tierRow .tier').length", 3);
await check('tier names and prices', "(function(){var t=[];document.querySelectorAll('#tierRow .tier').forEach(function(b){t.push(b.querySelector('.tier-label').textContent+'='+b.querySelector('.tier-price').textContent);});return t.join('|');})()",
  'Simple=$150.00|Standard=$175.00|Complex=$200.00');
await check('standard selected by default', "document.querySelector('#tierRow .tier.on .tier-label').textContent", 'Standard');
await check('decal count starts at zero', "document.getElementById('decalCount').textContent", '0');
await check('decal rate shown', "document.getElementById('decalRate').textContent", '$10.00 each');
await check('delivery rate shown', "document.getElementById('deliveryRate').textContent", '$50.00');
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
await check('delivery line shows the fee', "document.getElementById('pDelivery').textContent", '$50.00');
await check('total includes delivery', "document.getElementById('tTotal').textContent", '$250.00');

/* the whole thing survives a reload, since it is saved to the store */
await sleep(900);
await check('pricing persisted', 
  "(async function(){var qs=await QS.store.listQuotes();return qs[0].pricing.paintTier+'/'+qs[0].pricing.decals+'/'+qs[0].pricing.delivery;})()",
  'complex/0/true');

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
await check('no repo fields on the list screen',
  "document.querySelectorAll('#screenList input#syncToken').length", 0);
await check('settings button is touch sized',
  "Math.round(document.getElementById('btnSettings').getBoundingClientRect().width) >= 44", true);

/* ---------- settings screen ---------- */
await evalJs(`document.getElementById('btnSettings').click()`);
await sleep(500);
await check('settings opens', "document.body.classList.contains('view-settings')", true);
await check('settings screen visible', "getComputedStyle(document.getElementById('screenSettings')).display", 'flex');
await check('list hidden behind settings', "getComputedStyle(document.getElementById('screenList')).display", 'none');
await check('token field lives in settings', "!!document.getElementById('syncToken')", true);
await check('repo defaults', "document.getElementById('syncOwner').value + '/' + document.getElementById('syncRepo').value + '@' + document.getElementById('syncBranch').value",
  'VincentFeliciano/jockey-quote-sheet@main');
await check('settings does not spill',
  "(function(){var vw=document.documentElement.clientWidth;var bad=0;document.querySelectorAll('#screenSettings *').forEach(function(n){var r=n.getBoundingClientRect();if(r.width>0&&r.right>vw+0.5)bad++;});return bad;})()", 0);
await check('settings headings', "(function(){var t=[];document.querySelectorAll('#screenSettings .card h2').forEach(function(h){t.push(h.textContent.trim());});return t.join('|');})()", 'Repo sync|Backup');
await check('token field is masked', "document.getElementById('syncToken').type", 'password');
await check('backup controls in settings', "!!document.getElementById('btnDownload') && !!document.getElementById('btnImport')", true);
await evalJs(`document.getElementById('btnSettingsBack').click()`);
await sleep(500);
await check('back from settings to list', "document.body.classList.contains('view-list')", true);

/* ---------- save confirmation ---------- */
await check('save modal hidden at rest', "getComputedStyle(document.getElementById('saveModal')).display", 'none');
await evalJs(`document.getElementById('btnSaveAll').click()`);
await sleep(1400);
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

/* ---------- setup link still lands on the token box ---------- */
/* Tapping the link while the app is open is a hash change, so test it that way. */
await evalJs("location.hash = '#setup'; true");
let setupReady = false;
for (let i = 0; i < 60; i++) {
  await sleep(250);
  const r = await send('Runtime.evaluate', {
    expression: "!!(window.QS && document.body && /view-settings/.test(document.body.className))",
    returnByValue: true
  }).catch(() => null);
  if (r && r.result && r.result.value) { setupReady = true; break; }
}
if (setupReady) await sleep(400);
await check('setup link opens settings', "document.body.classList.contains('view-settings')", true);
await check('setup link clears itself from the URL', "/setup/.test(location.hash)", false);

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
