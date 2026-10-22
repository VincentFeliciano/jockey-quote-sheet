/* App wiring — phone layout: list screen, detail screen, camera intake. */
(function () {
  var el = QS.ui.el;

  var state = {
    quote: null,
    photos: [],
    all: [],
    saveTimer: null,
    dirty: false,
    view: 'list'
  };

  var dom = {};

  function $(id) { return document.getElementById(id); }

  /* ---------- view switching ---------- */

  function setView(v) {
    state.view = v;
    document.body.classList.toggle('view-list', v === 'list');
    document.body.classList.toggle('view-detail', v === 'detail');
    document.body.classList.toggle('view-settings', v === 'settings');
    if (v === 'detail') {
      var s = $('sheet');
      if (s) s.scrollTop = 0;
    } else if (v === 'settings') {
      var g = $('settingsScroll');
      if (g) g.scrollTop = 0;
    } else {
      var l = $('listScroll');
      if (l) l.scrollTop = 0;
    }
  }

  function openSettings() {
    setView('settings');
  }

  function openDetail(id) {
    loadQuote(id).then(function () {
      setView('detail');
      try { history.pushState({ q: id }, '', '#q=' + id); } catch (e) {}
    });
  }

  /* ---------- status line ---------- */

  function note(msg, sticky) {
    if (!dom.savedNote) return;
    dom.savedNote.textContent = msg;
    if (!sticky) {
      clearTimeout(note._t);
      note._t = setTimeout(function () {
        dom.savedNote.textContent = QS.store.isMemoryOnly()
          ? 'Memory only — take a backup!'
          : 'All saved';
      }, 2200);
    }
  }

  /* ---------- save ---------- */

  function scheduleSave() {
    state.dirty = true;
    note('Saving…', true);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 700);
  }

  async function saveNow() {
    clearTimeout(state.saveTimer);
    if (!state.quote) return;
    await QS.store.putQuote(state.quote);
    state.dirty = false;
    state.all = await QS.store.listQuotes();
    renderList();
    note('Saved');
  }

  /* ---------- save confirmation ---------- */

  function showSaved(msg) {
    var m = $('saveModal');
    if (!m) return;
    var line = $('saveModalNote');
    if (line) line.textContent = msg;
    m.hidden = false;
    m.classList.add('on');
    var done = $('btnSaveDone');
    if (done) setTimeout(function () { try { done.focus(); } catch (e) {} }, 30);
  }

  function hideSaved() {
    var m = $('saveModal');
    if (!m) return;
    m.classList.remove('on');
    m.hidden = true;
    setView('list');
    renderList();
  }

  /* ---------- delete ----------
     A quote typed against the wrong jockey has to go, and it has to stay
     gone: the repo still holds the old record until the next push rewrites
     it, so the id is remembered as deleted and the pull ignores it. */

  var pendingDelete = null;

  function nameOf(q) {
    return (q && q.job && q.job.jockey) ? q.job.jockey : 'this quote';
  }

  function askDelete(id) {
    pendingDelete = id;
    var q = (state.all || []).filter(function (x) { return x.id === id; })[0];
    var name = nameOf(q);
    var m = $('deleteModal');
    if (!m) {
      if (window.confirm('Delete ' + name + '?')) doDelete();
      return;
    }
    var line = $('deleteModalNote');
    if (line) {
      line.textContent = 'Delete ' + name + '? It comes off this phone and out of the repo. ' +
        'There is no undo.';
    }
    m.hidden = false;
    m.classList.add('on');
  }

  function closeDelete() {
    var m = $('deleteModal');
    if (m) { m.classList.remove('on'); m.hidden = true; }
    pendingDelete = null;
  }

  async function doDelete() {
    var id = pendingDelete;
    var q = (state.all || []).filter(function (x) { return x.id === id; })[0];
    var name = nameOf(q);
    closeDelete();
    if (!id) return;
    try {
      await QS.store.deletePhotosFor(id);
      await QS.store.deleteQuote(id);
      state.all = await QS.store.listQuotes();

      if (state.quote && state.quote.id === id) {
        if (state.all.length) await openDetail(state.all[0].id);
        else await newQuote();
      } else {
        renderList();
      }
      note('Deleted ' + name);
    } catch (e) {
      note('Could not delete — ' + ((e && e.message) || 'unknown error'), true);
    }
  }

  /* Save is a local save: the phone is the only copy. */
  async function saveAndConfirm() {
    await saveNow();
    note('Saved on this phone');
    showSaved('Saved on this phone.');
  }

  /* ---------- totals ---------- */

  function renderTotals() {
    var t = QS.totals(state.quote);
    dom.tSub.textContent = QS.money(t.sub);
    dom.tTax.textContent = QS.money(t.tax);
    dom.tTotal.textContent = QS.money(t.total);
    dom.tBalance.textContent = QS.money(t.balance);
    if (dom.pPaint) dom.pPaint.textContent = QS.money(t.paint);
    if (dom.pDecals) dom.pDecals.textContent = QS.money(t.decals);
    if (dom.pDelivery) dom.pDelivery.textContent = QS.money(t.delivery);
    if (dom.pStrip) dom.pStrip.textContent = QS.money(t.restoreStrip);
    if (dom.pSurface) dom.pSurface.textContent = QS.money(t.restoreSurface);
    if (dom.rowStrip) dom.rowStrip.hidden = !t.restoreStrip;
    if (dom.rowSurface) dom.rowSurface.hidden = !t.restoreSurface;
  }

  /* ---------- pricing: paint tier, decals, delivery ---------- */

  function renderPricing() {
    var q = state.quote;
    if (!q || !dom.tierRow) return;
    var p = QS.fillPricing(q.pricing);

    dom.tierRow.innerHTML = '';
    QS.PAINT_TIERS.forEach(function (tier) {
      var on = p.paintTier === tier.id;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tier' + (on ? ' on' : '');
      b.setAttribute('data-tier', tier.id);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = tier.hint;
      var lab = document.createElement('span');
      lab.className = 'tier-label';
      lab.textContent = tier.label;
      var price = document.createElement('span');
      price.className = 'tier-price';
      price.textContent = QS.money(tier.price);
      b.appendChild(lab);
      b.appendChild(price);
      b.addEventListener('click', function () { setTier(tier.id); });
      dom.tierRow.appendChild(b);
    });

    dom.decalCount.textContent = String(p.decals);
    dom.decalWhere.value = p.decalWhere || '';
    dom.delivery.checked = !!p.delivery;
    dom.decalRate.textContent = QS.money(QS.DECAL_PRICE) + ' each';
    dom.deliveryRate.textContent = QS.money(QS.DELIVERY_FEE);
    renderTotals();
  }

  function setTier(id) {
    if (!state.quote) return;
    state.quote.pricing = QS.fillPricing(state.quote.pricing);
    state.quote.pricing.paintTier = id;
    renderPricing();
    scheduleSave();
  }

  function setDecals(n) {
    if (!state.quote) return;
    state.quote.pricing = QS.fillPricing(state.quote.pricing);
    state.quote.pricing.decals = Math.max(0, Math.round(n));
    renderPricing();
    scheduleSave();
  }

  /* ---------- list: working vs previous ---------- */

  function matches(x, needle) {
    if (!needle) return true;
    var hay = [
      x.number, (x.job || {}).jockey, (x.notes || '')
    ].join(' ').toLowerCase();
    return hay.indexOf(needle) !== -1;
  }

  function renderList() {
    var needle = (dom.search.value || '').trim().toLowerCase();
    var all = (state.all || []).map(QS.ensureShape);

    var work = all.filter(function (x) {
      return !QS.isComplete(x) && matches(x, needle);
    }).sort(QS.workSort);

    var prev = all.filter(function (x) {
      return QS.isComplete(x) && matches(x, needle);
    }).sort(function (a, b) {
      return String(b.completedAt || '').localeCompare(String(a.completedAt || ''));
    });

    dom.workCount.textContent = work.length;
    dom.prevCount.textContent = prev.length;

    fillList(dom.workList, work, needle ? 'No matches.' : 'Nothing in progress.');
    fillList(dom.prevList, prev, needle ? 'No matches.' : 'No finished quotes yet.');
  }

  function fillList(listEl, rows, emptyText) {
    listEl.innerHTML = '';
    if (!rows.length) {
      listEl.appendChild(el('li', { class: 'empty', text: emptyText }));
      return;
    }
    rows.forEach(function (x) { listEl.appendChild(buildRow(x)); });
  }

  function buildRow(x) {
    var active = state.quote && x.id === state.quote.id;
    var done = QS.isComplete(x);
    var li = el('li', {
      class: 'qrow' + (active ? ' active' : '') + (x.pinned ? ' pinned' : '') + (done ? ' done' : '')
    });
    var t = QS.totals(x);
    var stats = QS.taskStats(x);

    var row1 = el('div', { class: 'row1' });
    row1.appendChild(el('span', { class: 'nm', text: (x.job || {}).jockey || '(no jockey)' }));
    row1.appendChild(el('span', { class: 'chip ' + (x.status || 'draft'), text: x.status || 'draft' }));

    var row2 = el('div', { class: 'row2' });
    row2.appendChild(el('span', { text: x.number || '—' }));
    row2.appendChild(el('span', { text: QS.money(t.total) }));

    var row3 = el('div', { class: 'row3' });

    var pin = el('button', {
      class: 'tool pin' + (x.pinned ? ' on' : ''),
      type: 'button', title: x.pinned ? 'Unpin' : 'Pin to top', text: '↑'
    });
    pin.addEventListener('click', function (e) { e.stopPropagation(); togglePin(x); });

    var tick = el('button', {
      class: 'tool tick' + (done ? ' on' : ''),
      type: 'button', title: done ? 'Reopen' : 'Mark complete', text: done ? '↺' : '✓'
    });
    tick.addEventListener('click', function (e) { e.stopPropagation(); toggleComplete(x); });

    var del = el('button', {
      class: 'tool del', type: 'button', title: 'Delete this quote', text: '×'
    });
    del.addEventListener('click', function (e) { e.stopPropagation(); askDelete(x.id); });

    row3.appendChild(el('span', { class: 'stage ' + (x.stage || 'quote'), text: QS.stageLabel(x.stage) }));

    if (stats.total) {
      var bar = el('span', { class: 'mini-bar' });
      var fill = el('i');
      fill.style.width = stats.pct + '%';
      bar.appendChild(fill);
      row3.appendChild(bar);
      row3.appendChild(el('span', { class: 'frac', text: stats.done + '/' + stats.total }));
    }

    row3.appendChild(pin);
    row3.appendChild(tick);
    row3.appendChild(del);

    li.appendChild(row1);
    li.appendChild(row2);
    li.appendChild(row3);
    li.addEventListener('click', function () { openDetail(x.id); });
    return li;
  }

  /* ---------- work card ---------- */

  function logEntry(q, text) {
    q.log = q.log || [];
    q.log.push({ ts: new Date().toISOString(), text: text });
  }

  async function mutate(id, fn) {
    var rec = (state.quote && state.quote.id === id) ? state.quote : await QS.store.getQuote(id);
    if (!rec) return null;
    QS.ensureShape(rec);
    fn(rec);
    rec.updated = new Date().toISOString();
    await QS.store.putQuote(rec);
    state.all = await QS.store.listQuotes();
    renderList();
    if (state.quote && state.quote.id === id) {
      renderWorkCard();
      renderLog();
      syncTitle();
    }
    return rec;
  }

  async function togglePin(x) {
    var rec = await mutate(x.id, function (q) { q.pinned = !q.pinned; });
    if (rec) note(rec.pinned ? 'Pinned to top' : 'Unpinned');
  }

  async function toggleComplete(x) {
    var wasDone = QS.isComplete(x);
    var rec = await mutate(x.id, function (q) {
      if (wasDone) {
        q.stage = 'quote';
        q.completedAt = '';
        logEntry(q, 'Reopened');
      } else {
        q.stage = 'done';
        q.completedAt = new Date().toISOString();
        logEntry(q, 'Marked complete');
      }
    });
    if (rec) note(wasDone ? 'Back in the working list' : 'Moved to previous');
  }

  function setStage(id) {
    var q = state.quote;
    if (!q) return;
    QS.ensureShape(q);
    var prev = q.stage;
    if (prev === id) return;

    q.stage = id;
    if (id === 'done') {
      q.completedAt = new Date().toISOString();
      logEntry(q, 'Marked complete');
    } else {
      logEntry(q, prev === 'done'
        ? 'Reopened'
        : 'Stage: ' + QS.stageLabel(prev) + ' → ' + QS.stageLabel(id));
      q.completedAt = '';
    }

    (state.all || []).forEach(function (x) {
      if (x.id === q.id) { x.stage = q.stage; x.completedAt = q.completedAt; x.pinned = q.pinned; }
    });

    renderWorkCard();
    renderLog();
    renderList();
    syncTitle();
    scheduleSave();
  }

  function renderWorkCard() {
    var q = state.quote;
    if (!q) return;
    QS.ensureShape(q);
    var done = QS.isComplete(q);
    var idx = QS.stageIndex(q);

    dom.btnPin.textContent = q.pinned ? 'Unpin' : 'Pin to top';
    dom.btnPin.classList.toggle('on', !!q.pinned);
    dom.btnComplete.textContent = done ? 'Reopen' : 'Mark complete';
    dom.btnComplete.classList.toggle('go', !done);

    dom.doneBanner.hidden = !done;
    if (done) {
      var when = q.completedAt ? new Date(q.completedAt) : null;
      dom.doneText.textContent = 'Complete' + (when && !isNaN(when) ? ' — ' + when.toLocaleDateString() : '');
    }

    dom.stageSteps.innerHTML = '';
    QS.STAGES.forEach(function (s, i) {
      var b = el('button', {
        class: 'step' + (s.id === q.stage ? ' on' : '') + (i < idx ? ' past' : ''),
        type: 'button', title: s.hint
      });
      b.appendChild(el('span', { class: 'sdot' }));
      b.appendChild(el('span', { class: 'slabel', text: s.label }));
      b.addEventListener('click', function () { setStage(s.id); });
      dom.stageSteps.appendChild(b);
    });

    var stats = QS.taskStats(q);
    dom.progFill.style.width = stats.pct + '%';
    dom.progFill.parentNode.classList.toggle('full', stats.allDone);
    dom.progText.textContent = stats.total
      ? (stats.allDone ? 'All ' + stats.total + ' steps done' : stats.done + ' of ' + stats.total + ' steps')
      : 'No steps yet';
    dom.progText.classList.toggle('ready', stats.allDone && !done);

    renderTasks();
  }

  function renderTasks() {
    QS.ui.buildTasks(dom.taskList, state.quote, {
      toggle: function (t, val) {
        t.done = val;
        renderWorkCard();
        renderList();
        scheduleSave();
      },
      remove: function (t) {
        state.quote.tasks = state.quote.tasks.filter(function (x) { return x !== t; });
        renderWorkCard();
        renderList();
        scheduleSave();
      }
    });
  }

  function addTask(text) {
    text = (text || '').trim();
    if (!text || !state.quote) return;
    state.quote.tasks = state.quote.tasks || [];
    state.quote.tasks.push(QS.newTask(text));
    renderWorkCard();
    renderList();
    scheduleSave();
  }

  /* ---------- quote load / render ---------- */

  function syncTitle() {
    var q = state.quote;
    if (!q) return;
    dom.dTitle.textContent = (q.job || {}).jockey || 'Quote';
    dom.quoteNo.textContent = q.number || 'new';
  }

  async function loadQuote(id) {
    if (state.dirty) await saveNow();
    var q = await QS.store.getQuote(id);
    if (!q) return;
    QS.ensureShape(q);
    state.quote = q;
    state.photos = await QS.store.photosFor(id);
    await QS.store.setMeta('lastQuoteId', id);
    renderAll();
  }

  function renderAll() {
    var q = state.quote;
    dom.metaNumber.value = q.number || '';
    dom.metaPreparedBy.value = q.preparedBy || QS.PREPARED_BY;
    dom.status.value = q.status || 'draft';
    dom.discount.value = q.discount || 0;
    dom.taxRate.value = q.taxRate || 0;
    dom.deposit.value = q.deposit || 0;
    dom.notes.value = q.notes || '';

    QS.ui.buildSections(dom.sections, q, onFieldChange);
    renderWorkCard();
    renderPricing();
    renderPhotos();
    renderLog();
    renderTotals();
    renderList();
    syncTitle();
  }

  function onFieldChange(path, value) {
    QS.setPath(state.quote, path, value);
    if (path.indexOf('job') === 0) syncTitle();
    if (path.indexOf('restore') === 0) renderTotals();
    scheduleSave();
  }

  /* ---------- photos ---------- */

  function renderPhotos() {
    QS.ui.buildPhotos(dom.photoGrid, state.photos, {
      remove: async function (p) {
        await QS.store.deletePhoto(p.id);
        state.photos = await QS.store.photosFor(state.quote.id);
        renderPhotos();
        note('Photo removed');
      },
      caption: async function (p, text) {
        p.caption = text;
        await QS.store.putPhoto(p);
        note('Caption saved');
      }
    });
  }

  async function addFiles(fileList) {
    if (!state.quote) return;
    if (!fileList || !fileList.length) return;
    note('Adding photo' + (fileList.length > 1 ? 's' : '') + '…', true);
    var res = await QS.photos.ingestMany(fileList, state.quote.id);
    state.photos = await QS.store.photosFor(state.quote.id);
    renderPhotos();
    if (res.errors.length) {
      note(res.errors.length + ' file(s) skipped');
      console.warn('Photo import errors:', res.errors);
    } else {
      note(res.added.length + ' photo(s) added');
    }
  }

  /* ---------- log ---------- */

  function renderLog() {
    QS.ui.buildLog(dom.logList, state.quote, {
      remove: function (entry) {
        state.quote.log = state.quote.log.filter(function (e) { return e !== entry; });
        renderLog();
        scheduleSave();
      }
    });
  }

  function addLogEntry(text) {
    if (!text) return;
    state.quote.log = state.quote.log || [];
    state.quote.log.push({ ts: new Date().toISOString(), text: text });
    renderLog();
    scheduleSave();
  }

  /* ---------- print / send ---------- */

  function printNow() {
    var sheet = $('printSheet');
    sheet.innerHTML = QS.printDoc.build(state.quote, state.photos);
    /* one sheet, always: measure what was built and shrink it onto the page
       if the quote has grown past it */
    if (QS.printDoc.fit) QS.printDoc.fit(sheet);
    setTimeout(function () { window.print(); }, 80);
  }

  function sendAs(kind) {
    if (!state.quote) return;
    var res;
    try {
      res = QS.exportDoc.share(kind, state.quote);
    } catch (e) {
      return note('Could not build the ' + kind, true);
    }
    note('Building the ' + kind + '…', true);
    res.then(function (r) {
      if (r.cancelled) return note('Nothing sent');
      if (r.shared) return note('Shared ' + r.name);
      note('Saved ' + r.name + ' — attach it to a text or email');
    }, function () {
      note('Could not send the ' + kind, true);
    });
  }

  /* ---------- backup ---------- */

  async function exportBackup() {
    await saveNow();
    var quotes = await QS.store.listQuotes();
    var photos = await QS.store.allPhotos();
    var payload = {
      app: 'jockey-quote-sheet',
      version: 1,
      exported: new Date().toISOString(),
      quotes: quotes,
      photos: photos
    };
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jockey-quotes-' + QS.today() + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    note('Backup downloaded');
  }

  async function importBackup(file) {
    var text = await file.text();
    var data;
    try { data = JSON.parse(text); } catch (e) { return note('Not a backup file'); }
    if (!data || !Array.isArray(data.quotes)) return note('Not a backup file');

    for (var i = 0; i < data.quotes.length; i++) {
      await QS.store.putQuote(data.quotes[i]);
    }
    for (var j = 0; j < (data.photos || []).length; j++) {
      await QS.store.putPhoto(data.photos[j]);
    }
    state.all = await QS.store.listQuotes();
    renderList();
    note('Restored ' + data.quotes.length + ' quote(s)');
  }

  /* ---------- new quote ---------- */

  async function newQuote() {
    if (state.dirty) await saveNow();
    state.all = await QS.store.listQuotes();
    var q = QS.newQuote(QS.nextNumber(state.all));
    q.preparedBy = (await QS.store.getMeta('preparedBy')) || QS.PREPARED_BY;
    await QS.store.putQuote(q);
    state.quote = q;
    state.photos = [];
    state.all.unshift(q);
    await QS.store.setMeta('lastQuoteId', q.id);
    renderAll();
    setView('detail');
    note('New quote ' + q.number);
  }

  /* ---------- boot ---------- */

  async function boot() {
    /* Everything lives on this phone now. Clear what the previous version left
       behind: the GitHub token and the old sync tombstones. */
    try { localStorage.removeItem('qs.sync'); } catch (e) {}
    try { await QS.store.setMeta('syncDeletedIds', []); } catch (e) {}

    dom = {
      dTitle: $('dTitle'),
      quoteNo: $('quoteNo'),
      status: $('status'),
      workList: $('workList'),
      prevList: $('prevList'),
      workCount: $('workCount'),
      prevCount: $('prevCount'),
      prevToggle: $('prevToggle'),
      search: $('search'),
      savedNote: $('savedNote'),
      sections: $('sections'),
      tierRow: $('tierRow'),
      decalCount: $('decalCount'),
      decalWhere: $('decalWhere'),
      decalRate: $('decalRate'),
      deliveryRate: $('deliveryRate'),
      delivery: $('delivery'),
      pPaint: $('pPaint'),
      pDecals: $('pDecals'),
      pDelivery: $('pDelivery'),
      pStrip: $('pStrip'),
      pSurface: $('pSurface'),
      rowStrip: $('rowStrip'),
      rowSurface: $('rowSurface'),
      photoGrid: $('photoGrid'),
      photoDrop: $('photoDrop'),
      photoFile: $('photoFile'),
      photoCamera: $('photoCamera'),
      logList: $('logList'),
      logInput: $('logInput'),
      notes: $('notes'),
      stageSteps: $('stageSteps'),
      progFill: $('progFill'),
      progText: $('progText'),
      taskList: $('taskList'),
      taskInput: $('taskInput'),
      btnPin: $('btnPin'),
      btnComplete: $('btnComplete'),
      doneBanner: $('doneBanner'),
      doneText: $('doneText'),
      metaNumber: $('metaNumber'),
      metaPreparedBy: $('metaPreparedBy'),
      discount: $('discount'),
      taxRate: $('taxRate'),
      deposit: $('deposit'),
      tSub: $('tSub'),
      tTax: $('tTax'),
      tTotal: $('tTotal'),
      tBalance: $('tBalance')
    };

    await QS.store.open();
    state.all = await QS.store.listQuotes();

    /* meta bindings */
    dom.metaPreparedBy.addEventListener('input', function () {
      state.quote.preparedBy = dom.metaPreparedBy.value;
      QS.store.setMeta('preparedBy', dom.metaPreparedBy.value);
      scheduleSave();
    });
    dom.status.addEventListener('change', function () {
      var prev = state.quote.status;
      state.quote.status = dom.status.value;
      addLogEntry('Status: ' + prev + ' → ' + dom.status.value);
      renderList();
      scheduleSave();
    });
    dom.discount.addEventListener('input', function () {
      state.quote.discount = Number(dom.discount.value) || 0;
      renderTotals(); scheduleSave();
    });
    dom.taxRate.addEventListener('input', function () {
      state.quote.taxRate = Number(dom.taxRate.value) || 0;
      renderTotals(); scheduleSave();
    });
    dom.deposit.addEventListener('input', function () {
      state.quote.deposit = Number(dom.deposit.value) || 0;
      renderTotals(); scheduleSave();
    });
    dom.notes.addEventListener('input', function () {
      state.quote.notes = dom.notes.value;
      scheduleSave();
    });

    /* pricing */
    dom.delivery.addEventListener('change', function () {
      state.quote.pricing = QS.fillPricing(state.quote.pricing);
      state.quote.pricing.delivery = dom.delivery.checked;
      renderPricing();
      scheduleSave();
    });
    dom.decalWhere.addEventListener('input', function () {
      state.quote.pricing = QS.fillPricing(state.quote.pricing);
      state.quote.pricing.decalWhere = dom.decalWhere.value;
      scheduleSave();
    });
    $('btnDecalPlus').addEventListener('click', function () {
      setDecals(QS.fillPricing(state.quote.pricing).decals + 1);
    });
    $('btnDecalMinus').addEventListener('click', function () {
      setDecals(QS.fillPricing(state.quote.pricing).decals - 1);
    });

    /* navigation */
    $('btnBack').addEventListener('click', function () {
      saveNow();
      setView('list');
      renderList();
    });
    window.addEventListener('popstate', function () {
      if (state.view === 'detail') { saveNow(); setView('list'); renderList(); }
      else if (state.view === 'settings') { setView('list'); renderList(); }
    });

    /* buttons */
    $('btnSave').addEventListener('click', saveAndConfirm);
    $('btnPrint').addEventListener('click', printNow);
    $('btnSendImage').addEventListener('click', function () { sendAs('png'); });
    $('btnSendPdf').addEventListener('click', function () { sendAs('pdf'); });
    $('btnSaveDone').addEventListener('click', hideSaved);
    $('saveModal').addEventListener('click', function (e) {
      if (e.target === this) hideSaved();
    });
    if ($('btnDeleteYes')) $('btnDeleteYes').addEventListener('click', doDelete);
    if ($('btnDeleteNo')) $('btnDeleteNo').addEventListener('click', closeDelete);
    if ($('deleteModal')) {
      $('deleteModal').addEventListener('click', function (e) {
        if (e.target === this) closeDelete();
      });
    }
    $('btnSaveAll').addEventListener('click', saveAndConfirm);
    $('btnSettings').addEventListener('click', openSettings);
    $('btnSettingsBack').addEventListener('click', function () {
      setView('list');
      renderList();
    });
    $('btnDownload').addEventListener('click', exportBackup);
    $('btnImport').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      if (e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = '';
    });
    $('btnNew').addEventListener('click', newQuote);
    $('btnAddLog').addEventListener('click', function () {
      addLogEntry(dom.logInput.value.trim());
      dom.logInput.value = '';
    });
    dom.logInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { addLogEntry(dom.logInput.value.trim()); dom.logInput.value = ''; }
    });
    dom.search.addEventListener('input', renderList);

    /* work card */
    dom.btnPin.addEventListener('click', function () {
      if (state.quote) togglePin(state.quote);
    });
    dom.btnComplete.addEventListener('click', function () {
      if (state.quote) toggleComplete(state.quote);
    });
    $('btnAddTask').addEventListener('click', function () {
      addTask(dom.taskInput.value);
      dom.taskInput.value = '';
    });
    dom.taskInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { addTask(dom.taskInput.value); dom.taskInput.value = ''; }
    });
    dom.prevToggle.addEventListener('click', function () {
      var collapsed = dom.prevList.classList.toggle('collapsed');
      dom.prevToggle.classList.toggle('collapsed', collapsed);
      dom.prevToggle.setAttribute('aria-expanded', String(!collapsed));
      QS.store.setMeta('prevCollapsed', collapsed);
    });

    /* photos: camera, picker, drag-drop, paste */
    $('btnCamera').addEventListener('click', function () { dom.photoCamera.click(); });
    $('btnLibrary').addEventListener('click', function () { dom.photoFile.click(); });
    dom.photoCamera.addEventListener('change', function (e) {
      if (e.target.files.length) addFiles(e.target.files);
      e.target.value = '';
    });
    dom.photoFile.addEventListener('change', function (e) {
      if (e.target.files.length) addFiles(e.target.files);
      e.target.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dom.photoDrop.addEventListener(ev, function (e) {
        e.preventDefault(); dom.photoDrop.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dom.photoDrop.addEventListener(ev, function (e) {
        e.preventDefault(); dom.photoDrop.classList.remove('over');
      });
    });
    dom.photoDrop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
    document.addEventListener('paste', function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      var files = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') === 0) {
          var f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) addFiles(files);
    });

    /* shortcuts */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('saveModal').classList.contains('on')) { hideSaved(); return; }
      if (e.key === 'Escape' && $('deleteModal') && $('deleteModal').classList.contains('on')) { closeDelete(); return; }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's') { e.preventDefault(); saveAndConfirm(); }
      if (e.key === 'p') { e.preventDefault(); printNow(); }
    });
    window.addEventListener('beforeunload', function (e) {
      if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    if (await QS.store.getMeta('prevCollapsed')) {
      dom.prevList.classList.add('collapsed');
      dom.prevToggle.classList.add('collapsed');
      dom.prevToggle.setAttribute('aria-expanded', 'false');
    }

    /* first quote */
    var lastId = await QS.store.getMeta('lastQuoteId');
    if (lastId && (await QS.store.getQuote(lastId))) {
      await loadQuote(lastId);
      setView('list');
    } else if (state.all.length) {
      await loadQuote(state.all[0].id);
      setView('list');
    } else {
      await newQuote();
    }

    /* deep link: #q=<id> opens straight into that quote */
    var m = /#q=([^&]+)/.exec(location.hash || '');
    if (m) {
      var deep = decodeURIComponent(m[1]);
      if (await QS.store.getQuote(deep)) {
        await loadQuote(deep);
        setView('detail');
      }
    }

    note(QS.store.isMemoryOnly() ? 'Storage blocked — take a backup!' : 'Ready', QS.store.isMemoryOnly());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
