/* Read the stored GitHub credential via `git credential fill` and query the
   Pages build status. The token is never printed. */
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
if (!c.password) {
  console.log('NO_TOKEN');
  process.exit(1);
}
console.log('user=' + c.username + ' token_len=' + c.password.length);

const H = {
  Authorization: 'Bearer ' + c.password,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'opencrabs'
};

async function api(path) {
  const res = await fetch('https://api.github.com' + path, { headers: H });
  const body = await res.text();
  let json = null;
  try { json = JSON.parse(body); } catch {}
  return { status: res.status, json, body };
}

const info = await api('/repos/VincentFeliciano/jockey-quote-sheet/pages');
console.log('pages status=' + info.status);
if (info.json) {
  console.log('  url=' + info.json.html_url + ' source=' + (info.json.source ? info.json.source.branch + ' ' + info.json.source.path : '?') + ' status=' + info.json.status);
  if (info.json.error) console.log('  error=' + info.json.error);
}

const builds = await api('/repos/VincentFeliciano/jockey-quote-sheet/pages/builds?per_page=5');
console.log('builds status=' + builds.status);
if (Array.isArray(builds.json)) {
  builds.json.forEach((b) => {
    console.log('  ' + b.status + ' ' + (b.error ? 'ERR:' + b.error.message : '') +
      ' commit=' + String(b.commit || '').slice(0, 8) +
      ' created=' + b.created_at + ' updated=' + b.updated_at);
  });
}

const commits = await api('/repos/VincentFeliciano/jockey-quote-sheet/commits?per_page=3');
if (Array.isArray(commits.json)) {
  console.log('remote head:');
  commits.json.forEach((k) => console.log('  ' + k.sha.slice(0, 8) + ' ' + k.commit.message.split('\n')[0]));
}
