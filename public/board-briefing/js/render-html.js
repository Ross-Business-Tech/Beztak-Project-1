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
      return '<div class="tx" style="' + box + 'justify-content:' + just + ';font-family:' + it.font + ',Helvetica,sans-serif"><div style="text-align:' + it.align + '">' + inner + '</div></div>';
    }
    return '';
  }

  function slideHtml(slide, index) {
    return '<section class="slide" data-n="' + (index + 1) + '" style="background:#' + slide.bg + '">' + slide.items.map(shape).join('') + '</section>';
  }

  function toHtml(deck) { return deck.slides.map(slideHtml).join(''); }

  return { toHtml: toHtml, slideHtml: slideHtml, PX: PX, W: 13.333 * PX, H: 7.5 * PX };
});
