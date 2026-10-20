/* What is the live site actually serving right now, and what do the
   deployment records say? */
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
const SITE = 'https://vincentfideliciano.github.io/jockey-quote-sheet/';

async function head(url) {
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  const txt = await res.text();
  return { status: res.status, len: txt.length, txt, headers: res.headers };
}

console.log('--- live root ---');
const root = await head(SITE);
console.log('status=' + root.status + ' bytes=' + root.len + ' age=' + root.headers.get('age'));
console.log('  title: ' + ((root.txt.match(/<title>([^<]*)</) || [])[1] || 'none'));
console.log('  mentions plymr: ' + /plymr/.test(root.txt));

console.log('--- a file that existed before ---');
const css = await head(SITE + 'css/style.css');
console.log('css/style.css -> ' + css.status + ' bytes=' + css.len + ' age=' + css.headers.get('age'));

console.log('--- deployments ---');
const dep = await fetch(`https://api.github.com/repos/${repo}/deployments?environment=github-pages&per_page=3`,
  { headers: H });
const deps = await dep.json();
if (Array.isArray(deps)) {
  for (const d of deps) {
    console.log('  dep ' + d.id + ' sha=' + String(d.sha).slice(0, 8) + ' created=' + d.created_at);
    const st = await fetch(`https://api.github.com/repos/${repo}/deployments/${d.id}/statuses`, { headers: H });
    const sts = await st.json();
    if (Array.isArray(sts) && sts[0]) {
      console.log('     latest status: ' + sts[0].state + ' at ' + sts[0].created_at +
        ' env_url=' + (sts[0].environment_url || '-'));
    }
  }
} else {
  console.log('  none / ' + dep.status);
}
