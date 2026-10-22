/* Turns a quote into a picture or a PDF you can text or email.
   Drawn by hand on a canvas: no libraries, no network, works offline.

   The sheet is laid out for ONE page. Two columns carry the parts, the money
   sits side by side underneath, and if a quote still runs long the whole thing
   is scaled down to fit rather than spilling onto a second sheet. */
window.QS = window.QS || {};

QS.exportDoc = (function () {
  var W = 1240;            /* A4 at 150dpi */
  var H = 1754;
  var M = 76;              /* margin */
  var CW = W - M * 2;
  var GAP = 40;            /* between the two columns */
  var COLW = (CW - GAP) / 2;
  var BRAND = 74;          /* the black band across the top */
  var TOP = BRAND + 20;    /* first baseline area under the band */
  var FOOT = 92;
  var BOTTOM = H - FOOT;   /* content must end above this */
  var AVAIL = BOTTOM - TOP;
  var MIN_K = 0.52;        /* never shrink past this before giving up */

  var INK = '#0a0a0a';
  var MID = '#454545';
  var MUTED = '#8a8a8a';
  var LINE = '#dcdcdc';
  var YELLOW = '#ffd60a';
  var FONT = 'Helvetica, Arial, system-ui, sans-serif';

  /* fit factor: every type size and vertical step is multiplied by this, so a
     long quote gets smaller but keeps the full width of the sheet */
  var K = 1;
  function S(v) { return Math.round(v * K * 10) / 10; }

  /* The marks: PLYMR is yellow on clear and Crafter's Gallery is white, so
     neither reads on white paper — they live on a black band. Both are loaded
     once at startup; if they are not in yet the band is drawn plain rather
     than holding up an export. */
  var marks = { plymr: null, cg: null };
  var loading = 0;
  var waiters = [];

  function loadMark(key, src) {
    var im;
    try { im = new Image(); } catch (e) { return; }   /* no Image in a shim */
    loading++;
    function settled() {
      if (im.naturalWidth && im.naturalHeight) marks[key] = im;
      loading--;
      if (!loading) waiters.splice(0).forEach(function (f) { f(); });
    }
    im.onload = settled;
    im.onerror = settled;
    im.src = src;
  }

  loadMark('plymr', 'icons/plymr.png');
  loadMark('cg', 'icons/cg.svg');

  /* resolves once both marks have loaded (or failed) */
  function brandReady() {
    if (!loading) return Promise.resolve();
    return new Promise(function (res) { waiters.push(res); });
  }

  /* ---------- the reference photos ----------

     A canvas cannot decode a picture while it is drawing, so the photos are
     decoded ahead of time and kept here. The app preloads them whenever the
     photo grid is rendered, which is why an export is still built inside the
     tap that asked for it: the share sheet needs that gesture. */

  var photoCache = {};

  function photoKey(ph) { return ph.id || ph.dataUrl; }

  function loadPhoto(ph) {
    return new Promise(function (res) {
      var key = photoKey(ph);
      if (photoCache[key]) return res(photoCache[key]);
      var im;
      try { im = new Image(); } catch (e) { return res(null); }
      im.onload = function () { if (im.naturalWidth) photoCache[key] = im; res(photoCache[key] || null); };
      im.onerror = function () { res(null); };
      im.src = ph.dataUrl;
    });
  }

  function preload(photos) {
    return Promise.all((photos || []).map(loadPhoto));
  }

  function ready(photos) {
    return (photos || []).every(function (ph) { return !!photoCache[photoKey(ph)]; });
  }

  function font(ctx, weight, size) {
    ctx.font = weight + ' ' + size + 'px ' + FONT;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(String(iso) + 'T12:00:00');
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* letterspaced small caps, for section labels */
  function spaced(ctx, text, x, y, gap) {
    var cx = x;
    for (var i = 0; i < text.length; i++) {
      ctx.fillText(text.charAt(i), cx, y);
      cx += ctx.measureText(text.charAt(i)).width + gap;
    }
  }

  function wrap(ctx, text, width) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (para) {
      var words = para.split(/\s+/);
      var line = '';
      words.forEach(function (w) {
        var next = line ? line + ' ' + w : w;
        if (ctx.measureText(next).width > width && line) {
          out.push(line);
          line = w;
        } else {
          line = next;
        }
      });
      out.push(line);
    });
    return out;
  }

  function brandBand(ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, BRAND);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(0, BRAND - 3, W, 3);

    var mid = BRAND / 2;
    var x = M;

    var p = marks.plymr;
    if (p) {
      var ph = 28;
      var pw = ph * (p.naturalWidth / p.naturalHeight);
      ctx.drawImage(p, x, mid - ph / 2, pw, ph);
      x += pw + 20;
    }

    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x, mid - 16, 1.5, 32);
    x += 21;

    var g = marks.cg;
    if (g) {
      var gh = 24;
      var gw = gh * (g.naturalWidth / g.naturalHeight);
      ctx.drawImage(g, x, mid - gh / 2, gw, gh);
    }

    /* what the sheet is, said in the brand's own voice */
    var strap = 'QUOTE FOR CRAFTER\u2019S GALLERY';
    font(ctx, '700', 16);
    ctx.fillStyle = YELLOW;
    var sw = 0;
    for (var i = 0; i < strap.length; i++) sw += ctx.measureText(strap.charAt(i)).width + 2.6;
    spaced(ctx, strap, W - M - sw, mid + 6, 2.6);
  }

  /* a fresh cursor at the top of the sheet */
  function sheet(ctx) {
    return { ctx: ctx, x: M, y: TOP, w: CW };
  }

  function header(d, q) {
    var ctx = d.ctx;
    var j = q.job || {};
    font(ctx, '700', S(44));
    ctx.fillStyle = INK;
    ctx.fillText('QUOTE', d.x, d.y + S(36));
    var w = ctx.measureText('QUOTE').width;
    ctx.fillStyle = YELLOW;
    ctx.fillRect(d.x, d.y + S(44), w, S(6));

    var right = d.x + d.w;
    ctx.textAlign = 'right';
    font(ctx, '700', S(22));
    ctx.fillStyle = INK;
    ctx.fillText(q.number || 'un-numbered', right, d.y + S(15));
    var ry = d.y + S(40);
    font(ctx, '400', S(17));
    ctx.fillStyle = MID;
    if (q.date) { ctx.fillText('Dated ' + fmtDate(q.date), right, ry); ry += S(22); }
    if (j.due) { ctx.fillText('Due ' + fmtDate(j.due), right, ry); ry += S(22); }
    if (q.preparedBy) { ctx.fillText('Prepared by ' + q.preparedBy, right, ry); ry += S(22); }
    ctx.textAlign = 'left';

    d.y += Math.max(S(64), ry - d.y + S(4));
    ctx.fillStyle = LINE;
    ctx.fillRect(d.x, d.y, d.w, 1.5);
    d.y += S(22);
  }

  function sectionTitle(d, text) {
    var ctx = d.ctx;
    font(ctx, '700', S(12.5));
    ctx.fillStyle = MUTED;
    spaced(ctx, String(text).toUpperCase(), d.x, d.y + S(11), 2);
    ctx.fillStyle = LINE;
    ctx.fillRect(d.x, d.y + S(22), d.w, 1.5);
    d.y += S(30);
  }

  function row(d, label, value, hex, badge, design) {
    var ctx = d.ctx;
    var right = d.x + d.w;
    var text = value || '';

    var lines = [];
    if (design) {
      font(ctx, '400', S(14));
      lines = wrap(ctx, 'Design: ' + design, d.w - S(4)).slice(0, 2);
    }
    var h = S(34) + lines.length * S(19);

    font(ctx, '400', S(17.5));
    ctx.fillStyle = MID;
    ctx.fillText(label, d.x, d.y + S(21));

    if (badge && text) {
      font(ctx, '700', S(15));
      var bw = ctx.measureText(text).width + S(22);
      ctx.fillStyle = YELLOW;
      ctx.fillRect(right - bw, d.y + S(4), bw, S(26));
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.fillText(text, right - S(11), d.y + S(23));
      ctx.textAlign = 'left';
    } else if (/^#[0-9a-f]{6}$/i.test(hex || '')) {
      ctx.fillStyle = hex;
      ctx.fillRect(right - S(21), d.y + S(6), S(19), S(19));
      ctx.strokeStyle = '#c2c2c2';
      ctx.lineWidth = 1;
      ctx.strokeRect(right - S(21) - 0.5, d.y + S(6) - 0.5, S(19) + 1, S(19) + 1);
      font(ctx, '600', S(18));
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.fillText(text || hex, right - S(28), d.y + S(22));
      ctx.textAlign = 'left';
    } else {
      font(ctx, '600', S(18));
      ctx.fillStyle = text ? INK : MUTED;
      ctx.textAlign = 'right';
      ctx.fillText(text || '\u2014', right, d.y + S(22));
      ctx.textAlign = 'left';
    }

    /* the design note sits under its colour, quiet, so the sheet still reads
       as a list of parts */
    if (lines.length) {
      font(ctx, '400', S(14));
      ctx.fillStyle = MID;
      lines.forEach(function (ln, i) {
        ctx.fillText(ln, d.x, d.y + S(21) + S(15) + i * S(19));
      });
    }

    ctx.fillStyle = LINE;
    ctx.fillRect(d.x, d.y + h - 1, d.w, 1);
    d.y += h;
  }

  function specBlock(d, title, rows) {
    rows = rows.filter(function (r) { return r && (r.value || r.hex); });
    if (!rows.length) return;
    sectionTitle(d, title);
    rows.forEach(function (r) {
      row(d, r.label, r.value, r.hex, r.badge, r.design);
    });
    d.y += S(16);
  }

  /* ---------- the parts, two columns ---------- */

  function specs(d, q) {
    var p = QS.fillPaint(q.paint);
    var j = q.job || {};
    var top = d.y;

    /* left: the painted parts */
    d.x = M; d.w = COLW;
    specBlock(d, 'Hat', [
      { label: 'Front panel', value: p.hat.frontName || p.hat.front, hex: p.hat.front, design: p.hat.frontDesign },
      { label: 'Left side', value: p.hat.leftName || p.hat.left, hex: p.hat.left, design: p.hat.leftDesign },
      { label: 'Right side', value: p.hat.rightName || p.hat.right, hex: p.hat.right, design: p.hat.rightDesign },
      { label: 'Back panel', value: p.hat.backName || p.hat.back, hex: p.hat.back, design: p.hat.backDesign },
      { label: 'Bill', value: p.hat.billName || p.hat.bill, hex: p.hat.bill, design: p.hat.billDesign }
    ]);
    specBlock(d, 'Jockey', [
      { label: 'Eyes', value: p.figure.eyesName || p.figure.eyes, hex: p.figure.eyes, design: p.figure.eyesDesign },
      { label: 'Hair', value: p.figure.hairName || p.figure.hair, hex: p.figure.hair, design: p.figure.hairDesign },
      { label: 'Body', value: p.figure.bodyName || p.figure.body, hex: p.figure.body, design: p.figure.bodyDesign },
      { label: 'Sleeves', value: p.figure.sleevesName || p.figure.sleeves, hex: p.figure.sleeves, design: p.figure.sleevesDesign },
      { label: 'Cuffs', value: p.figure.cuffsName || p.figure.cuffs, hex: p.figure.cuffs, design: p.figure.cuffsDesign },
      { label: 'Buttons', value: p.figure.buttonsName || p.figure.buttons, hex: p.figure.buttons, design: p.figure.buttonsDesign },
      { label: 'Pants', value: p.figure.pantsName || p.figure.pants, hex: p.figure.pants, design: p.figure.pantsDesign },
      { label: 'Boots', value: p.figure.bootsName || p.figure.boots, hex: p.figure.boots, design: p.figure.bootsDesign },
      { label: 'Boot cuffs', value: p.figure.bootCuffsName || p.figure.bootCuffs, hex: p.figure.bootCuffs, design: p.figure.bootCuffsDesign },
      { label: 'Chest logo', value: (p.chestLogo || p.chestText) ? (p.chestText || 'Yes') : '' },
      { label: 'Back artwork', value: (p.backArt || p.backText) ? (p.backText || 'Yes') : '' }
    ]);
    var leftEnd = d.y;

    /* right: the job, the base and the restoration */
    d.x = M + COLW + GAP; d.w = COLW; d.y = top;
    specBlock(d, 'The piece', [
      { label: 'Jockey name', value: j.jockey },
      { label: 'Due date', value: fmtDate(j.due) },
      { label: 'Rush job', value: j.rush ? 'RUSH JOB' : '', badge: true }
    ]);
    specBlock(d, 'Platform & base', [
      { label: 'Platform', value: p.base.platformName || p.base.platform, hex: p.base.platform, design: p.base.platformDesign },
      { label: 'Base', value: p.base.baseName || p.base.base, hex: p.base.base, design: p.base.baseDesign },
      { label: 'Base front text', value: p.base.frontText },
      { label: 'Base back text', value: p.base.backText }
    ]);
    specBlock(d, 'Custom request', [
      { label: 'Method', value: p.method },
      { label: 'Asked for', value: p.custom }
    ]);
    if (QS.hasRestore(q)) {
      var r = QS.fillRestore(q.restore);
      specBlock(d, 'Restoration', [
        { label: 'Piece', value: r.concrete ? 'Concrete' : 'Not concrete' },
        { label: 'Work needed', value: r.work && r.work !== 'None' ? r.work : '' },
        { label: 'Strip old paint', value: r.strip ? QS.money(QS.RESTORE_STRIP) : '' },
        { label: 'Resurface with cement', value: r.resurface ? QS.money(QS.RESTORE_SURFACE) : '' },
        { label: 'Notes', value: r.note }
      ]);
    }
    var rightEnd = d.y;

    d.x = M; d.w = CW;
    d.y = Math.max(leftEnd, rightEnd) + S(6);
  }

  /* ---------- the money, side by side ---------- */

  function clip(ctx, text, maxWidth) {
    text = String(text || '');
    if (ctx.measureText(text).width <= maxWidth) return text;
    var cut = text;
    while (cut.length > 1 && ctx.measureText(cut + '\u2026').width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return cut + '\u2026';
  }

  function line(d, label, value) {
    var ctx = d.ctx;
    font(ctx, '600', S(18));
    var vw = ctx.measureText(value).width;
    font(ctx, '400', S(18));
    ctx.fillStyle = MID;
    ctx.fillText(clip(ctx, label, d.w - vw - S(14)), d.x, d.y + S(21));
    font(ctx, '600', S(18));
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText(value, d.x + d.w, d.y + S(21));
    ctx.textAlign = 'left';
    ctx.fillStyle = LINE;
    ctx.fillRect(d.x, d.y + S(30), d.w, 1);
    d.y += S(34);
  }

  function pricing(d, q) {
    var t = QS.totals(q);
    var p = QS.fillPricing(q.pricing);
    sectionTitle(d, 'Pricing');
    line(d, 'Paint job' + (t.paintLabel ? ' \u2014 ' + t.paintLabel : ''), QS.money(t.paint));
    if (t.decalCount) {
      line(d, 'Decals \u00d7' + t.decalCount + (p.decalWhere ? ' (' + p.decalWhere + ')' : ''),
        QS.money(t.decals));
    }
    line(d, 'Delivery', t.delivery ? QS.money(t.delivery) : '\u2014');
    if (t.restoreStrip) line(d, 'Strip old paint', QS.money(t.restoreStrip));
    if (t.restoreSurface) line(d, 'Resurface with cement', QS.money(t.restoreSurface));
  }

  function totals(d, q) {
    var t = QS.totals(q);
    var rows = [['Subtotal', QS.money(t.sub), false]];
    if (t.disc) rows.push(['Discount', '-' + QS.money(t.disc), false]);
    if (Number(q.taxRate)) rows.push(['Tax (' + q.taxRate + '%)', QS.money(t.tax), false]);
    rows.push(['Total', QS.money(t.total), true]);
    if (t.deposit) {
      rows.push(['Deposit paid', QS.money(t.deposit), false]);
      rows.push(['Balance due', QS.money(t.balance), true]);
    }

    var ctx = d.ctx;
    var pitch = S(36);
    var h = S(14) + rows.length * pitch + S(12);
    var top = d.y;
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(d.x, top, d.w, h);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(d.x, top, S(6), h);

    var y = top + S(14) + S(24);
    rows.forEach(function (r) {
      var big = r[2];
      font(ctx, big ? '700' : '400', big ? S(22) : S(18));
      ctx.fillStyle = big ? INK : MID;
      ctx.fillText(r[0], d.x + S(20), y);
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.fillText(r[1], d.x + d.w - S(18), y);
      ctx.textAlign = 'left';
      y += pitch;
    });
    d.y = top + h;
  }

  function money(d, q) {
    var top = d.y;
    d.x = M; d.w = COLW;
    pricing(d, q);
    var leftEnd = d.y;
    d.x = M + COLW + GAP; d.w = COLW; d.y = top;
    totals(d, q);
    var rightEnd = d.y;
    d.x = M; d.w = CW;
    d.y = Math.max(leftEnd, rightEnd) + S(16);
  }

  /* ---------- the rest, full width ---------- */

  function notes(d, q) {
    if (!q.notes) return;
    var ctx = d.ctx;
    font(ctx, '400', S(17));
    var lines = wrap(ctx, q.notes, d.w);
    sectionTitle(d, 'Notes');
    lines.forEach(function (ln) {
      font(d.ctx, '400', S(17));
      d.ctx.fillStyle = MID;
      d.ctx.fillText(ln, d.x, d.y + S(16));
      d.y += S(22);
    });
    d.y += S(10);
  }

  function followUp(d, q) {
    if (!q.log || !q.log.length) return;
    sectionTitle(d, 'Follow-up');
    /* a long history is summarised, not reprinted: the sheet stays one page */
    var entries = q.log.slice(-8);
    var hidden = q.log.length - entries.length;
    if (hidden > 0) {
      font(d.ctx, '400', S(15));
      d.ctx.fillStyle = MUTED;
      d.ctx.fillText('+' + hidden + ' earlier', d.x, d.y + S(14));
      d.y += S(20);
    }
    entries.forEach(function (e) {
      var dt = new Date(e.ts);
      var stamp = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      font(d.ctx, '400', S(15));
      d.ctx.fillStyle = MUTED;
      d.ctx.fillText(stamp, d.x, d.y + S(14));
      font(d.ctx, '400', S(15));
      d.ctx.fillStyle = MID;
      var txt = wrap(d.ctx, e.text || '', d.w - S(110));
      d.ctx.fillText(txt[0] || '', d.x + S(96), d.y + S(14));
      d.y += S(22);
    });
    d.y += S(10);
  }

  /* ---------- the photos, so the design can be checked by eye ---------- */

  function photoStrip(d, photos) {
    if (!photos || !photos.length) return;
    var ctx = d.ctx;
    var shown = photos.slice(0, 4);
    var more = photos.length - shown.length;
    var h = S(104);
    var gap = S(14);
    var w = (d.w - gap * (shown.length - 1)) / shown.length;
    var captioned = false;

    sectionTitle(d, 'Reference photos');
    var top = d.y;
    shown.forEach(function (ph, i) {
      var im = photoCache[photoKey(ph)];
      var x = d.x + i * (w + gap);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);
      if (im && im.naturalWidth) {
        var sc = Math.min((w - S(6)) / im.naturalWidth, (h - S(6)) / im.naturalHeight);
        var iw = im.naturalWidth * sc;
        var ih = im.naturalHeight * sc;
        ctx.drawImage(im, x + (w - iw) / 2, top + (h - ih) / 2, iw, ih);
      }
      if (ph.caption) {
        captioned = true;
        font(ctx, '400', S(12));
        ctx.fillStyle = MUTED;
        ctx.fillText(clip(ctx, ph.caption, w), x, top + h + S(15));
      }
    });
    d.y = top + h + (captioned ? S(22) : 0) + S(12);

    if (more > 0) {
      font(ctx, '400', S(13));
      ctx.fillStyle = MUTED;
      ctx.fillText('+' + more + ' more photo' + (more === 1 ? '' : 's'), d.x, d.y);
      d.y += S(18);
    }
  }

  /* ---------- the bit the customer signs ----------

     This is a confirmation sheet as much as a quote: the point of it is that
     someone reads every colour and design and puts their name to it. */

  function confirmBlock(d, q) {
    var ctx = d.ctx;
    var h = S(100);
    sectionTitle(d, 'Please confirm');
    var top = d.y;
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(d.x, top, d.w, h);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(d.x, top, S(6), h);

    font(ctx, '400', S(14.5));
    ctx.fillStyle = MID;
    ctx.fillText('Check every colour, design and note above against what you asked for.',
      d.x + S(20), top + S(24));

    var half = (d.w - S(40) - S(28)) / 2;
    var y = top + h - S(20);
    ctx.fillStyle = '#c2c2c2';
    ctx.fillRect(d.x + S(20), y, half, 1);
    ctx.fillRect(d.x + S(20) + half + S(28), y, half, 1);
    font(ctx, '400', S(12));
    ctx.fillStyle = MUTED;
    ctx.fillText('Signed', d.x + S(20), y - S(7));
    ctx.fillText('Date', d.x + S(20) + half + S(28), y - S(7));

    d.y = top + h + S(10);
  }

  function footer(ctx, q) {
    var y = H - 46;
    ctx.fillStyle = LINE;
    ctx.fillRect(M, y - 30, CW, 1);
    font(ctx, '400', S(15));
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left';
    ctx.fillText((q.number || 'Quote') +
      (q.job && q.job.jockey ? ' \u00b7 ' + q.job.jockey : ''), M, y);
    ctx.textAlign = 'right';
    ctx.fillText(String(q.status || '').toUpperCase(), W - M, y);
    ctx.textAlign = 'left';
  }

  /* ---------- compose, then shrink to fit one sheet ---------- */

  function layout(q, ctx, photos) {
    var d = sheet(ctx);
    header(d, q);
    specs(d, q);
    money(d, q);
    notes(d, q);
    followUp(d, q);
    photoStrip(d, photos);
    confirmBlock(d, q);
    return d.y;
  }

  function scratch() {
    var c = document.createElement('canvas');
    c.width = W;
    c.height = 4000;
    var ctx = c.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    return ctx;
  }

  /* how tall the sheet wants to be at the current fit factor */
  function needed(q, photos) {
    return layout(q, scratch(), photos) - TOP;
  }

  function render(q, photos) {
    K = 1;
    var h = needed(q, photos);
    var guard = 0;
    /* nothing spills onto a second page: the sheet shrinks instead */
    while (h > AVAIL && K > MIN_K && guard++ < 5) {
      K = Math.max(MIN_K, K * (AVAIL / h) * 0.98);
      h = needed(q, photos);
    }
    /* and when the quote is short, it grows into the space rather than
       leaving half the sheet blank — but only if it still fits */
    if (h < AVAIL * 0.88) {
      var was = K;
      K = Math.min(1.18, K * (AVAIL * 0.95) / h);
      if (needed(q, photos) > AVAIL) K = was;
    }

    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    brandBand(ctx);
    layout(q, ctx, photos);
    footer(ctx, q);
    return [c];
  }

  /* ---------- files ---------- */

  function slug(q) {
    var n = String(q.number || 'quote').replace(/[^a-z0-9\-_]+/gi, '-').replace(/^-+|-+$/g, '');
    return n || 'quote';
  }

  /* one picture, always — kept for the day a sheet ever needs stitching */
  function stitch(pages) {
    if (pages.length === 1) return pages[0];
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H * pages.length;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    pages.forEach(function (p, i) { ctx.drawImage(p, 0, i * H); });
    return c;
  }

  function dataUrlBytes(url) {
    var bin = atob(String(url).slice(String(url).indexOf(',') + 1));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function enc(s) { return new TextEncoder().encode(s); }

  /* A minimal PDF: one page per canvas, each page a full-bleed JPEG. */
  function pdfFrom(pages) {
    var chunks = [];
    var len = 0;
    var off = {};
    var count = 2 + pages.length * 3;

    function push(b) { chunks.push(b); len += b.length; }
    function text(s) { push(enc(s)); }
    function obj(id, body) {
      off[id] = len;
      text(id + ' 0 obj\n' + body + '\nendobj\n');
    }

    var kids = [];
    pages.forEach(function (p, i) { kids.push((3 + i * 3) + ' 0 R'); });

    text('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>');

    pages.forEach(function (p, i) {
      var pid = 3 + i * 3;
      var cid = pid + 1;
      var iid = pid + 2;
      var jpg = dataUrlBytes(p.toDataURL('image/jpeg', 0.9));
      var content = 'q 595.276 0 0 841.89 0 0 cm /Im0 Do Q\n';

      obj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] ' +
        '/Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> /Contents ' + cid + ' 0 R >>');
      obj(cid, '<< /Length ' + enc(content).length + ' >>\nstream\n' + content + 'endstream');

      off[iid] = len;
      text(iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + W + ' /Height ' + H +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        jpg.length + ' >>\nstream\n');
      push(jpg);
      text('\nendstream\nendobj\n');
    });

    var xref = len;
    text('xref\n0 ' + (count + 1) + '\n');
    text('0000000000 65535 f \n');
    for (var id = 1; id <= count; id++) {
      text(String(off[id] || 0).padStart(10, '0') + ' 00000 n \n');
    }
    text('trailer\n<< /Size ' + (count + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

    return new Blob(chunks, { type: 'application/pdf' });
  }

  function png(q, photos) {
    var pages = render(q, photos);
    var canvas = stitch(pages);
    var bytes = dataUrlBytes(canvas.toDataURL('image/png'));
    return { blob: new Blob([bytes], { type: 'image/png' }), name: slug(q) + '.png', pages: pages.length };
  }

  function pdf(q, photos) {
    var pages = render(q, photos);
    return { blob: pdfFrom(pages), name: slug(q) + '.pdf', pages: pages.length };
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
  }

  /* Native share sheet where it exists — Messages, Mail, WhatsApp — and a
     download where it does not. The photos are normally already decoded (the
     app preloads them with the photo grid), so this is built synchronously and
     the tap still counts as the gesture the share sheet requires. */
  function share(kind, q, photos) {
    if (ready(photos)) return shareNow(kind, q, photos);
    return preload(photos).then(function () { return shareNow(kind, q, photos); });
  }

  function shareNow(kind, q, photos) {
    var out = kind === 'pdf' ? pdf(q, photos) : png(q, photos);
    var file;
    try {
      file = new File([out.blob], out.name, { type: out.blob.type });
    } catch (e) {
      download(out.blob, out.name);
      return Promise.resolve({ shared: false, downloaded: true, name: out.name });
    }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: out.name }).then(function () {
        return { shared: true, name: out.name, pages: out.pages };
      }, function (err) {
        if (err && err.name === 'AbortError') {
          return { shared: false, cancelled: true, name: out.name };
        }
        download(out.blob, out.name);
        return { shared: false, downloaded: true, name: out.name, pages: out.pages };
      });
    }
    download(out.blob, out.name);
    return Promise.resolve({ shared: false, downloaded: true, name: out.name, pages: out.pages });
  }

  return { render: render, png: png, pdf: pdf, share: share, download: download,
    brandReady: brandReady, preload: preload, ready: ready, measure: needed,
    scale: function () { return K; } };
})();
