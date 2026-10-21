/* DOM rendering for the quote sheet. */
window.QS = window.QS || {};

QS.ui = (function () {
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k === 'class') n.className = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function label(text, control, extraClass) {
    var l = el('label', { class: extraClass || '' });
    var span = el('span', { text: text });
    l.appendChild(span);
    l.appendChild(control);
    return l;
  }

  /* ---------- field controls ---------- */

  function makeControl(f, quote, onInput) {
    var val = QS.getPath(quote, f.k);

    if (f.type === 'color') {
      var wrap = el('div', { class: 'colorfield' });
      var picker = el('input', { type: 'color', 'data-k': f.k });
      picker.value = /^#[0-9a-f]{6}$/i.test(val || '') ? val : '#ffffff';
      var nameIn = el('input', { type: 'text', 'data-k': f.k + 'Name', placeholder: 'color name' });
      nameIn.value = QS.getPath(quote, f.k + 'Name') || '';
      picker.addEventListener('input', function () { onInput(f.k, picker.value); });
      nameIn.addEventListener('input', function () { onInput(f.k + 'Name', nameIn.value); });
      wrap.appendChild(picker);
      wrap.appendChild(nameIn);
      return wrap;
    }

    if (f.type === 'checkbox') {
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !!val;
      cb.addEventListener('change', function () { onInput(f.k, cb.checked); });
      var cl = el('label', { class: 'check' });
      cl.appendChild(cb);
      cl.appendChild(el('span', { text: f.label }));
      cl.dataset.k = f.k;
      return cl;
    }

    if (f.type === 'select') {
      var sel = el('select', { 'data-k': f.k });
      sel.appendChild(el('option', { value: '', text: '—' }));
      (f.options || []).forEach(function (o) {
        var opt = el('option', { value: o, text: o });
        if (o === val) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () { onInput(f.k, sel.value); });
      return sel;
    }

    if (f.type === 'textarea') {
      var ta = el('textarea', { rows: f.rows || 3 });
      ta.value = val || '';
      ta.addEventListener('input', function () { onInput(f.k, ta.value); });
      return ta;
    }

    var inp = el('input', { type: f.type || 'text' });
    if (f.step !== undefined) inp.step = f.step;
    if (f.min !== undefined) inp.min = f.min;
    if (f.placeholder) inp.placeholder = f.placeholder;
    inp.value = val === undefined || val === null ? '' : val;
    inp.addEventListener('input', function () {
      onInput(f.k, f.type === 'number' ? (inp.value === '' ? 0 : Number(inp.value)) : inp.value);
    });
    return inp;
  }

  /* ---------- sections ---------- */

  function buildSections(root, quote, onInput) {
    root.innerHTML = '';
    QS.SECTIONS.forEach(function (sec) {
      var card = el('section', { class: 'card' });
      card.appendChild(el('h2', { text: sec.title }));
      var grid = el('div', { class: 'grid' });
      sec.fields.forEach(function (f) {
        var control = makeControl(f, quote, onInput);
        var isCheck = f.type === 'checkbox';
        if (isCheck) {
          grid.appendChild(control);
        } else {
          var l = label(f.label, control, f.wide ? 'wide' : '');
          grid.appendChild(l);
        }
      });
      card.appendChild(grid);
      root.appendChild(card);
    });
  }

  /* ---------- photos ---------- */

  function buildPhotos(grid, photos, handlers) {
    grid.innerHTML = '';
    photos.forEach(function (p) {
      var fig = el('div', { class: 'photo' });

      var img = el('img', { src: p.dataUrl, alt: p.name || 'photo' });
      img.addEventListener('click', function () { openLightbox(p.dataUrl); });

      var x = el('button', { class: 'x', type: 'button', title: 'Remove photo', text: '×' });
      x.addEventListener('click', function () { handlers.remove(p); });

      var cap = el('input', { class: 'cap', type: 'text', placeholder: 'Caption' });
      cap.value = p.caption || '';
      cap.addEventListener('input', function () { handlers.caption(p, cap.value); });

      fig.appendChild(img);
      fig.appendChild(x);
      fig.appendChild(cap);
      grid.appendChild(fig);
    });
  }

  function openLightbox(src) {
    var lb = el('div', { class: 'lightbox' });
    lb.appendChild(el('img', { src: src }));
    lb.addEventListener('click', function () { lb.remove(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(lb);
  }

  /* ---------- follow-up log ---------- */

  function buildLog(listEl, quote, handlers) {
    listEl.innerHTML = '';
    var log = (quote.log || []).slice().reverse();
    if (!log.length) {
      listEl.appendChild(el('li', { text: 'Nothing logged yet.' }));
      return;
    }
    log.forEach(function (entry) {
      var li = el('li');
      var t = new Date(entry.ts);
      var stamp = isNaN(t) ? '' : t.toLocaleString();
      li.appendChild(el('time', { text: stamp }));
      li.appendChild(document.createTextNode(entry.text));
      var x = el('button', { class: 'del', type: 'button', text: '×', title: 'Remove entry' });
      x.style.float = 'right';
      x.addEventListener('click', function () { handlers.remove(entry); });
      li.appendChild(x);
      listEl.appendChild(li);
    });
  }

  /* ---------- work checklist ---------- */

  function buildTasks(listEl, quote, handlers) {
    listEl.innerHTML = '';
    var tasks = quote.tasks || [];
    if (!tasks.length) {
      listEl.appendChild(el('li', { class: 'empty', text: 'No steps yet — add the first one above.' }));
      return;
    }
    tasks.forEach(function (t) {
      var li = el('li', { class: t.done ? 'task done' : 'task' });

      var box = el('input', { type: 'checkbox' });
      box.checked = !!t.done;
      box.addEventListener('change', function () { handlers.toggle(t, box.checked); });

      var text = el('span', { class: 'ttext', text: t.text });

      var x = el('button', { class: 'del', type: 'button', text: '×', title: 'Remove step' });
      x.addEventListener('click', function () { handlers.remove(t); });

      li.appendChild(box);
      li.appendChild(text);
      li.appendChild(x);
      listEl.appendChild(li);
    });
  }

  return {
    el: el,
    buildSections: buildSections,
    buildPhotos: buildPhotos,
    buildLog: buildLog,
    buildTasks: buildTasks,
    openLightbox: openLightbox
  };
})();
