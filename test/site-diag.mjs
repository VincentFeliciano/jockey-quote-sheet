/* Is it DNS, the account root, a custom domain, or just this repo? */
import { execFileSync } from 'node:child_process';
import dns from 'node:dns/promises';

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

try {
  const a = await dns.resolve4('vincentfeliciano.github.io');
  console.log('DNS vincentfeliciano.github.io -> ' + a.join(', '));
} catch (e) {
  console.log('DNS failed: ' + e.message);
}

for (const u of [
  'https://vincentfeliciano.github.io/',
  'https://vincentfeliciano.github.io/jockey-quote-sheet/',
  'https://vincentfeliciano.github.io/jockey-quote-sheet/index.html',
  'https://github.com/VincentFeliciano/jockey-quote-sheet'
]) {
  try {
    const res = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'opencrabs' } });
    const txt = await res.text();
    const t = (txt.match(/<title>([^<]*)</) || [])[1] || '';
    console.log(u + ' -> ' + res.status + ' len=' + txt.length + ' title="' + t.slice(0, 60) + '" loc=' + (res.headers.get('location') || '-'));
  } catch (e) {
    console.log(u + ' -> ERR ' + e.message);
  }
}

const p = await fetch(`https://api.github.com/repos/${repo}/pages`, { headers: H });
const pj = await p.json();
console.log('pages cname=' + (pj.cname || 'none') + ' https_certificate=' + JSON.stringify(pj.https_certificate || null));
console.log('pages custom_404=' + pj.custom_404 + ' protected_domain_state=' + (pj.protected_domain_state || 'none'));

/* list the account's pages sites */
const list = await fetch('https://api.github.com/users/VincentFeliciano/repos?per_page=100&sort=pushed', { headers: H });
const repos = await list.json();
if (Array.isArray(repos)) {
  const withPages = repos.filter((r) => r.has_pages);
  console.log('repos with pages: ' + withPages.map((r) => r.name).join(', ') || 'none');
}
