/* Turns a quote into a picture or a PDF you can text or email.
   Drawn by hand on a canvas: no libraries, no network, works offline. */
window.QS = window.QS || {};

QS.exportDoc = (function () {
  var W = 1240;            /* A4 at 150dpi */
  var H = 1754;
  var M = 84;              /* margin */
  var CW = W - M * 2;
  var FOOT = 76;
  var INK = '#0a0a0a';
  var MID = '#454545';
  var MUTED = '#8a8a8a';
  var LINE = '#dcdcdc';
  var YELLOW = '#ffd60a';
  var FONT = 'Helvetica, Arial, system-ui, sans-serif';

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

  function doc() { return { pages: [], ctx: null, y: 0 }; }

  function page(d) {
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    d.pages.push(c);
    d.ctx = ctx;
    /* continuation pages start below the running header, so nothing collides
       with it */
    d.y = d.pages.length > 1 ? M + 48 : M;
  }

  function room(d, h) {
    if (d.y + h > H - M - FOOT) { page(d); return true; }
    return false;
  }

  function header(d, q) {
    var ctx = d.ctx;
    var j = q.job || {};
    font(ctx, '700', 54);
    ctx.fillStyle = INK;
    ctx.fillText('QUOTE', M, d.y + 44);
    var w = ctx.measureText('QUOTE').width;
    ctx.fillStyle = YELLOW;
    ctx.fillRect(M, d.y + 60, w, 7);

    ctx.textAlign = 'right';
    font(ctx, '700', 25);
    ctx.fillStyle = INK;
    ctx.fillText(q.number || 'un-numbered', W - M, d.y + 18);
    var ry = d.y + 48;
    font(ctx, '400', 19);
    ctx.fillStyle = MID;
    if (j.due) { ctx.fillText('Due ' + fmtDate(j.due), W - M, ry); ry += 26; }
    if (q.preparedBy) { ctx.fillText('Prepared by ' + q.preparedBy, W - M, ry); ry += 26; }
    ctx.textAlign = 'left';

    d.y += Math.max(108, ry - d.y + 8);
    ctx.fillStyle = LINE;
    ctx.fillRect(M, d.y, CW, 1.5);
    d.y += 34;
  }

  function sectionTitle(d, text) {
    var ctx = d.ctx;
    font(ctx, '700', 15);
    ctx.fillStyle = MUTED;
    spaced(ctx, String(text).toUpperCase(), M, d.y + 12, 2.2);
    ctx.fillStyle = LINE;
    ctx.fillRect(M, d.y + 26, CW, 1.5);
    d.y += 46;
  }

  function row(d, label, value, hex, badge) {
    var ctx = d.ctx;
    var right = W - M;
    var text = value || '';

    font(ctx, '400', 20);
    ctx.fillStyle = MID;
    ctx.fillText(label, M, d.y + 21);

    if (badge && text) {
      font(ctx, '700', 17);
      var bw = ctx.measureText(text).width + 26;
      ctx.fillStyle = YELLOW;
      ctx.fillRect(right - bw, d.y + 3, bw, 30);
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.fillText(text, right - 13, d.y + 24);
      ctx.textAlign = 'left';
    } else if (/^#[0-9a-f]{6}$/i.test(hex || '')) {
      ctx.fillStyle = hex;
      ctx.fillRect(right - 24, d.y + 5, 22, 22);
      ctx.strokeStyle = '#c2c2c2';
      ctx.lineWidth = 1;
      ctx.strokeRect(right - 24.5, d.y + 4.5, 23, 23);
      font(ctx, '600', 20);
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.fillText(text || hex, right - 34, d.y + 22);
      ctx.textAlign = 'left';
    } else {
      font(ctx, '600', 20);
      ctx.fillStyle = text ? INK : MUTED;
      ctx.textAlign = 'right';
      ctx.fillText(text || '—', right, d.y + 22);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = LINE;
    ctx.fillRect(M, d.y + 38, CW, 1);
    d.y += 46;
  }

  function specBlock(d, title, rows) {
    rows = rows.filter(function (r) { return r && (r.value || r.hex); });
    if (!rows.length) return;
    room(d, 60 + rows.length * 46);
    sectionTitle(d, title);
    rows.forEach(function (r) {
      room(d, 46);
      row(d, r.label, r.value, r.hex, r.badge);
    });
    d.y += 16;
  }

  function piece(d, q) {
    var j = q.job || {};
    specBlock(d, 'The piece', [
      { label: 'Jockey name', value: j.jockey },
      { label: 'Due date', value: fmtDate(j.due) },
      { label: 'Rush job', value: j.rush ? 'RUSH JOB' : '', badge: true }
    ]);
  }

  function paintSpec(d, q) {
    var p = QS.fillPaint(q.paint);

    specBlock(d, 'Hat', [
      { label: 'Front panel', value: p.hat.frontName || p.hat.front, hex: p.hat.front },
      { label: 'Left side', value: p.hat.leftName || p.hat.left, hex: p.hat.left },
      { label: 'Right side', value: p.hat.rightName || p.hat.right, hex: p.hat.right },
      { label: 'Back panel', value: p.hat.backName || p.hat.back, hex: p.hat.back },
      { label: 'Bill', value: p.hat.billName || p.hat.bill, hex: p.hat.bill }
    ]);

    specBlock(d, 'Jockey', [
      { label: 'Eyes', value: p.figure.eyesName || p.figure.eyes, hex: p.figure.eyes },
      { label: 'Hair', value: p.figure.hairName || p.figure.hair, hex: p.figure.hair },
      { label: 'Body', value: p.figure.bodyName || p.figure.body, hex: p.figure.body },
      { label: 'Sleeves', value: p.figure.sleevesName || p.figure.sleeves, hex: p.figure.sleeves },
      { label: 'Cuffs', value: p.figure.cuffsName || p.figure.cuffs, hex: p.figure.cuffs },
      { label: 'Buttons', value: p.figure.buttonsName || p.figure.buttons, hex: p.figure.buttons },
      { label: 'Pants', value: p.figure.pantsName || p.figure.pants, hex: p.figure.pants },
      { label: 'Boots', value: p.figure.bootsName || p.figure.boots, hex: p.figure.boots },
      { label: 'Boot cuffs', value: p.figure.bootCuffsName || p.figure.bootCuffs, hex: p.figure.bootCuffs },
      { label: 'Chest logo', value: (p.chestLogo || p.chestText) ? (p.chestText || 'Yes') : '' },
      { label: 'Back artwork', value: (p.backArt || p.backText) ? (p.backText || 'Yes') : '' }
    ]);

    specBlock(d, 'Platform & base', [
      { label: 'Platform', value: p.base.platformName || p.base.platform, hex: p.base.platform },
      { label: 'Base', value: p.base.baseName || p.base.base, hex: p.base.base },
      { label: 'Base front text', value: p.base.frontText },
      { label: 'Base back text', value: p.base.backText }
    ]);

    specBlock(d, 'Custom request', [
      { label: 'Method', value: p.method },
      { label: 'Asked for', value: p.custom }
    ]);

    var r = QS.fillRestore(q.restore);
    if (QS.hasRestore(q)) {
      specBlock(d, 'Restoration', [
        { label: 'Piece', value: r.concrete ? 'Concrete' : 'Not concrete' },
        { label: 'Work needed', value: r.work && r.work !== 'None' ? r.work : '' },
        { label: 'Strip old paint', value: r.strip ? QS.money(QS.RESTORE_STRIP) : '' },
        { label: 'Resurface with cement', value: r.resurface ? QS.money(QS.RESTORE_SURFACE) : '' },
        { label: 'Notes', value: r.note }
      ]);
    }
  }

  function line(d, label, value) {
    room(d, 48);
    var ctx = d.ctx;
    font(ctx, '400', 21);
    ctx.fillStyle = MID;
    ctx.fillText(label, M, d.y + 22);
    font(ctx, '600', 21);
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText(value, W - M, d.y + 22);
    ctx.textAlign = 'left';
    ctx.fillStyle = LINE;
    ctx.fillRect(M, d.y + 38, CW, 1);
    d.y += 46;
  }

  function pricing(d, q) {
    var t = QS.totals(q);
    var p = QS.fillPricing(q.pricing);
    var rows = 3 + (t.decalCount ? 1 : 0) +
      (t.restoreStrip ? 1 : 0) + (t.restoreSurface ? 1 : 0);
    room(d, 70 + rows * 46);
    sectionTitle(d, 'Pricing');
    line(d, 'Paint job' + (t.paintLabel ? ' \u2014 ' + t.paintLabel : ''), QS.money(t.paint));
    if (t.decalCount) {
      line(d, 'Decals \u00d7' + t.decalCount + (p.decalWhere ? ' (' + p.decalWhere + ')' : ''),
        QS.money(t.decals));
    }
    line(d, 'Delivery', t.delivery ? QS.money(t.delivery) : '\u2014');
    if (t.restoreStrip) line(d, 'Strip old paint', QS.money(t.restoreStrip));
    if (t.restoreSurface) line(d, 'Resurface with cement', QS.money(t.restoreSurface));
    d.y += 14;
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

    var h = 44 + rows.length * 44;
    room(d, h + 20);
    var ctx = d.ctx;
    var top = d.y;
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(M, top, CW, h);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(M, top, 7, h);

    var y = top + 34;
    rows.forEach(function (r) {
      var big = r[2];
      font(ctx, big ? '700' : '400', big ? 26 : 20);
      ctx.fillStyle = big ? INK : MID;
      ctx.fillText(r[0], M + 30, y);
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.fillText(r[1], W - M - 26, y);
      ctx.textAlign = 'left';
      y += 44;
    });

    d.y = top + h + 30;
  }

  function notes(d, q) {
    if (!q.notes) return;
    var ctx = d.ctx;
    font(ctx, '400', 20);
    var lines = wrap(ctx, q.notes, CW);
    room(d, 60 + Math.min(lines.length, 8) * 30);
    sectionTitle(d, 'Notes');
    lines.forEach(function (ln) {
      room(d, 30);
      font(d.ctx, '400', 20);
      d.ctx.fillStyle = MID;
      d.ctx.fillText(ln, M, d.y + 18);
      d.y += 30;
    });
    d.y += 16;
  }

  function followUp(d, q) {
    if (!q.log || !q.log.length) return;
    var ctx = d.ctx;
    room(d, 90);
    sectionTitle(d, 'Follow-up');
    q.log.forEach(function (e) {
      room(d, 32);
      var dt = new Date(e.ts);
      var stamp = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      font(d.ctx, '400', 18);
      d.ctx.fillStyle = MUTED;
      d.ctx.fillText(stamp, M, d.y + 16);
      d.ctx.fillStyle = MID;
      var txt = wrap(d.ctx, e.text || '', CW - 130);
      d.ctx.fillText(txt[0] || '', M + 120, d.y + 16);
      d.y += 30;
    });
    d.y += 16;
  }

  function footers(d, q) {
    var n = d.pages.length;
    d.pages.forEach(function (c, i) {
      var ctx = c.getContext('2d');

      /* continuation pages carry a slim running header, so a page printed on
         its own still says what it is and whose it is */
      if (i > 0) {
        font(ctx, '700', 17);
        ctx.fillStyle = MUTED;
        spaced(ctx, 'QUOTE', M, 74, 2.2);
        font(ctx, '400', 16);
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'right';
        ctx.fillText((q.number || 'Quote') +
          (q.job && q.job.jockey ? ' \u00b7 ' + q.job.jockey : '') +
          ' \u00b7 continued', W - M, 74);
        ctx.textAlign = 'left';
        ctx.fillStyle = YELLOW;
        ctx.fillRect(M, 86, 46, 3);
        ctx.fillStyle = LINE;
        ctx.fillRect(M + 54, 87, CW - 54, 1.5);
      }

      var y = H - 52;
      ctx.fillStyle = LINE;
      ctx.fillRect(M, y - 26, CW, 1);
      font(ctx, '400', 16);
      ctx.fillStyle = MUTED;
      ctx.textAlign = 'left';
      ctx.fillText((q.number || 'Quote') + ' \u00b7 ' + (q.job && q.job.jockey ? q.job.jockey : ''), M, y);
      ctx.textAlign = 'right';
      ctx.fillText('Page ' + (i + 1) + ' of ' + n, W - M, y);
      ctx.textAlign = 'left';
    });
  }

  function render(q) {
    var d = doc();
    page(d);
    header(d, q);
    piece(d, q);
    paintSpec(d, q);
    pricing(d, q);
    totals(d, q);
    notes(d, q);
    followUp(d, q);
    footers(d, q);
    return d.pages;
  }

  /* ---------- files ---------- */

  function slug(q) {
    var n = String(q.number || 'quote').replace(/[^a-z0-9\-_]+/gi, '-').replace(/^-+|-+$/g, '');
    return n || 'quote';
  }

  /* one tall picture if the quote runs over a page */
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

  function png(q) {
    var pages = render(q);
    var canvas = stitch(pages);
    var bytes = dataUrlBytes(canvas.toDataURL('image/png'));
    return { blob: new Blob([bytes], { type: 'image/png' }), name: slug(q) + '.png', pages: pages.length };
  }

  function pdf(q) {
    var pages = render(q);
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
     download where it does not. Built synchronously so the tap still counts
     as the gesture the share sheet requires. */
  function share(kind, q) {
    var out = kind === 'pdf' ? pdf(q) : png(q);
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

  return { render: render, png: png, pdf: pdf, share: share, download: download };
})();
