/* Photo intake — downscale large photos so the sheet stays fast and printable.
   SVG artwork is stored as-is (it is already small and scales cleanly). */
window.QS = window.QS || {};

QS.photos = (function () {
  var MAX_EDGE = 1600;
  var JPEG_Q = 0.82;

  function uid() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Could not decode image')); };
      img.src = src;
    });
  }

  /* Returns a photo record ready for the store. */
  async function ingest(file, quoteId) {
    if (!file || !/^image\//.test(file.type)) {
      throw new Error('Not an image: ' + (file && file.name));
    }

    var name = file.name || 'photo';
    var isSvg = /svg/i.test(file.type);

    if (isSvg) {
      var svgUrl = await readAsDataURL(file);
      return {
        id: uid(),
        quoteId: quoteId,
        name: name,
        caption: '',
        dataUrl: svgUrl,
        w: 0,
        h: 0
      };
    }

    var src = await readAsDataURL(file);
    var img = await loadImage(src);
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    var outW = Math.max(1, Math.round(w * scale));
    var outH = Math.max(1, Math.round(h * scale));

    var keepPng = /png/i.test(file.type) && file.size < 900 * 1024 && scale === 1;
    var type = keepPng ? 'image/png' : 'image/jpeg';

    var canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    var ctx = canvas.getContext('2d');
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.drawImage(img, 0, 0, outW, outH);
    var dataUrl = canvas.toDataURL(type, JPEG_Q);

    return {
      id: uid(),
      quoteId: quoteId,
      name: name,
      caption: '',
      dataUrl: dataUrl,
      w: outW,
      h: outH
    };
  }

  /* Files dropped, picked or pasted -> stored photo records. */
  async function ingestMany(fileList, quoteId) {
    var out = [];
    var errors = [];
    var files = Array.prototype.slice.call(fileList || []);
    for (var i = 0; i < files.length; i++) {
      try {
        var rec = await ingest(files[i], quoteId);
        await QS.store.putPhoto(rec);
        out.push(rec);
      } catch (e) {
        errors.push((files[i] && files[i].name) + ': ' + e.message);
      }
    }
    return { added: out, errors: errors };
  }

  return { ingest: ingest, ingestMany: ingestMany };
})();
