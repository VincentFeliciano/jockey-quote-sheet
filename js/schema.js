/* Jockey quote sheet — field schema and record factory.
   Plain script (no modules) so the app also runs straight off file://. */
window.QS = window.QS || {};

QS.SECTIONS = [
  {
    id: 'customer',
    title: 'Customer',
    fields: [
      { k: 'customer.name',    label: 'Name',          type: 'text',  wide: false },
      { k: 'customer.company', label: 'Stable / Owner', type: 'text', wide: false },
      { k: 'customer.email',   label: 'Email',         type: 'email', wide: false },
      { k: 'customer.phone',   label: 'Phone',         type: 'tel',   wide: false },
      { k: 'customer.address', label: 'Address',       type: 'textarea', rows: 2, wide: true }
    ]
  },
  {
    id: 'job',
    title: 'Job',
    fields: [
      { k: 'job.jockey',  label: 'Jockey',    type: 'text' },
      { k: 'job.size',    label: 'Size',      type: 'text', placeholder: 'M / 32 waist' },
      { k: 'job.due',     label: 'Due date',  type: 'date' },
      { k: 'job.rush',    label: 'Rush job',  type: 'checkbox' }
    ]
  },
  {
    id: 'silks',
    title: 'Silks spec',
    fields: [
      { k: 'silks.body',    label: 'Body',    type: 'color' },
      { k: 'silks.sleeves', label: 'Sleeves', type: 'color' },
      { k: 'silks.cap',     label: 'Cap',     type: 'color' },
      { k: 'silks.pattern', label: 'Pattern', type: 'text', placeholder: 'hoops, 6 white' },
      { k: 'silks.collar',  label: 'Collar',  type: 'text', placeholder: 'stock, white' },
      { k: 'silks.cuffs',   label: 'Cuffs',   type: 'text' },
      {
        k: 'silks.fabric', label: 'Fabric', type: 'select',
        options: ['Lightweight nylon', 'Stretch', 'Traditional', 'Other']
      },
      { k: 'silks.qty', label: 'Sets', type: 'number', step: 1, min: 0 }
    ]
  }
];

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
  { desc: 'Jockey silks (set)', qty: 1, unit: 0 },
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
    validUntil: QS.plusDays(today, 30),
    preparedBy: '',
    pinned: false,
    stage: 'quote',
    completedAt: '',
    customer: { name: '', company: '', email: '', phone: '', address: '' },
    job: { jockey: '', size: '', due: '', rush: false },
    silks: { body: '', sleeves: '', cap: '', pattern: '', collar: '', cuffs: '', fabric: '', qty: 1 },
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
