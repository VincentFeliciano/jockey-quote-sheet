/* Jockey quote sheet — field schema and record factory.
   Plain script (no modules) so the app also runs straight off file://. */
window.QS = window.QS || {};

QS.SECTIONS = [
  {
    id: 'job',
    title: 'The piece',
    fields: [
      { k: 'job.jockey',  label: 'Jockey name', type: 'text', placeholder: 'Stocky the Jockey', wide: true },
      { k: 'job.due',     label: 'Due date',    type: 'date' },
      { k: 'job.rush',    label: 'Rush job',    type: 'checkbox' }
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
  },
  {
    id: 'restore',
    title: 'Restoration',
    fields: [
      { k: 'restore.concrete', label: 'Concrete piece', type: 'checkbox' },
      { k: 'restore.work', label: 'What it needs', type: 'select',
        options: ['None', 'Surface work', 'Structure work', 'Both'] },
      { k: 'restore.strip',     label: 'Strip the old paint',    type: 'checkbox' },
      { k: 'restore.resurface', label: 'Resurface with cement',  type: 'checkbox' },
      { k: 'restore.note', label: 'Restoration notes', type: 'textarea', rows: 3, wide: true,
        placeholder: 'Cracks, missing chunks, what came off and what went back on…' }
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

/* ---------- restoration ----------

   A statue that comes in for restoration is stripped of its old paint and
   then resurfaced with cement — but only when each job actually needs
   doing, so both are switches rather than automatic add-ons. */

QS.RESTORE_STRIP = 150;     /* stripping the old paint off */
QS.RESTORE_SURFACE = 100;   /* resurfacing with cement */

QS.RESTORE_DEFAULTS = {
  concrete: false,
  work: 'None',
  strip: false,
  resurface: false,
  note: ''
};

/* Records made before restoration existed come back with every key
   present and nothing charged. */
QS.fillRestore = function (src) {
  var out = JSON.parse(JSON.stringify(QS.RESTORE_DEFAULTS));
  src = src || {};
  if (src.concrete !== undefined && src.concrete !== null) out.concrete = !!src.concrete;
  if (typeof src.work === 'string' && src.work) out.work = src.work;
  if (src.strip !== undefined && src.strip !== null) out.strip = !!src.strip;
  if (src.resurface !== undefined && src.resurface !== null) out.resurface = !!src.resurface;
  if (typeof src.note === 'string') out.note = src.note;
  return out;
};

/* True when there is anything at all to say about restoration, so the
   printed sheet and the export can leave the block out of a plain paint job. */
QS.hasRestore = function (q) {
  var r = QS.fillRestore((q && q.restore) || null);
  return !!(r.concrete || r.strip || r.resurface || r.note ||
            (r.work && r.work !== 'None'));
};

/* ---------- pricing ----------

   The paint job is the only thing whose price really moves: the more
   detail in the paint, the more it costs. Decals are flat-rate each,
   wherever they land, and delivery is a flat fee. */

QS.PAINT_TIERS = [
  { id: 'simple',   label: 'Simple',   price: 150, hint: 'One or two colours, clean lines' },
  { id: 'standard', label: 'Standard', price: 175, hint: 'Several colours, some detail' },
  { id: 'complex',  label: 'Complex',  price: 200, hint: 'Full colour work and fine detail' }
];

QS.DECAL_PRICE = 10;    /* each, front, back or bottom */
QS.DELIVERY_FEE = 50;

QS.PRICING_DEFAULTS = {
  paintTier: 'standard',
  decals: 0,
  decalWhere: '',
  delivery: false
};

QS.paintTier = function (id) {
  for (var i = 0; i < QS.PAINT_TIERS.length; i++) {
    if (QS.PAINT_TIERS[i].id === id) return QS.PAINT_TIERS[i];
  }
  return null;
};

/* Records made before pricing existed get the standard tier, no decals,
   no delivery — the same shape every time. */
QS.fillPricing = function (src) {
  var out = JSON.parse(JSON.stringify(QS.PRICING_DEFAULTS));
  src = src || {};
  if (src.paintTier !== undefined && QS.paintTier(src.paintTier)) out.paintTier = src.paintTier;
  if (src.paintTier === '') out.paintTier = '';
  if (src.decals !== undefined && src.decals !== null) out.decals = Math.max(0, Number(src.decals) || 0);
  if (src.decalWhere !== undefined && src.decalWhere !== null) out.decalWhere = src.decalWhere;
  if (src.delivery !== undefined && src.delivery !== null) out.delivery = !!src.delivery;
  return out;
};

/* The money the pricing block contributes — paint job, decals, delivery. */
QS.charges = function (q) {
  var p = QS.fillPricing((q && q.pricing) || null);
  var r = QS.fillRestore((q && q.restore) || null);
  var tier = QS.paintTier(p.paintTier);
  var paint = tier ? tier.price : 0;
  var decals = p.decals * QS.DECAL_PRICE;
  var delivery = p.delivery ? QS.DELIVERY_FEE : 0;
  var strip = r.strip ? QS.RESTORE_STRIP : 0;
  var surface = r.resurface ? QS.RESTORE_SURFACE : 0;
  return {
    paint: paint,
    paintLabel: tier ? tier.label : '',
    decals: decals,
    decalCount: p.decals,
    delivery: delivery,
    restoreStrip: strip,
    restoreSurface: surface,
    total: paint + decals + delivery + strip + surface
  };
};

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

QS.DEFAULT_ITEMS = [];   /* extras are opt-in now: paint, decals and delivery
                            are priced by the pricing block, not by line items */

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
    job: { jockey: '', due: '', rush: false },
    paint: QS.fillPaint(null),
    restore: QS.fillRestore(null),
    pricing: QS.fillPricing(null),
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
  var ch = QS.charges(q);
  var sub = ch.total;
  var disc = Number(q.discount) || 0;
  var base = sub - disc;
  if (base < 0) base = 0;
  var tax = base * ((Number(q.taxRate) || 0) / 100);
  var total = base + tax;
  var dep = Number(q.deposit) || 0;
  return {
    paint: ch.paint,
    paintLabel: ch.paintLabel,
    decals: ch.decals,
    decalCount: ch.decalCount,
    delivery: ch.delivery,
    restoreStrip: ch.restoreStrip,
    restoreSurface: ch.restoreSurface,
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
  q.restore = QS.fillRestore(q.restore);
  q.pricing = QS.fillPricing(q.pricing);
  if (!q.preparedBy) q.preparedBy = QS.PREPARED_BY;
  delete q.silks;
  delete q.validUntil;
  delete q.customer;   /* no customer details — this is the shop's own sheet */
  delete q.items;      /* extras are gone: paint, decals and delivery only */
  if (q.job) delete q.job.size;
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
