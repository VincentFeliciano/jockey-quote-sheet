/* Seed the repo with the two empty data files the app reads.
   Token comes from the git credential helper — it is never printed.
   Run: node test/seed.mjs */
import { execFileSync } from 'node:child_process';

const OWNER = process.env.QS_OWNER || 'VincentFeliciano';
const REPO = process.env.QS_REPO || 'jockey-quote-sheet';
const BRANCH = process.env.QS_BRANCH || 'main';

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
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

const HEAD = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
  'User-Agent': 'jockey-quote-sheet-seed'
};

async function getFile(path) {
  const res = await fetch(`${API}/${path}?ref=${BRANCH}`, { headers: HEAD });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
  return await res.json();
}

async function putFile(path, text, message, sha) {
  const body = {
    message,
    content: Buffer.from(text, 'utf8').toString('base64'),
    branch: BRANCH
  };
  if (sha) body.sha = sha;
  const res = await fetch(`${API}/${path}`, { method: 'PUT', headers: HEAD, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`PUT ${path} ${res.status} ${json.message || ''}`);
  return json.commit.sha;
}

function emptyQuotes() {
  return JSON.stringify({
    app: 'jockey-quote-sheet', version: 2,
    updated: new Date().toISOString(), quotes: []
  }, null, 0);
}

function emptyPhotos() {
  return JSON.stringify({
    app: 'jockey-quote-sheet', version: 2,
    updated: new Date().toISOString(), photos: []
  }, null, 0);
}

for (const [path, text] of [['data/quotes.json', emptyQuotes()], ['data/photos.json', emptyPhotos()]]) {
  const cur = await getFile(path);
  if (cur) {
    console.log(`${path} already there (sha ${cur.sha.slice(0, 7)})`);
    continue;
  }
  const sha = await putFile(path, text, `Seed ${path}`);
  console.log(`${path} created (commit ${sha.slice(0, 7)})`);
}
console.log(`token len=${TOKEN.length}`);
