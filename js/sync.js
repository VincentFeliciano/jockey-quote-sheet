/* Repo sync — Save pushes the sheet to GitHub, Pull reads it back.
   The repo is the source of truth; the phone keeps a copy in IndexedDB so the
   shop still works with no signal.

   Layout in the repo:
     data/quotes.json        every quote record (small, rewritten on each save)
     data/photos.json        photo manifest: id, quoteId, name, caption, file, mime, sig
     data/photos/<id>.<ext>  the image bytes, written once and never rewritten
                             (identical bytes = identical git blob, so the repo
                             does not grow on every save)

   Auth is a fine-grained GitHub token with Contents: read/write on this one
   repo, kept in localStorage on this device only. */
window.QS = window.QS || {};

QS.sync = (function () {
  var CFG_KEY = 'qs.sync';
  var QUOTES_PATH = 'data/quotes.json';
  var PHOTOS_PATH = 'data/photos.json';
  var PHOTO_DIR = 'data/photos/';
  var META_SHA = 'syncSha';
  var META_PHOTO_SHA = 'syncPhotoSha';
  var META_IDS = 'syncPhotoIds';
  var META_AT = 'syncAt';

  var DEFAULTS = {
    owner: 'VincentFeliciano',
    repo: 'jockey-quote-sheet',
    branch: 'main',
    token: ''
  };

  var busy = false;

  /* ---------- config ---------- */

  function cfg() {
    var out = { owner: DEFAULTS.owner, repo: DEFAULTS.repo, branch: DEFAULTS.branch, token: '' };
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        for (var k in out) if (o[k] !== undefined && o[k] !== null) out[k] = String(o[k]);
      }
    } catch (e) { /* private mode — falls back to defaults, no token */ }
    return out;
  }

  function saveCfg(patch) {
    var c = cfg();
    for (var k in patch) if (patch[k] !== undefined) c[k] = String(patch[k]);
    c.owner = c.owner.trim();
    c.repo = c.repo.trim();
    c.branch = c.branch.trim() || 'main';
    c.token = c.token.trim();
    localStorage.setItem(CFG_KEY, JSON.stringify(c));
    return c;
  }

  function isConfigured() {
    var c = cfg();
    return !!(c.token && c.owner && c.repo && c.branch);
  }

  /* ---------- base64 ---------- */

  function b64FromBytes(bytes) {
    var bin = '';
    var step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(bin);
  }

  function b64FromText(text) {
    return b64FromBytes(new TextEncoder().encode(text));
  }

  function textFromB64(b64) {
    var bin = atob(String(b64).replace(/\s+/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function splitDataUrl(dataUrl) {
    var m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl || '');
    if (!m) return null;
    var mime = m[1];
    var ext = /jpeg|jpg/i.test(mime) ? 'jpg'
      : /png/i.test(mime) ? 'png'
      : /svg/i.test(mime) ? 'svg'
      : /webp/i.test(mime) ? 'webp'
      : /gif/i.test(mime) ? 'gif'
      : 'png';
    return { mime: mime, ext: ext, b64: m[2].replace(/\s+/g, '') };
  }

  /* cheap content signature — enough to notice an edited photo */
  function sig(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '-' + str.length.toString(36);
  }

  /* ---------- GitHub API ---------- */

  /* One place that turns a GitHub response into plain English. The status is
     kept on the error so the save dialog can say what actually happened
     instead of "push failed". */
  function httpError(status, json, what) {
    var gh = (json && json.message) || '';
    var plain;
    if (status === 401) plain = 'GitHub rejected the token (401). Paste a fresh one.';
    else if (status === 403) plain = 'The token is not allowed to write here (403). It needs Contents: read and write on this repo.';
    else if (status === 404) plain = 'GitHub cannot see ' + what + ' (404). Check the owner, repo and branch, and that the token can reach it.';
    else if (status === 409) plain = 'The repo copy changed while saving (409). Press Save again.';
    else if (status === 422) plain = 'GitHub refused the write (422).' + (gh ? ' ' + gh : ' The branch may not exist yet.');
    else if (status === 429) plain = 'GitHub is rate limiting this token (429). Wait a minute, then Save again.';
    else if (status >= 500) plain = 'GitHub itself is having trouble (' + status + '). Try again shortly.';
    else plain = 'GitHub said ' + status + (gh ? ': ' + gh : '.');
    var err = new Error(plain);
    err.status = status;
    err.github = gh;
    return err;
  }

  async function api(path, opts) {
    opts = opts || {};
    var method = opts.method || 'GET';
    var c = cfg();
    if (!c.token) throw new Error('No repo token yet — open Repo sync and paste one.');
    var url = 'https://api.github.com/repos/' + encodeURIComponent(c.owner) +
      '/' + encodeURIComponent(c.repo) + path;
    var res;
    try {
      res = await fetch(url, {
        method: method,
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer ' + c.token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) {
      var net = new Error('Could not reach GitHub. The phone looks offline, or something is blocking api.github.com.');
      net.status = 0;
      throw net;
    }
    var text = await res.text();
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    /* A missing data file is normal on a first save; a missing repo is not, so
       only a read gets to treat 404 as "nothing there yet". */
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) throw httpError(res.status, json, c.owner + '/' + c.repo + ' at ' + path.replace(/^\//, ''));
    return json;
  }

  /* Is the token, the repo and the branch actually usable from this phone?
     Returns a plain-English verdict; never includes the token itself. */
  async function testConnection() {
    var c = cfg();
    var out = { ok: false, status: 0, owner: c.owner, repo: c.repo, branch: c.branch, message: '' };
    if (!c.token) { out.message = 'No token saved on this phone yet.'; return out; }
    var repo;
    try {
      repo = await api('');
    } catch (e) {
      out.status = e.status || 0;
      out.message = e.message;
      return out;
    }
    if (!repo) {
      out.status = 404;
      out.message = 'GitHub cannot see ' + c.owner + '/' + c.repo + ' (404). Check the spelling, and that the token is scoped to it.';
      return out;
    }
    out.private = !!repo.private;
    var perms = repo.permissions || {};
    if (perms.push === false) {
      out.status = 403;
      out.message = 'The token can read ' + c.owner + '/' + c.repo + ' but not write to it (403). It needs Contents: read and write.';
      return out;
    }
    var b;
    try {
      b = await api('/branches/' + encodeURIComponent(c.branch));
    } catch (e) {
      out.status = e.status || 0;
      out.message = e.message;
      return out;
    }
    if (!b) {
      out.status = 404;
      out.message = 'Branch "' + c.branch + '" does not exist on ' + c.owner + '/' + c.repo + '.';
      return out;
    }
    out.ok = true;
    out.status = 200;
    out.message = 'Connected. ' + c.owner + '/' + c.repo + ' on ' + c.branch +
      (out.private ? ' (private)' : '') + ', and the token can write.';
    return out;
  }

  async function getFile(path) {
    var c = cfg();
    var j = await api('/contents/' + path + '?ref=' + encodeURIComponent(c.branch));
    if (!j || !j.content) return null;
    return { sha: j.sha, text: textFromB64(j.content) };
  }

  async function putFile(path, b64, message, sha) {
    var c = cfg();
    var body = { message: message, content: b64, branch: c.branch };
    if (sha) body.sha = sha;
    var j = await api('/contents/' + path, { method: 'PUT', body: body });
    return j && j.content ? j.content.sha : null;
  }

  async function deleteFile(path, message, sha) {
    var c = cfg();
    return await api('/contents/' + path, {
      method: 'DELETE',
      body: { message: message, sha: sha, branch: c.branch }
    });
  }

  /* ---------- payloads ---------- */

  function parseQuotes(text) {
    try {
      var d = JSON.parse(text);
      return (d && Array.isArray(d.quotes)) ? d.quotes : [];
    } catch (e) { return []; }
  }

  function parsePhotos(text) {
    try {
      var d = JSON.parse(text);
      return (d && Array.isArray(d.photos)) ? d.photos : [];
    } catch (e) { return []; }
  }

  function quotesPayload(quotes) {
    return JSON.stringify({
      app: 'jockey-quote-sheet', version: 2,
      updated: new Date().toISOString(), quotes: quotes
    });
  }

  function photosPayload(photos) {
    return JSON.stringify({
      app: 'jockey-quote-sheet', version: 2,
      updated: new Date().toISOString(), photos: photos
    });
  }

  function mergeQuotes(local, remote) {
    var byId = {};
    var order = [];
    function add(q, isRemote) {
      if (!q || !q.id) return;
      if (!byId[q.id]) { byId[q.id] = q; order.push(q.id); return; }
      var a = String(byId[q.id].updated || '');
      var b = String(q.updated || '');
      if (b > a) byId[q.id] = q;
      else if (b === a && isRemote) byId[q.id] = q;
    }
    (remote || []).forEach(function (q) { add(q, true); });
    (local || []).forEach(function (q) { add(q, false); });
    return order.map(function (id) { return byId[id]; });
  }

  /* Pull remote records into the local store, newest wins per quote id. */
  async function absorb(onNote) {
    await QS.store.open();
    var local = await QS.store.listQuotes();
    var localPhotos = await QS.store.allPhotos();

    var rq = await getFile(QUOTES_PATH);
    var rp = await getFile(PHOTOS_PATH);
    var remoteQuotes = rq ? parseQuotes(rq.text) : [];
    var remotePhotos = rp ? parsePhotos(rp.text) : [];

    var merged = mergeQuotes(local, remoteQuotes);
    var changed = 0;
    var localById = {};
    local.forEach(function (q) { localById[q.id] = q; });
    for (var i = 0; i < merged.length; i++) {
      var was = localById[merged[i].id];
      if (!was || String(merged[i].updated || '') !== String(was.updated || '')) changed++;
      await QS.store.putQuoteRaw(merged[i]);
    }

    /* photos: download the ones we have never seen, drop ones deleted elsewhere */
    var have = {};
    localPhotos.forEach(function (p) { have[p.id] = true; });
    var downloaded = 0;
    for (var j = 0; j < remotePhotos.length; j++) {
      var r = remotePhotos[j];
      if (!r || !r.id || have[r.id] || !r.file) continue;
      if (onNote) onNote('Fetching photo ' + (downloaded + 1) + '…');
      var file = await api('/contents/' + r.file + '?ref=' + encodeURIComponent(cfg().branch));
      if (!file || !file.content) continue;
      await QS.store.putPhoto({
        id: r.id, quoteId: r.quoteId, name: r.name || 'photo',
        caption: r.caption || '',
        dataUrl: 'data:' + (r.mime || 'image/jpeg') + ';base64,' + String(file.content).replace(/\s+/g, ''),
        w: r.w || 0, h: r.h || 0
      });
      downloaded++;
    }

    var syncedIds = (await QS.store.getMeta(META_IDS)) || [];
    var remoteIds = {};
    remotePhotos.forEach(function (p) { if (p && p.id) remoteIds[p.id] = true; });
    for (var k = 0; k < syncedIds.length; k++) {
      if (have[syncedIds[k]] && !remoteIds[syncedIds[k]]) {
        await QS.store.deletePhoto(syncedIds[k]);
      }
    }

    if (rq) await QS.store.setMeta(META_SHA, rq.sha);
    if (rp) await QS.store.setMeta(META_PHOTO_SHA, rp.sha);
    await QS.store.setMeta(META_AT, new Date().toISOString());
    return { quotes: merged.length, changed: changed, downloaded: downloaded };
  }

  /* ---------- public ---------- */

  async function pull(onNote) {
    if (busy) return { skipped: true };
    busy = true;
    try {
      var r = await absorb(onNote);
      return r;
    } finally { busy = false; }
  }

  async function push(onNote) {
    if (busy) return { skipped: true };
    busy = true;
    try {
      await absorb(onNote);                      /* pick up anything the laptop wrote */
      var c = cfg();
      var quotes = await QS.store.listQuotes();
      var photos = await QS.store.allPhotos();

      if (onNote) onNote('Pushing quotes…');
      var qSha = await QS.store.getMeta(META_SHA);
      var qPut = await putFile(QUOTES_PATH, b64FromText(quotesPayload(quotes)),
        'Quote sheet: ' + quotes.length + ' quote(s) — ' + new Date().toISOString().slice(0, 16).replace('T', ' '), qSha);
      if (qPut) await QS.store.setMeta(META_SHA, qPut);

      var remoteManifest = [];
      var rp = await getFile(PHOTOS_PATH);
      if (rp) remoteManifest = parsePhotos(rp.text);
      var remoteById = {};
      remoteManifest.forEach(function (p) { if (p && p.id) remoteById[p.id] = p; });

      var manifest = [];
      var written = 0;
      for (var i = 0; i < photos.length; i++) {
        var p = photos[i];
        var parts = splitDataUrl(p.dataUrl);
        if (!parts) continue;
        var file = PHOTO_DIR + p.id + '.' + parts.ext;
        var s = sig(p.dataUrl);
        var prev = remoteById[p.id];
        if (!prev || prev.sig !== s) {
          if (onNote) onNote('Uploading photo ' + (written + 1) + '…');
          await putFile(file, parts.b64, 'Photo ' + p.id + ' for quote ' + p.quoteId, prev ? await shaOf(file) : null);
          written++;
        }
        manifest.push({
          id: p.id, quoteId: p.quoteId, name: p.name || 'photo',
          caption: p.caption || '', file: file, mime: parts.mime,
          w: p.w || 0, h: p.h || 0, sig: s
        });
      }

      /* photos deleted on the phone, and known to be in the repo, go away there too */
      var keep = {};
      photos.forEach(function (p) { keep[p.id] = true; });
      var syncedIds = (await QS.store.getMeta(META_IDS)) || [];
      for (var d = 0; d < remoteManifest.length; d++) {
        var r = remoteManifest[d];
        if (r && r.id && !keep[r.id] && syncedIds.indexOf(r.id) !== -1 && r.file) {
          if (onNote) onNote('Removing photo ' + r.id + '…');
          var sha = await shaOf(r.file);
          if (sha) await deleteFile(r.file, 'Remove photo ' + r.id, sha);
        }
      }

      if (onNote) onNote('Saving photo list…');
      var pSha = await QS.store.getMeta(META_PHOTO_SHA);
      var pPut = await putFile(PHOTOS_PATH, b64FromText(photosPayload(manifest)),
        'Photo list: ' + manifest.length + ' photo(s)', pSha);
      if (pPut) await QS.store.setMeta(META_PHOTO_SHA, pPut);

      await QS.store.setMeta(META_IDS, photos.map(function (p) { return p.id; }));
      await QS.store.setMeta(META_AT, new Date().toISOString());
      return { quotes: quotes.length, photos: manifest.length, uploaded: written };
    } finally { busy = false; }
  }

  async function shaOf(path) {
    var c = cfg();
    var j = await api('/contents/' + path + '?ref=' + encodeURIComponent(c.branch));
    return j ? j.sha : null;
  }

  async function lastSync() {
    return await QS.store.getMeta(META_AT);
  }

  return {
    cfg: cfg,
    saveCfg: saveCfg,
    isConfigured: isConfigured,
    testConnection: testConnection,
    pull: pull,
    push: push,
    lastSync: lastSync,
    busy: function () { return busy; }
  };
})();
