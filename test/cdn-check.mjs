/* Is the file in the repo, and what is the CDN actually serving? */
import { execFileSync } from 'node:child_process';

function creds() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8'
  });
  const map = {};
  out.split(/\r?\n/).forEach((line) => {
    const i = line.indexOf('=');
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
  });
  return map;
}
const c = creds();
const H = {
  Authorization: 'Bearer ' + c.password,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'opencrabs'
};

const repo = 'VincentFeliciano/jockey-quote-sheet';

async function api(path) {
  const res = await fetch('https://api.github.com/repos/' + repo + path, { headers: H });
  const body = await res.text();
  let json = null;
  try { json = JSON.parse(body); } catch {}
  return { status: res.status, json, body };
}

// 1. is the icon in the tree at HEAD?
const tree = await api('/git/trees/main?recursive=1');
if (tree.json && tree.json.tree) {
  const icons = tree.json.tree.filter((t) => /icons\//.test(t.path));
  console.log('icons in repo at main:');
  icons.forEach((t) => console.log('   ' + t.path + '  ' + t.size + ' bytes  ' + t.sha.slice(0, 8)));
} else {
  console.log('tree lookup failed ' + tree.status);
}

// 2. does the raw CDN path work?
for (const p of ['icons/plymr.png', 'js/schema.js', 'index.html']) {
  const res = await fetch('https://raw.githubusercontent.com/' + repo + '/main/' + p, { headers: { 'User-Agent': 'opencrabs' } });
  const txt = await res.text();
  console.log('raw ' + p + ' -> ' + res.status + ' bytes=' + txt.length);
  if (p === 'js/schema.js') console.log('   has PAINT_TIERS: ' + /QS\.PAINT_TIERS/.test(txt));
}

// 3. what does the live site serve for each, with headers?
for (const p of ['icons/plymr.png', 'js/schema.js']) {
  const res = await fetch('https://vincentfideliciano.github.io/jockey-quote-sheet/' + p, { cache: 'no-store' });
  const txt = await res.text();
  console.log('live ' + p + ' -> ' + res.status + ' bytes=' + txt.length +
    ' age=' + (res.headers.get('age') || '-') +
    ' cache=' + (res.headers.get('cache-control') || '-') +
    ' server=' + (res.headers.get('server') || '-'));
  if (p === 'js/schema.js') console.log('   has PAINT_TIERS: ' + /QS\.PAINT_TIERS/.test(txt));
}
