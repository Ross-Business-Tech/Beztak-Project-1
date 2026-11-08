/*
 * Draws a deck (from slides.js) as HTML: one 1280 x 720 box per slide,
 * every shape placed absolutely, so it matches the PowerPoint file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.QAD = root.QAD || {}; root.QAD.renderHtml = factory(); }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const PX = 96; // pixels per inch
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  const px = function (inches) { return (inches * PX).toFixed(2) + 'px'; };
  const ptPx = function (pt) { return (pt * PX / 72).toFixed(2) + 'px'; };

  // Font stacks: the first choice is what PowerPoint will use; the rest keep the preview close on any computer.
  function stack(font) {
    if (font === 'Calibri') return "Calibri,Carlito,'Segoe UI',Helvetica,Arial,sans-serif";
    return font + ',Helvetica,sans-serif';
  }

  function shape(it) {
    const box = 'left:' + px(it.x) + ';top:' + px(it.y) + ';width:' + px(it.w) + ';height:' + px(it.h) + ';';
    if (it.t === 'rect') {
      return '<div class="sh" style="' + box + 'background:#' + it.fill + ';border-radius:' + px(it.radius || 0) +
        (it.line ? ';border:' + ptPx(it.lineWidth || 1) + ' solid #' + it.line + ';box-sizing:border-box' : '') + '"></div>';
    }
    if (it.t === 'oval') {
      return '<div class="sh" style="' + box + 'border-radius:50%;box-sizing:border-box;background:' + (it.fill ? '#' + it.fill : 'none') +
        (it.line ? ';border:' + ptPx(it.lineWidth || 1) + ' solid #' + it.line : '') + '"></div>';
    }
    if (it.t === 'line') {
      const w = Math.abs(it.x2 - it.x1);
      const h = Math.abs(it.y2 - it.y1);
      const pad = 6;
      const left = Math.min(it.x1, it.x2) * PX - pad;
      const top = Math.min(it.y1, it.y2) * PX - pad;
      return '<svg class="sh" style="left:' + left + 'px;top:' + top + 'px;width:' + (w * PX + 2 * pad) + 'px;height:' + (h * PX + 2 * pad) + 'px;overflow:visible" aria-hidden="true">' +
        '<line x1="' + (it.x1 * PX - left) + '" y1="' + (it.y1 * PX - top) + '" x2="' + (it.x2 * PX - left) + '" y2="' + (it.y2 * PX - top) +
        '" stroke="#' + it.color + '" stroke-width="' + (it.width * PX / 72) + '"' + (it.dash ? ' stroke-dasharray="' + (it.width * PX / 72 * 3) + ' ' + (it.width * PX / 72 * 2.2) + '"' : '') + ' stroke-linecap="butt"/></svg>';
    }
    if (it.t === 'text') {
      const just = it.valign === 'middle' ? 'center' : it.valign === 'bottom' ? 'flex-end' : 'flex-start';
      const runs = it.runs || [{ text: it.text }];
      const inner = runs.map(function (r) {
        const size = r.size || it.size;
        const bold = r.bold != null ? r.bold : it.bold;
        const color = r.color || it.color;
        return '<span style="font-size:' + ptPx(size) + ';font-weight:' + (bold ? 700 : 400) + ';color:#' + color + (it.italic ? ';font-style:italic' : '') + '">' + esc(r.text) + '</span>';
      }).join('');
      return '<div class="tx" style="' + box + 'justify-content:' + just + ';font-family:' + stack(it.font) + '"><div style="text-align:' + it.align + '">' + inner + '</div></div>';
    }
    if (it.t === 'table') return table(it);
    if (it.t === 'hex') {
      const w = it.w * PX; const h = it.h * PX; const k = Math.min(w, h) * 0.25;
      const pts = [[k, 0], [w - k, 0], [w, h / 2], [w - k, h], [k, h], [0, h / 2]].map(function (p) { return p.join(','); }).join(' ');
      return '<svg class="sh" style="' + box + 'overflow:visible" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><polygon points="' + pts + '" fill="' + (it.fill ? '#' + it.fill : 'none') + '"' +
        (it.line ? ' stroke="#' + it.line + '" stroke-width="' + ((it.lineWidth || 1) * PX / 72) + '" stroke-linejoin="miter"' : '') + '/></svg>';
    }
    if (it.t === 'ring') {
      const sw = it.thick * PX / 72;
      const cx = (it.w * PX) / 2; const cy = (it.h * PX) / 2; const r = (Math.min(it.w, it.h) * PX - sw) / 2;
      const pct = Math.max(0, Math.min(100, it.pct || 0));
      let arc = '';
      if (pct >= 99.95) arc = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#' + it.color + '" stroke-width="' + sw + '"/>';
      else if (pct > 0) {
        const a = (pct * 3.6 - 90) * Math.PI / 180;
        arc = '<path d="M ' + cx + ' ' + (cy - r) + ' A ' + r + ' ' + r + ' 0 ' + (pct > 50 ? 1 : 0) + ' 1 ' + (cx + r * Math.cos(a)) + ' ' + (cy + r * Math.sin(a)) + '" fill="none" stroke="#' + it.color + '" stroke-width="' + sw + '"/>';
      }
      return '<svg class="sh" style="' + box + 'overflow:visible" viewBox="0 0 ' + it.w * PX + ' ' + it.h * PX + '" aria-hidden="true"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#' + it.track + '" stroke-width="' + sw + '"/>' + arc + '</svg>';
    }
    return '';
  }

  function spans(runs, base) {
    return runs.map(function (r) {
      const f = r.font || base.font;
      return '<span style="font-size:' + ptPx(r.size || base.size) + ';font-weight:' + ((r.bold != null ? r.bold : base.bold) ? 700 : 400) + ';color:#' + (r.color || base.color) +
        ((r.italic != null ? r.italic : base.italic) ? ';font-style:italic' : '') + ';font-family:' + stack(f) + '">' + esc(r.text) + (r.br ? '\n' : '') + '</span>';
    }).join('');
  }

  function table(it) {
    const rows = it.rows.map(function (row, ri) {
      return '<tr style="height:' + px(it.rowH[ri]) + '">' + row.map(function (c) {
        const base = { size: c.size || 12, bold: c.bold, italic: c.italic, color: c.color || '1B2A24', font: c.font || 'Calibri' };
        const bd = c.border && c.border[2] && c.border[2].type !== 'none' ? 'border-bottom:' + ((c.border[2].pt || 1) * 96 / 72).toFixed(2) + 'px solid #' + c.border[2].color + ';' : '';
        return '<td style="' + bd + 'background:#' + (c.fill || 'FFFFFF') + ';text-align:' + (c.align || 'left') + ';padding:0 ' + px(0.09) + ';vertical-align:middle;overflow:hidden;white-space:pre-wrap;line-height:1.15;font-family:' + stack(base.font) + '">' +
          spans(c.runs || [{ text: c.text }], base) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table class="sh" style="left:' + px(it.x) + ';top:' + px(it.y) + ';width:' + px(it.w) + ';table-layout:fixed;border-collapse:collapse;border-spacing:0"><colgroup>' +
      it.colW.map(function (w) { return '<col style="width:' + px(w) + '">'; }).join('') + '</colgroup>' + rows + '</table>';
  }

  function slideHtml(slide, index) {
    return '<section class="slide" data-n="' + (index + 1) + '"' + (slide.hidden ? ' data-hidden="1"' : '') + ' style="background:#' + slide.bg + '">' + slide.items.map(shape).join('') + '</section>';
  }

  function toHtml(deck) { return deck.slides.map(slideHtml).join(''); }

  return { toHtml: toHtml, slideHtml: slideHtml, PX: PX, W: 13.333 * PX, H: 7.5 * PX };
});
