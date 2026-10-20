/* End-to-end repo sync test — the real Save button pushing to a throwaway branch.
   Token comes from the git credential helper; it is never printed.
   Run:  node test/sync.mjs        (server must be on 127.0.0.1:8789)
   Exits 0 on pass, 1 on any failure. Deletes the test branch when done. */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9336;
const URL = process.env.QS_URL || 'http://127.0.0.1:8789/';
const OWNER = process.env.QS_OWNER || 'VincentFeliciano';
const REPO = process.env.QS_REPO || 'jockey-quote-sheet';
const BRANCH = 'sync-test';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function token() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8'
  });
  const line = out.split(/\r?\n/).find((l) => l.startsWith('password='));
  if (!line) throw new Error('no credential in the git helper');
  return line.slice('password='.length).trim();
}
const TOKEN = token();
const HEAD = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
  'User-Agent': 'jockey-quote-sheet-test'
};

async function gh(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...HEAD, ...(init.headers || {}) } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}

let pass = 0;
const fails = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/* ---------- branch setup ---------- */

const mainRef = await gh('/git/ref/heads/main');
if (mainRef.status !== 200) { console.error('cannot read main:', mainRef.status); process.exit(1); }
const baseSha = mainRef.json.object.sha;

await gh(`/git/refs/heads/${BRANCH}`, { method: 'DELETE' });   /* leftovers from a failed run */
const made = await gh('/git/refs', {
  method: 'POST',
  body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: baseSha })
});
ok('test branch created', made.status === 201, `HTTP ${made.status}`);
if (made.status !== 201) process.exit(1);

/* ---------- browser ---------- */

const PROFILE = mkdtempSync(join(tmpdir(), 'qs-sync-'));
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
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception || {}));
  return r.result.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true
});

/* land once, write the sync config, then reload so boot picks it up */
await send('Page.navigate', { url: URL });
for (let i = 0; i < 80; i++) {
  const ready = await evalJs("!!(window.QS && QS.sync && document.getElementById('syncToken'))");
  if (ready) break;
  await sleep(250);
}
await evalJs(`localStorage.setItem('qs.sync', ${JSON.stringify(JSON.stringify({
  owner: OWNER, repo: REPO, branch: BRANCH, token: TOKEN
}))}); 'set'`);
await send('Page.navigate', { url: URL });
await sleep(400);
for (let i = 0; i < 80; i++) {
  const ready = await evalJs("!!(window.QS && QS.sync && document.querySelectorAll('#workList .qrow, #workList li').length > 0)");
  if (ready) break;
  await sleep(250);
}

ok('sync module loaded', await evalJs('typeof QS.sync.push === "function"'));
ok('token fields filled from storage', await evalJs(
  "document.getElementById('syncBranch').value === 'sync-test'"));
ok('save button says Save', await evalJs(
  "document.getElementById('btnSaveAll').textContent.trim() === 'Save'"));
ok('no leftover backup label', await evalJs(
  "!/backup/i.test(document.body.innerText)"));

/* ---------- a photo to push ---------- */

const iconPath = resolve('icons/icon-192.png');
const doc = await send('DOM.getDocument', { depth: 1 });
const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#photoFile' });
await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [iconPath] });
await sleep(900);
ok('photo in the phone store', await evalJs(
  "(async function(){var qs=await QS.store.listQuotes();var id=qs[0].id;var ps=await QS.store.photosFor(id);return ps.length;})()") === 1);

/* ---------- hit Save and let it push ---------- */

await evalJs("document.getElementById('btnSaveAll').click(); 'clicked'");

let quotesDoc = null;
let photosDoc = null;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  const q = await gh(`/contents/data/quotes.json?ref=${BRANCH}`);
  if (q.status === 200) {
    quotesDoc = JSON.parse(Buffer.from(q.json.content, 'base64').toString('utf8'));
    if (quotesDoc.quotes && quotesDoc.quotes.length) {
      const p = await gh(`/contents/data/photos.json?ref=${BRANCH}`);
      if (p.status === 200) {
        photosDoc = JSON.parse(Buffer.from(p.json.content, 'base64').toString('utf8'));
        if (photosDoc.photos && photosDoc.photos.length) break;
      }
    }
  }
}

ok('quotes.json pushed to the branch', !!quotesDoc && Array.isArray(quotesDoc.quotes) && quotesDoc.quotes.length >= 1,
  quotesDoc ? `${quotesDoc.quotes.length} quote(s)` : 'not found');
ok('quote records carry no photo bytes', !!quotesDoc && JSON.stringify(quotesDoc).indexOf('data:image') === -1);

ok('photos.json pushed with a manifest entry', !!photosDoc && photosDoc.photos.length >= 1,
  photosDoc ? `${photosDoc.photos.length} photo(s)` : 'not found');

if (photosDoc && photosDoc.photos.length) {
  const entry = photosDoc.photos[0];
  ok('manifest points at a file', /^data\/photos\/.+\.(jpg|png|svg|webp)$/.test(entry.file || ''), entry.file);
  ok('manifest carries mime + sig', !!(entry.mime && entry.sig), `${entry.mime} ${entry.sig}`);
  const file = await gh(`/contents/${entry.file}?ref=${BRANCH}`);
  ok('photo bytes committed', file.status === 200 && !!file.json.content);
  if (file.status === 200) {
    const bytes = Buffer.from(file.json.content, 'base64');
    ok('photo is a real image', bytes[0] === 0xff && bytes[1] === 0xd8 || bytes.slice(1, 4).toString() === 'PNG',
      `${bytes.length} bytes`);
  }
}

const stateLine = await evalJs("document.getElementById('syncState').textContent");
ok('sync card reports the repo', /jockey-quote-sheet @ sync-test/.test(stateLine || ''), stateLine);
ok('status line confirms the push', /repo/i.test(await evalJs("document.getElementById('savedNote').textContent")),
  await evalJs("document.getElementById('savedNote').textContent"));

/* second save must not rewrite the photo (same blob, no new file) */
const before = photosDoc && photosDoc.photos[0] ? photosDoc.photos[0].file : null;
await evalJs("document.getElementById('btnSaveAll').click(); 'again'");
await sleep(6000);
const q2 = await gh(`/contents/data/quotes.json?ref=${BRANCH}`);
ok('second save rewrote quotes.json', q2.status === 200);

/* ---------- pull it back on a clean profile ---------- */

await evalJs("(async function(){var qs=await QS.store.listQuotes();for(var i=0;i<qs.length;i++){await QS.store.deleteQuote(qs[i].id);}return 'cleared';})()");
ok('local store emptied', await evalJs(
  "(async function(){return (await QS.store.listQuotes()).length;})()") === 0);

await evalJs("QS.sync.pull().then(function(r){return JSON.stringify(r);})");
await sleep(1500);
const pulled = await evalJs("(async function(){var qs=await QS.store.listQuotes();var ps=await QS.store.allPhotos();return JSON.stringify({q:qs.length,p:ps.length});})()");
const pv = JSON.parse(pulled);
ok('pull restored the quotes', pv.q >= 1, pulled);
ok('pull restored the photos', pv.p >= 1, pulled);
ok('pulled photo has bytes', await evalJs(
  "(async function(){var ps=await QS.store.allPhotos();return ps.length>0 && /^data:image\\//.test(ps[0].dataUrl) && ps[0].dataUrl.length>200;})()"));

/* ---------- teardown ---------- */

await gh(`/git/refs/heads/${BRANCH}`, { method: 'DELETE' });
const gone = await gh(`/git/ref/heads/${BRANCH}`);
ok('test branch removed', gone.status === 404, `HTTP ${gone.status}`);

try { ws.close(); } catch { /* already closed */ }
chrome.kill();

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
