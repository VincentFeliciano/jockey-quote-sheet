/* Is Pages still enabled, is the repo still public, what does it say? */
import { execFileSync } from 'node:child_process';

function creds() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8'
  });
  const map = {};
  out.split(/\r?\n/).forEach((l) => { const i = l.indexOf('='); if (i > 0) map[l.slice(0, i)] = l.slice(i + 1); });
  return map;
}
const c = creds();
const H = { Authorization: 'Bearer ' + c.password, Accept: 'application/vnd.github+json', 'User-Agent': 'opencrabs' };
const repo = 'VincentFeliciano/jockey-quote-sheet';

async function api(path) {
  const res = await fetch('https://api.github.com' + path, { headers: H });
  const body = await res.text();
  let json = null;
  try { json = JSON.parse(body); } catch {}
  return { status: res.status, json, body };
}

const r = await api('/repos/' + repo);
console.log('repo: ' + r.status);
if (r.json) {
  console.log('  full_name=' + r.json.full_name);
  console.log('  private=' + r.json.private + ' visibility=' + r.json.visibility);
  console.log('  default_branch=' + r.json.default_branch);
  console.log('  has_pages=' + r.json.has_pages);
  console.log('  pushed_at=' + r.json.pushed_at);
  if (r.json.message) console.log('  message=' + r.json.message);
}

const p = await api('/repos/' + repo + '/pages');
console.log('pages: ' + p.status);
if (p.json) {
  console.log('  status=' + p.json.status + ' html_url=' + p.json.html_url);
  console.log('  build_type=' + p.json.build_type + ' source=' + JSON.stringify(p.json.source));
  if (p.json.error) console.log('  error=' + JSON.stringify(p.json.error));
} else {
  console.log('  body=' + p.body.slice(0, 300));
}

const u = await api('/users/VincentFeliciano');
if (u.json) console.log('account plan: ' + JSON.stringify(u.json.plan || null) + ' type=' + u.json.type);
