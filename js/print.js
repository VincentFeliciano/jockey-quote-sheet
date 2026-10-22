/* Builds the printable quote document (the thing you print or save as PDF).
   The markup is laid out for ONE page: the parts run in two columns, the money
   sits side by side underneath. fit() then measures the built sheet and, if a
   quote still runs long, shrinks it until it fits the page rather than spilling
   onto a second one. */
window.QS = window.QS || {};

QS.printDoc = (function () {
  /* letter at 96dpi, less the 10mm page margins the stylesheet sets */
  var PAGE_W = 740;
  var PAGE_H = 980;

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nl2br(s) {
    return esc(s).replace(/\n/g, '<br>');
  }

  function swatch(hex, name, design) {
    var chip = '';
    if (/^#[0-9a-f]{6}$/i.test(hex || '')) {
      chip = '<i class="p-chip" style="background:' + esc(hex) + '"></i>';
    }
    var label = esc(name || '') || (hex ? esc(hex) : '\u2014');
    var note = design ? '<em class="p-design">' + esc(design) + '</em>' : '';
    return label + chip + note;
  }

  function specRow(label, valueHtml) {
    if (!valueHtml || valueHtml === '\u2014') return '';
    return '<div><span>' + esc(label) + '</span><span class="p-val">' + valueHtml + '</span></div>';
  }

  function section(title, body) {
    if (!body) return '';
    return '<div class="p-sec"><h2>' + esc(title) + '</h2>' + body + '</div>';
  }

  function spec(rows) {
    var body = rows.filter(Boolean).join('');
    return body ? '<div class="p-spec">' + body + '</div>' : '';
  }

  function build(q, photos) {
    var t = QS.totals(q);
    var j = q.job || {};
    var p = QS.fillPaint(q.paint);
    var out = [];

    /* header */
    out.push('<div class="p-brand">');
    out.push('<img class="plymr" src="icons/plymr.png" alt="PLYMR">');
    out.push('<span class="p-brand-sep"></span>');
    out.push('<img class="cg" src="icons/cg.svg" alt="Crafter\u2019s Gallery">');
    out.push('<span class="p-brand-tag">Quote for Crafter\u2019s Gallery</span>');
    out.push('</div>');

    out.push('<div class="p-head">');
    out.push('<div><h1>Quote</h1></div>');
    out.push('<div class="p-meta">');
    out.push('<div><b>' + esc(q.number || 'un-numbered') + '</b></div>');
    if (j.due) out.push('<div>Due ' + esc(j.due) + '</div>');
    if (q.preparedBy) out.push('<div>Prepared by ' + esc(q.preparedBy) + '</div>');
    out.push('</div></div>');

    /* ---------- the parts, two columns ---------- */
    out.push('<div class="p-grid"><div class="p-col">');

    out.push(section('Hat', spec([
      specRow('Front panel', swatch(p.hat.front, p.hat.frontName, p.hat.frontDesign)),
      specRow('Left side', swatch(p.hat.left, p.hat.leftName, p.hat.leftDesign)),
      specRow('Right side', swatch(p.hat.right, p.hat.rightName, p.hat.rightDesign)),
      specRow('Back panel', swatch(p.hat.back, p.hat.backName, p.hat.backDesign)),
      specRow('Bill', swatch(p.hat.bill, p.hat.billName, p.hat.billDesign))
    ])));

    out.push(section('Jockey', spec([
      specRow('Eyes', swatch(p.figure.eyes, p.figure.eyesName, p.figure.eyesDesign)),
      specRow('Hair', swatch(p.figure.hair, p.figure.hairName, p.figure.hairDesign)),
      specRow('Body', swatch(p.figure.body, p.figure.bodyName, p.figure.bodyDesign)),
      specRow('Sleeves', swatch(p.figure.sleeves, p.figure.sleevesName, p.figure.sleevesDesign)),
      specRow('Cuffs', swatch(p.figure.cuffs, p.figure.cuffsName, p.figure.cuffsDesign)),
      specRow('Buttons', swatch(p.figure.buttons, p.figure.buttonsName, p.figure.buttonsDesign)),
      specRow('Pants', swatch(p.figure.pants, p.figure.pantsName, p.figure.pantsDesign)),
      specRow('Boots', swatch(p.figure.boots, p.figure.bootsName, p.figure.bootsDesign)),
      specRow('Boot cuffs', swatch(p.figure.bootCuffs, p.figure.bootCuffsName, p.figure.bootCuffsDesign)),
      (p.chestLogo || p.chestText)
        ? specRow('Chest logo', esc(p.chestText) || 'Yes') : '',
      (p.backArt || p.backText)
        ? specRow('Back artwork', esc(p.backText) || 'Yes') : ''
    ])));

    out.push('</div><div class="p-col">');

    out.push(section('The piece', spec([
      specRow('Jockey name', esc(j.jockey)),
      specRow('Due date', esc(j.due)),
      j.rush ? specRow('Rush job', '<b class="p-badge">RUSH JOB</b>') : ''
    ])));

    out.push(section('Platform &amp; base', spec([
      specRow('Platform', swatch(p.base.platform, p.base.platformName, p.base.platformDesign)),
      specRow('Base', swatch(p.base.base, p.base.baseName, p.base.baseDesign)),
      specRow('Base front text', esc(p.base.frontText)),
      specRow('Base back text', esc(p.base.backText))
    ])));

    out.push(section('Custom request', spec([
      specRow('Method', esc(p.method)),
      specRow('Asked for', esc(p.custom))
    ])));

    /* restoration — only when there is something to say */
    if (QS.hasRestore(q)) {
      var r = QS.fillRestore(q.restore);
      out.push(section('Restoration', spec([
        specRow('Piece', r.concrete ? 'Concrete' : 'Not concrete'),
        specRow('Work needed', r.work && r.work !== 'None' ? esc(r.work) : ''),
        r.strip ? specRow('Strip old paint', QS.money(QS.RESTORE_STRIP)) : '',
        r.resurface ? specRow('Resurface with cement', QS.money(QS.RESTORE_SURFACE)) : '',
        specRow('Notes', nl2br(r.note))
      ])));
    }

    out.push('</div></div>');

    /* ---------- the money, side by side ---------- */
    out.push('<div class="p-grid p-money"><div class="p-col">');

    var items = [];
    items.push('<tr><td>Paint job' + (t.paintLabel ? ' &mdash; ' + esc(t.paintLabel) : '') +
      '</td><td class="num">' + QS.money(t.paint) + '</td></tr>');
    if (t.decalCount) {
      var pr = QS.fillPricing(q.pricing);
      var dw = pr.decalWhere ? ' (' + esc(pr.decalWhere) + ')' : '';
      items.push('<tr><td>Decals &times;' + t.decalCount + dw + '</td>' +
        '<td class="num">' + QS.money(t.decals) + '</td></tr>');
    }
    items.push('<tr><td>Delivery</td><td class="num">' +
      (t.delivery ? QS.money(t.delivery) : '&mdash;') + '</td></tr>');
    if (t.restoreStrip) {
      items.push('<tr><td>Strip old paint</td><td class="num">' +
        QS.money(t.restoreStrip) + '</td></tr>');
    }
    if (t.restoreSurface) {
      items.push('<tr><td>Resurface with cement</td><td class="num">' +
        QS.money(t.restoreSurface) + '</td></tr>');
    }
    out.push(section('Pricing', '<table class="p-items"><tbody>' + items.join('') + '</tbody></table>'));

    out.push('</div><div class="p-col">');
    out.push('<div class="p-totals">');
    out.push('<div><span>Subtotal</span><span>' + QS.money(t.sub) + '</span></div>');
    if (t.disc) out.push('<div><span>Discount</span><span>-' + QS.money(t.disc) + '</span></div>');
    if (Number(q.taxRate)) {
      out.push('<div><span>Tax (' + esc(q.taxRate) + '%)</span><span>' + QS.money(t.tax) + '</span></div>');
    }
    out.push('<div class="grand"><span>Total</span><span>' + QS.money(t.total) + '</span></div>');
    if (t.deposit) {
      out.push('<div><span>Deposit paid</span><span>' + QS.money(t.deposit) + '</span></div>');
      out.push('<div class="bal"><span>Balance due</span><span>' + QS.money(t.balance) + '</span></div>');
    }
    out.push('</div>');
    out.push('</div></div>');

    /* notes */
    if (q.notes) {
      out.push(section('Notes', '<div class="p-notes">' + nl2br(q.notes) + '</div>'));
    }

    /* follow-up log — a long history is summarised, not reprinted */
    if (q.log && q.log.length) {
      var entries = q.log.slice(-8);
      var hidden = q.log.length - entries.length;
      var log = [];
      if (hidden > 0) log.push('<li class="p-more">+' + hidden + ' earlier</li>');
      entries.forEach(function (e) {
        var d = new Date(e.ts);
        var stamp = isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        log.push('<li><b>' + esc(stamp) + '</b> ' + esc(e.text) + '</li>');
      });
      out.push(section('Follow-up', '<ul class="p-log">' + log.join('') + '</ul>'));
    }

    /* photos */
    if (photos && photos.length) {
      var figs = photos.map(function (ph) {
        return '<figure class="p-photo"><img src="' + esc(ph.dataUrl) + '" alt="' + esc(ph.name) + '">' +
          (ph.caption ? '<figcaption>' + esc(ph.caption) + '</figcaption>' : '') + '</figure>';
      });
      out.push(section('Reference photos', '<div class="p-photo-grid">' + figs.join('') + '</div>'));
    }

    /* footer */
    out.push('<div class="p-foot"><span>' + esc(q.number || 'Quote') +
      (j.jockey ? ' &middot; ' + esc(j.jockey) : '') + '</span><span>' +
      esc(String(q.status || '').toUpperCase()) + '</span></div>');

    return out.join('');
  }

  /* Measure the sheet as it will print, and shrink it onto one page if it has
     grown past the page box. Returns the factor applied (1 means it already
     fitted). The stylesheet is written outside @media print for exactly this
     reason: a hidden sheet cannot be measured. */
  function fit(host) {
    var probe = document.createElement('div');
    probe.className = 'print-doc p-probe';
    probe.style.cssText = 'position:absolute;left:-10000px;top:0;width:' + PAGE_W + 'px;';
    probe.innerHTML = host.innerHTML;
    document.body.appendChild(probe);
    var h = probe.offsetHeight || probe.scrollHeight || 0;
    var w = probe.scrollWidth || 0;
    if (probe.parentNode) probe.parentNode.removeChild(probe);

    var z = h > 0 ? Math.min(1, PAGE_H / h) : 1;
    z = Math.floor(z * 1000) / 1000;
    if (z < 0.999) host.style.zoom = String(z);
    else host.style.zoom = '';
    return { height: h, width: w, zoom: z };
  }

  return { build: build, fit: fit };
})();
