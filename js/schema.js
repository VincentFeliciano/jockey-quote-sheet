/* Jockey quote sheet — field schema and record factory.
   Plain script (no modules) so the app also runs straight off file://. */
window.QS = window.QS || {};

QS.SECTIONS = [
  {
    id: 'customer',
    title: 'Customer',
    fields: [
      { k: 'customer.name',    label: 'Name',          type: 'text',  wide: false },
      { k: 'customer.company', label: 'Business / owner', type: 'text', wide: false },
      { k: 'customer.email',   label: 'Email',         type: 'email', wide: false },
      { k: 'customer.phone',   label: 'Phone',         type: 'tel',   wide: false },
      { k: 'customer.address', label: 'Address',       type: 'textarea', rows: 2, wide: true }
    ]
  },
  {
    id: 'job',
    title: 'The piece',
    fields: [
      { k: 'job.jockey',  label: 'Piece',     type: 'text', placeholder: 'Stocky the Jockey — 3 ft' },
      { k: 'job.size',    label: 'Size',      type: 'text', placeholder: '3 ft / 40 in' },
      { k: 'job.due',     label: 'Due date',  type: 'date' },
      { k: 'job.rush',    label: 'Rush job',  type: 'checkbox' }
    ]
  },
  {
    id: 'hat',
    title: 'Hat',
    fields: [
      { k: 'paint.hat.front', label: 'Front panel', type: 'color' },
      { k: 'paint.hat.left',  label: 'Left side',   type: 'color' },
      { k: 'paint.hat.right', label: 'Right side',  type: 'color' },
      { k: 'paint.hat.back',  label: 'Back panel',  type: 'color' },
      { k: 'paint.hat.bill',  label: 'Bill',        type: 'color' }
    ]
  },
  {
    id: 'figure',
    title: 'Jockey',
    fields: [
      { k: 'paint.figure.eyes',      label: 'Eyes',        type: 'color' },
      { k: 'paint.figure.hair',      label: 'Hair',        type: 'color' },
      { k: 'paint.figure.body',      label: 'Body',        type: 'color' },
      { k: 'paint.figure.sleeves',   label: 'Sleeves',     type: 'color' },
      { k: 'paint.figure.cuffs',     label: 'Cuffs',       type: 'color' },
      { k: 'paint.figure.buttons',   label: 'Buttons',     type: 'color' },
      { k: 'paint.figure.pants',     label: 'Pants',       type: 'color' },
      { k: 'paint.figure.boots',     label: 'Boots',       type: 'color' },
      { k: 'paint.figure.bootCuffs', label: 'Boot cuffs',  type: 'color' },
      { k: 'paint.chestLogo', label: 'Logo on the chest', type: 'checkbox' },
      { k: 'paint.chestText', label: 'Chest logo / lettering', type: 'text',
        placeholder: 'what goes on the chest', wide: true },
      { k: 'paint.backArt', label: 'Artwork on the back', type: 'checkbox' },
      { k: 'paint.backText', label: 'Back artwork / lettering', type: 'text',
        placeholder: 'what goes on the back', wide: true }
    ]
  },
  {
    id: 'base',
    title: 'Platform & base',
    fields: [
      { k: 'paint.base.platform',  label: 'Platform',              type: 'color' },
      { k: 'paint.base.base',      label: 'Base',                  type: 'color' },
      { k: 'paint.base.frontText', label: 'Text on base — front',  type: 'text', wide: true },
      { k: 'paint.base.backText',  label: 'Text on base — back',   type: 'text', wide: true }
    ]
  },
  {
    id: 'custom',
    title: 'Custom request',
    fields: [
      { k: 'paint.custom', label: 'What they asked for', type: 'textarea', rows: 3, wide: true,
        placeholder: 'Vinyl cut, stencil, lettering, colours…' },
      { k: 'paint.method', label: 'Method', type: 'select',
        options: ['Painted', 'Vinyl cut', 'Stencil', 'Mixed'] }
    ]
  }
];

/* Statue paint defaults. Platform is green and base is black unless told
   otherwise — that is how they usually leave the shop. */
QS.PAINT_DEFAULTS = {
  hat: { front: '', left: '', right: '', back: '', bill: '' },
  figure: {
    eyes: '', hair: '', body: '', sleeves: '', cuffs: '',
    buttons: '', pants: '', boots: '', bootCuffs: ''
  },
  base: { platform: '#2f7d32', base: '#000000', frontText: '', backText: '' },
  chestLogo: false, chestText: '',
  backArt: false, backText: '',
  method: '', custom: ''
};

QS.PREPARED_BY = 'Vincent Feliciano';

/* Deep-fill a paint block so records made before the statue spec existed
   come back with every field present. */
QS.fillPaint = function (src) {
  var out = JSON.parse(JSON.stringify(QS.PAINT_DEFAULTS));
  src = src || {};
  ['hat', 'figure', 'base'].forEach(function (grp) {
    var s = src[grp] || {};
    Object.keys(out[grp]).forEach(function (k) {
      if (s[k] !== undefined && s[k] !== null) out[grp][k] = s[k];
    });
  });
  ['chestLogo', 'chestText', 'backArt', 'backText', 'method', 'custom'].forEach(function (k) {
    if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
  });
  return out;
};

/* The work pipeline. A quote is either still being worked (anything before
   'done') or it is history. 'done' is what moves it out of the working list. */
QS.STAGES = [
  { id: 'quote',      label: 'Quoted',        hint: 'Priced, waiting on the customer' },
  { id: 'approved',   label: 'Approved',      hint: 'Go-ahead and deposit in' },
  { id: 'production', label: 'In production', hint: 'Cutting, printing, sewing' },
  { id: 'finishing',  label: 'Finishing',     hint: 'Buttons, press, packing' },
  { id: 'done',       label: 'Complete',      hint: 'Out the door' }
];

QS.DEFAULT_ITEMS = [
  { desc: 'Stocky the Jockey — painted statue', qty: 1, unit: 0 },
  { desc: 'Shipping', qty: 1, unit: 0 }
];

QS.STATUSES = ['draft', 'sent', 'accepted', 'declined', 'invoiced', 'paid'];

QS.uid = function () {
  return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
};

QS.today = function () {
  var d = new Date();
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

QS.plusDays = function (iso, days) {
  var d = iso ? new Date(iso + 'T12:00:00') : new Date();
  d.setDate(d.getDate() + days);
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

QS.newQuote = function (number) {
  var today = QS.today();
  return {
    id: QS.uid(),
    number: number || '',
    status: 'draft',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    date: today,
    preparedBy: QS.PREPARED_BY,
    pinned: false,
    stage: 'quote',
    completedAt: '',
    customer: { name: '', company: '', email: '', phone: '', address: '' },
    job: { jockey: '', size: '', due: '', rush: false },
    paint: QS.fillPaint(null),
    items: QS.DEFAULT_ITEMS.map(function (i) { return { desc: i.desc, qty: i.qty, unit: i.unit }; }),
    discount: 0,
    taxRate: 0,
    deposit: 0,
    notes: '',
    log: [],
    tasks: [],
    photos: []
  };
};

/* next free number, e.g. JQ-2026-004 */
QS.nextNumber = function (existing) {
  var year = new Date().getFullYear();
  var prefix = 'JQ-' + year + '-';
  var max = 0;
  (existing || []).forEach(function (q) {
    if (!q.number || q.number.indexOf(prefix) !== 0) return;
    var n = parseInt(q.number.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return prefix + String(max + 1).padStart(3, '0');
};

/* safe nested get/set: "silks.body" */
QS.getPath = function (obj, path) {
  return path.split('.').reduce(function (o, k) {
    return (o === null || o === undefined) ? undefined : o[k];
  }, obj);
};

QS.setPath = function (obj, path, val) {
  var keys = path.split('.');
  var last = keys.pop();
  var cur = keys.reduce(function (o, k) {
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    return o[k];
  }, obj);
  cur[last] = val;
};

QS.money = function (n) {
  var v = Number(n) || 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

QS.totals = function (q) {
  var sub = 0;
  (q.items || []).forEach(function (it) {
    sub += (Number(it.qty) || 0) * (Number(it.unit) || 0);
  });
  var disc = Number(q.discount) || 0;
  var base = sub - disc;
  if (base < 0) base = 0;
  var tax = base * ((Number(q.taxRate) || 0) / 100);
  var total = base + tax;
  var dep = Number(q.deposit) || 0;
  return {
    sub: sub,
    disc: disc,
    tax: tax,
    total: total,
    deposit: dep,
    balance: total - dep
  };
};

/* ---------- work state ---------- */

/* Records made before the work pipeline existed have no stage/tasks.
   Fill them in the first time we touch a quote, so old sheets just work. */
QS.ensureShape = function (q) {
  if (!q) return q;
  if (!Array.isArray(q.tasks)) q.tasks = [];
  if (q.pinned === undefined) q.pinned = false;
  if (q.completedAt === undefined) q.completedAt = '';
  if (!q.stage) q.stage = q.completedAt ? 'done' : 'quote';
  q.paint = QS.fillPaint(q.paint);
  if (!q.preparedBy) q.preparedBy = QS.PREPARED_BY;
  delete q.silks;
  delete q.validUntil;
  return q;
};

QS.isComplete = function (q) {
  return !!(q && (q.stage === 'done' || q.completedAt));
};

QS.stageIndex = function (q) {
  var id = (q && q.stage) || 'quote';
  for (var i = 0; i < QS.STAGES.length; i++) {
    if (QS.STAGES[i].id === id) return i;
  }
  return 0;
};

QS.stageLabel = function (id) {
  for (var i = 0; i < QS.STAGES.length; i++) {
    if (QS.STAGES[i].id === id) return QS.STAGES[i].label;
  }
  return id || 'Quoted';
};

QS.taskStats = function (q) {
  var tasks = (q && q.tasks) || [];
  var done = 0;
  tasks.forEach(function (t) { if (t.done) done++; });
  var total = tasks.length;
  return {
    done: done,
    total: total,
    pct: total ? Math.round((done / total) * 100) : 0,
    allDone: total > 0 && done === total
  };
};

/* Working list order: pinned first, then furthest along, then soonest due,
   then most recently touched. */
QS.workSort = function (a, b) {
  if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
  var sa = QS.stageIndex(a);
  var sb = QS.stageIndex(b);
  if (sa !== sb) return sb - sa;   /* nearer the finish, nearer the top */
  var da = (a.job && a.job.due) || '9999-12-31';
  var db = (b.job && b.job.due) || '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  return String(b.updated || '').localeCompare(String(a.updated || ''));
};

QS.newTask = function (text) {
  return {
    id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    text: text,
    done: false,
    ts: new Date().toISOString()
  };
};
