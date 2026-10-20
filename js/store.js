/* Persistence layer — IndexedDB, with an in-memory fallback when the
   browser refuses storage (e.g. opened straight from file:// in some builds). */
window.QS = window.QS || {};

QS.store = (function () {
  var DB_NAME = 'jockey-quotes';
  var DB_VER = 1;
  var db = null;
  var memoryOnly = false;
  var mem = { quotes: {}, photos: {}, meta: {} };
  var openPromise = null;

  function req(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function tx(storeName, mode) {
    var t = db.transaction(storeName, mode);
    return t.objectStore(storeName);
  }

  function open() {
    if (openPromise) return openPromise;
    openPromise = new Promise(function (resolve) {
      if (!('indexedDB' in window)) {
        memoryOnly = true;
        return resolve(false);
      }
      var r;
      try {
        r = indexedDB.open(DB_NAME, DB_VER);
      } catch (e) {
        memoryOnly = true;
        return resolve(false);
      }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('quotes')) {
          d.createObjectStore('quotes', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('photos')) {
          var ps = d.createObjectStore('photos', { keyPath: 'id' });
          ps.createIndex('quoteId', 'quoteId', { unique: false });
        }
        if (!d.objectStoreNames.contains('meta')) {
          d.createObjectStore('meta', { keyPath: 'k' });
        }
      };
      r.onsuccess = function () { db = r.result; resolve(true); };
      r.onerror = function () { memoryOnly = true; resolve(false); };
      r.onblocked = function () { memoryOnly = true; resolve(false); };
    });
    return openPromise;
  }

  /* ---------- quotes ---------- */

  async function listQuotes() {
    await open();
    if (memoryOnly) {
      return Object.values(mem.quotes).sort(byUpdated);
    }
    var all = await req(tx('quotes', 'readonly').getAll());
    return all.sort(byUpdated);
  }

  function byUpdated(a, b) {
    return String(b.updated || '').localeCompare(String(a.updated || ''));
  }

  async function getQuote(id) {
    await open();
    if (memoryOnly) return mem.quotes[id] || null;
    return (await req(tx('quotes', 'readonly').get(id))) || null;
  }

  async function putQuote(q) {
    await open();
    q.updated = new Date().toISOString();
    if (memoryOnly) { mem.quotes[q.id] = q; return q; }
    await req(tx('quotes', 'readwrite').put(q));
    return q;
  }

  async function deleteQuote(id) {
    await open();
    if (memoryOnly) { delete mem.quotes[id]; return; }
    await req(tx('quotes', 'readwrite').delete(id));
    await deletePhotosFor(id);
  }

  /* ---------- photos ---------- */

  async function photosFor(quoteId) {
    await open();
    if (memoryOnly) {
      return Object.values(mem.photos).filter(function (p) { return p.quoteId === quoteId; });
    }
    var idx = tx('photos', 'readonly').index('quoteId');
    return await req(idx.getAll(quoteId));
  }

  async function allPhotos() {
    await open();
    if (memoryOnly) return Object.values(mem.photos);
    return await req(tx('photos', 'readonly').getAll());
  }

  async function putPhoto(p) {
    await open();
    if (memoryOnly) { mem.photos[p.id] = p; return p; }
    await req(tx('photos', 'readwrite').put(p));
    return p;
  }

  async function deletePhoto(id) {
    await open();
    if (memoryOnly) { delete mem.photos[id]; return; }
    await req(tx('photos', 'readwrite').delete(id));
  }

  async function deletePhotosFor(quoteId) {
    var ps = await photosFor(quoteId);
    for (var i = 0; i < ps.length; i++) await deletePhoto(ps[i].id);
  }

  /* ---------- meta (defaults) ---------- */

  async function getMeta(k) {
    await open();
    if (memoryOnly) return mem.meta[k];
    var row = await req(tx('meta', 'readonly').get(k));
    return row ? row.v : undefined;
  }

  async function setMeta(k, v) {
    await open();
    if (memoryOnly) { mem.meta[k] = v; return; }
    await req(tx('meta', 'readwrite').put({ k: k, v: v }));
  }

  return {
    open: open,
    listQuotes: listQuotes,
    getQuote: getQuote,
    putQuote: putQuote,
    deleteQuote: deleteQuote,
    photosFor: photosFor,
    allPhotos: allPhotos,
    putPhoto: putPhoto,
    deletePhoto: deletePhoto,
    deletePhotosFor: deletePhotosFor,
    getMeta: getMeta,
    setMeta: setMeta,
    isMemoryOnly: function () { return memoryOnly; }
  };
})();
