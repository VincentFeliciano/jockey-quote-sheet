/* Builds the printable quote document (the thing you print or save as PDF). */
window.QS = window.QS || {};

QS.printDoc = (function () {
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
      chip = '<i style="display:inline-block;width:9pt;height:9pt;border:.5pt solid #999;' +
             'border-radius:1pt;margin-left:4pt;vertical-align:-1pt;background:' + esc(hex) + ';' +
             '-webkit-print-color-adjust:exact;print-color-adjust:exact"></i>';
    }
    var label = esc(name || '') || (hex ? esc(hex) : '—');
    var note = design ? '<br><em class="p-design">' + esc(design) + '</em>' : '';
    return label + chip + note;
  }

  function specRow(label, valueHtml) {
    if (!valueHtml || valueHtml === '—') return '';
    return '<div><span>' + esc(label) + '</span><span>' + valueHtml + '</span></div>';
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

    /* the piece */
    var hasJob = j.jockey || j.due || j.rush;

    if (hasJob) {
      out.push('<div class="p-cols">');
      out.push('<div class="p-col"><h2>The piece</h2><p>');
      if (j.jockey) out.push('Jockey: <b>' + esc(j.jockey) + '</b><br>');
      if (j.due) out.push('Due: <b>' + esc(j.due) + '</b><br>');
      if (j.rush) out.push('<b>RUSH JOB</b>');
      out.push('</p></div>');
      out.push('</div>');
    }

    /* statue paint spec */
    function paintBlock(title, rows) {
      var body = rows.filter(Boolean).join('');
      if (!body) return;
      out.push('<div class="p-sec"><h2>' + esc(title) + '</h2>');
      out.push('<div class="p-spec">' + body + '</div></div>');
    }

    paintBlock('Hat', [
      specRow('Front panel', swatch(p.hat.front, p.hat.frontName, p.hat.frontDesign)),
      specRow('Left side', swatch(p.hat.left, p.hat.leftName, p.hat.leftDesign)),
      specRow('Right side', swatch(p.hat.right, p.hat.rightName, p.hat.rightDesign)),
      specRow('Back panel', swatch(p.hat.back, p.hat.backName, p.hat.backDesign)),
      specRow('Bill', swatch(p.hat.bill, p.hat.billName, p.hat.billDesign))
    ]);

    paintBlock('Jockey', [
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
    ]);

    paintBlock('Platform & base', [
      specRow('Platform', swatch(p.base.platform, p.base.platformName, p.base.platformDesign)),
      specRow('Base', swatch(p.base.base, p.base.baseName, p.base.baseDesign)),
      specRow('Base front text', esc(p.base.frontText)),
      specRow('Base back text', esc(p.base.backText))
    ]);

    paintBlock('Custom request', [
      specRow('Method', esc(p.method)),
      specRow('Asked for', esc(p.custom))
    ]);

    /* restoration — only when there is something to say */
    var r = QS.fillRestore(q.restore);
    if (QS.hasRestore(q)) {
      var work = r.work && r.work !== 'None' ? esc(r.work) : '';
      paintBlock('Restoration', [
        r.concrete ? specRow('Piece', 'Concrete') : specRow('Piece', 'Not concrete'),
        specRow('Work needed', work),
        r.strip ? specRow('Strip old paint', QS.money(QS.RESTORE_STRIP)) : '',
        r.resurface ? specRow('Resurface with cement', QS.money(QS.RESTORE_SURFACE)) : '',
        specRow('Notes', nl2br(r.note))
      ]);
    }

    /* pricing: paint job, decals, delivery, restoration */
    out.push('<div class="p-sec"><h2>Pricing</h2>');
    out.push('<table class="p-items"><tbody>');
    out.push('<tr><td>Paint job' + (t.paintLabel ? ' &mdash; ' + esc(t.paintLabel) : '') +
      '</td><td class="num">' + QS.money(t.paint) + '</td></tr>');
    if (t.decalCount) {
      var pr = QS.fillPricing(q.pricing);
      var dw = pr.decalWhere ? ' (' + esc(pr.decalWhere) + ')' : '';
      out.push('<tr><td>Decals &times;' + t.decalCount + dw + '</td>' +
        '<td class="num">' + QS.money(t.decals) + '</td></tr>');
    }
    out.push('<tr><td>Delivery</td><td class="num">' +
      (t.delivery ? QS.money(t.delivery) : '&mdash;') + '</td></tr>');
    if (t.restoreStrip) {
      out.push('<tr><td>Strip old paint</td><td class="num">' +
        QS.money(t.restoreStrip) + '</td></tr>');
    }
    if (t.restoreSurface) {
      out.push('<tr><td>Resurface with cement</td><td class="num">' +
        QS.money(t.restoreSurface) + '</td></tr>');
    }
    out.push('</tbody></table></div>');

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
    out.push('</div></div>');

    /* notes */
    if (q.notes) {
      out.push('<div class="p-sec"><h2>Notes</h2><div class="p-notes">' + nl2br(q.notes) + '</div></div>');
    }

    /* follow-up log */
    if (q.log && q.log.length) {
      out.push('<div class="p-sec"><h2>Follow-up</h2><ul class="p-log">');
      q.log.forEach(function (e) {
        var d = new Date(e.ts);
        var stamp = isNaN(d) ? '' : d.toLocaleDateString();
        out.push('<li>' + esc(stamp) + ' — ' + esc(e.text) + '</li>');
      });
      out.push('</ul></div>');
    }

    /* photos */
    if (photos && photos.length) {
      out.push('<div class="p-photos"><h2>Reference photos</h2><div class="p-photo-grid">');
      photos.forEach(function (p) {
        out.push('<figure class="p-photo"><img src="' + esc(p.dataUrl) + '" alt="' + esc(p.name) + '">');
        if (p.caption) out.push('<figcaption>' + esc(p.caption) + '</figcaption>');
        out.push('</figure>');
      });
      out.push('</div></div>');
    }

    /* footer */
    out.push('<div class="p-foot"><span>' + esc(q.number || 'Quote') + '</span><span>Status: ' +
      esc(String(q.status || '').toUpperCase()) + '</span></div>');

    return out.join('');
  }

  return { build: build };
})();
