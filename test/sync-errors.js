/* Checks the repo-sync error handling without touching the network.
   Stubs fetch, then asserts the plain-English verdict for each status. */
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('js/sync.js', 'utf8');

function makeEnv(responses) {
  const store = new Map();
  const ctx = {
    console,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder,
    TextDecoder,
    setTimeout, clearTimeout,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    fetch: async (url, opts) => {
      const hit = responses.find((r) => r.match.test(url));
      if (!hit) throw new Error('no stub for ' + url);
      if (hit.throws) throw new TypeError('Failed to fetch');
      const body = typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body || {});
      return {
        status: hit.status,
        ok: hit.status >= 200 && hit.status < 300,
        text: async () => body
      };
    }
  };
  ctx.window = ctx;
  ctx.QS = {
    store: {
      open: async () => {},
      listQuotes: async () => [],
      allPhotos: async () => [],
      getMeta: async () => null,
      setMeta: async () => {},
      putQuoteRaw: async () => {},
      putPhoto: async () => {},
      deletePhoto: async () => {}
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

const TOKEN_CFG = JSON.stringify({
  owner: 'VincentFeliciano', repo: 'jockey-quote-sheet', branch: 'main', token: 'x'.repeat(20)
});

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('  ok   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); fail++; }
}

async function run() {
  /* no token at all */
  {
    const env = makeEnv([]);
    const r = await env.QS.sync.testConnection();
    ok('no token is reported plainly', /No token saved/.test(r.message), r.message);
    ok('no token is not ok', r.ok === false);
  }

  /* happy path: repo visible, push allowed, branch there */
  {
    const env = makeEnv([
      { match: /api\.github\.com\/repos\/VincentFeliciano\/jockey-quote-sheet$/, status: 200, body: { private: true, permissions: { push: true } } },
      { match: /\/branches\/main/, status: 200, body: { name: 'main' } }
    ]);
    env.localStorage.setItem('qs.sync', TOKEN_CFG);
    const r = await env.QS.sync.testConnection();
    ok('good repo connects', r.ok === true, r.message);
    ok('good repo names the branch', /on main/.test(r.message), r.message);
    ok('good repo says writable', /can write/.test(r.message), r.message);
    ok('good repo never echoes the token', !r.message.includes('xxxxxxxxxx'), r.message);
  }

  /* token rejected */
  {
    const env = makeEnv([{ match: /api\.github\.com/, status: 401, body: { message: 'Bad credentials' } }]);
    env.localStorage.setItem('qs.sync', TOKEN_CFG);
    const r = await env.QS.sync.testConnection();
    ok('401 reads as a bad token', /401/.test(r.message) && /token/i.test(r.message), r.message);
    ok('401 carries the status', r.status === 401, String(r.status));
  }

  /* read-only token */
  {
    const env = makeEnv([{ match: /api\.github\.com/, status: 200, body: { private: false, permissions: { push: false } } }]);
    env.localStorage.setItem('qs.sync', TOKEN_CFG);
    const r = await env.QS.sync.testConnection();
    ok('read-only token is refused', r.ok === false && r.status === 403, r.message);
    ok('read-only token explains Contents', /Contents: read and write/.test(r.message), r.message);
  }

  /* wrong repo name */
  {
    const env = makeEnv([{ match: /api\.github\.com/, status: 404, body: { message: 'Not Found' } }]);
    env.localStorage.setItem('qs.sync', TOKEN_CFG);
    const r = await env.QS.sync.testConnection();
    ok('404 names the repo', r.message.includes('VincentFeliciano/jockey-quote-sheet'), r.message);
  }

  /* right repo, wrong branch */
  {
    const env = makeEnv([
      { match: /api\.github\.com\/repos\/[^/]+\/[^/]+$/, status: 200, body: { private: false, permissions: { push: true } } },
      { match: /\/branches\/main/, status: 404, body: { message: 'Branch not found' } }
    ]);
    env.localStorage.setItem('qs.sync', TOKEN_CFG);
    const r = await env.QS.sync.testConnection();
    ok('missing branch is named', /Branch "main" does not exist/.test(r.message), r.message);
  }

  /* offline */
  {
    const env = makeEnv([{ match: /api\.github\.com/, throws: true }]);
    env.localStorage.setItem('qs.sync', TOKEN_CFG);
    const r = await env.QS.sync.testConnection();
    ok('offline is not blamed on the token', /Could not reach GitHub/.test(r.message), r.message);
    ok('offline reports status zero', r.status === 0, String(r.status));
  }

  /* a push that fails must carry the status for the save dialog */
  {
    const env = makeEnv([{ match: /api\.github\.com/, status: 403, body: { message: 'Resource not accessible by personal access token' } }]);
    env.localStorage.setItem('qs.sync', TOKEN_CFG);
    let err = null;
    try { await env.QS.sync.push(); } catch (e) { err = e; }
    ok('a failing push throws', !!err);
    ok('the push error carries 403', err && err.status === 403, err && String(err.status));
    ok('the push error is plain English', err && /Contents: read and write/.test(err.message), err && err.message);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}

run().catch((e) => { console.log('FAIL harness — ' + e.message); process.exit(1); });
