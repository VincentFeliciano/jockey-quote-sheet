/* Phone smoke test — drives headless Chrome at iPhone size over CDP.
   Run:  node test/mobile.mjs        (server must be on 127.0.0.1:8789)
   Exits 0 on pass, 1 on any failure. Writes test/mobile.png + test/mobile-list.png. */
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
    expression: "!!(window.QS && document.body && /view-/.test(document.body.className) && document.querySelectorAll('#sections .card').length >= 3)",
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

/* ---------- fill a quote ---------- */
await evalJs(setField('Name', 'Vince Test'));
await evalJs(setField('Stable / Owner', 'Test Stable'));
await evalJs(setField('Jockey', 'R. Santana'));
await evalJs(setField('Due date', '2026-11-02'));
await sleep(1000);
await check('customer name in title', "document.getElementById('dTitle').textContent", 'Vince Test');

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
await evalJs(`document.getElementById('taskInput').value='Cut fabric'; document.getElementById('btnAddTask').click(); true`);
await evalJs(`document.getElementById('taskInput').value='Embroidery'; document.getElementById('btnAddTask').click(); true`);
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
await evalJs(setField('Name', 'Second Job'));
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

/* ---------- screenshots ---------- */
await evalJs(`document.getElementById('btnNew').click()`);
await sleep(1000);
await evalJs(setField('Name', 'Crafters Gallery'));
await evalJs(`document.getElementById('taskInput').value='Cut fabric'; document.getElementById('btnAddTask').click();
  document.getElementById('taskInput').value='Embroidery'; document.getElementById('btnAddTask').click();
  document.getElementById('taskInput').value='Post out'; document.getElementById('btnAddTask').click(); true`);
await sleep(1000);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve('test/mobile.png'), Buffer.from(shot.data, 'base64'));

await evalJs(`document.getElementById('btnBack').click()`);
await sleep(700);
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve('test/mobile-list.png'), Buffer.from(shot2.data, 'base64'));

const overflow = await evalJs(`(function(){
  var wide = [];
  document.querySelectorAll('#screenList *, #screenDetail *').forEach(function(n){
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

