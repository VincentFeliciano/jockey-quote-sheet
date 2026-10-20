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

  function swatch(hex, name) {
    var chip = '';
    if (/^#[0-9a-f]{6}$/i.test(hex || '')) {
      chip = '<i style="display:inline-block;width:9pt;height:9pt;border:.5pt solid #999;' +
             'border-radius:1pt;margin-left:4pt;vertical-align:-1pt;background:' + esc(hex) + ';' +
             '-webkit-print-color-adjust:exact;print-color-adjust:exact"></i>';
    }
    var label = esc(name || '') || (hex ? esc(hex) : '—');
    return label + chip;
  }

  function specRow(label, valueHtml) {
    if (!valueHtml || valueHtml === '—') return '';
    return '<div><span>' + esc(label) + '</span><span>' + valueHtml + '</span></div>';
  }

  function build(q, photos) {
    var t = QS.totals(q);
    var c = q.customer || {};
    var j = q.job || {};
    var p = QS.fillPaint(q.paint);
    var out = [];

    /* header */
    out.push('<div class="p-head">');
    out.push('<div><h1>Quote</h1></div>');
    out.push('<div class="p-meta">');
    out.push('<div><b>' + esc(q.number || 'un-numbered') + '</b></div>');
    if (j.due) out.push('<div>Due ' + esc(j.due) + '</div>');
    if (q.preparedBy) out.push('<div>Prepared by ' + esc(q.preparedBy) + '</div>');
    out.push('</div></div>');

    /* customer / job */
    var hasCustomer = c.name || c.company || c.address || c.email || c.phone;
    var hasJob = j.jockey || j.size || j.due || j.rush;

    if (hasCustomer || hasJob) {
      out.push('<div class="p-cols">');

      if (hasCustomer) {
        out.push('<div class="p-col"><h2>Prepared for</h2><p>');
        if (c.name) out.push('<b>' + esc(c.name) + '</b><br>');
        if (c.company) out.push(esc(c.company) + '<br>');
        if (c.address) out.push(nl2br(c.address) + '<br>');
        if (c.email) out.push(esc(c.email) + '<br>');
        if (c.phone) out.push(esc(c.phone));
        out.push('</p></div>');
      }

      if (hasJob) {
        out.push('<div class="p-col"><h2>Job</h2><p>');
        if (j.jockey) out.push('Piece: <b>' + esc(j.jockey) + '</b><br>');
        if (j.size) out.push('Size: ' + esc(j.size) + '<br>');
        if (j.due) out.push('Due: <b>' + esc(j.due) + '</b><br>');
        if (j.rush) out.push('<b>RUSH JOB</b>');
        out.push('</p></div>');
      }

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
      specRow('Front panel', swatch(p.hat.front, p.hat.frontName)),
      specRow('Left side', swatch(p.hat.left, p.hat.leftName)),
      specRow('Right side', swatch(p.hat.right, p.hat.rightName)),
      specRow('Back panel', swatch(p.hat.back, p.hat.backName)),
      specRow('Bill', swatch(p.hat.bill, p.hat.billName))
    ]);

    paintBlock('Jockey', [
      specRow('Eyes', swatch(p.figure.eyes, p.figure.eyesName)),
      specRow('Hair', swatch(p.figure.hair, p.figure.hairName)),
      specRow('Body', swatch(p.figure.body, p.figure.bodyName)),
      specRow('Sleeves', swatch(p.figure.sleeves, p.figure.sleevesName)),
      specRow('Cuffs', swatch(p.figure.cuffs, p.figure.cuffsName)),
      specRow('Buttons', swatch(p.figure.buttons, p.figure.buttonsName)),
      specRow('Pants', swatch(p.figure.pants, p.figure.pantsName)),
      specRow('Boots', swatch(p.figure.boots, p.figure.bootsName)),
      specRow('Boot cuffs', swatch(p.figure.bootCuffs, p.figure.bootCuffsName)),
      (p.chestLogo || p.chestText)
        ? specRow('Chest logo', esc(p.chestText) || 'Yes') : '',
      (p.backArt || p.backText)
        ? specRow('Back artwork', esc(p.backText) || 'Yes') : ''
    ]);

    paintBlock('Platform & base', [
      specRow('Platform', swatch(p.base.platform, p.base.platformName)),
      specRow('Base', swatch(p.base.base, p.base.baseName)),
      specRow('Base front text', esc(p.base.frontText)),
      specRow('Base back text', esc(p.base.backText))
    ]);

    paintBlock('Custom request', [
      specRow('Method', esc(p.method)),
      specRow('Asked for', esc(p.custom))
    ]);

    /* pricing: paint job, decals, delivery */
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
    out.push('</tbody></table></div>');

    /* extras */
    if ((q.items || []).length) {
      out.push('<div class="p-sec"><h2>Extras</h2>');
      out.push('<table class="p-items"><thead><tr>');
      out.push('<th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th>');
      out.push('</tr></thead><tbody>');
      (q.items || []).forEach(function (it) {
        var amt = (Number(it.qty) || 0) * (Number(it.unit) || 0);
        out.push('<tr><td>' + esc(it.desc) + '</td>' +
          '<td class="num">' + (it.qty === '' ? '' : esc(it.qty)) + '</td>' +
          '<td class="num">' + QS.money(it.unit) + '</td>' +
          '<td class="num">' + QS.money(amt) + '</td></tr>');
      });
      out.push('</tbody></table></div>');
    }

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
