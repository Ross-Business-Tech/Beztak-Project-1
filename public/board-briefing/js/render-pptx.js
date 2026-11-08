/*
 * Writes a deck (from slides.js) to a PowerPoint file using PptxGenJS.
 * Every shape is a normal PowerPoint object, so the slides can be edited afterwards.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.QAD = root.QAD || {}; root.QAD.renderPptx = factory(); }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /** Returns a PptxGenJS presentation holding every slide. PptxGen is the library's constructor. */
  function toPptx(PptxGen, deck, meta) {
    const pres = new PptxGen();
    pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
    pres.title = (meta && meta.title) || 'Operating manual briefing';
    pres.author = (meta && meta.author) || '';
    pres.company = (meta && meta.company) || '';

    deck.slides.forEach(function (sd) {
      const slide = pres.addSlide();
      slide.background = { color: sd.bg };
      sd.items.forEach(function (it) {
        if (it.t === 'rect' || it.t === 'oval') {
          const o = { x: it.x, y: it.y, w: it.w, h: it.h, fill: { color: it.fill || 'FFFFFF' }, line: it.line ? { color: it.line, width: it.lineWidth || 1 } : { type: 'none' } };
          if (it.t === 'oval') slide.addShape(pres.ShapeType.ellipse, o);
          else if (it.radius) { o.rectRadius = it.radius; slide.addShape(pres.ShapeType.roundRect, o); }
          else slide.addShape(pres.ShapeType.rect, o);
          if (it.t === 'oval' && !it.fill) {
            // A ring: a white fill is the closest PowerPoint equivalent of "no fill" that prints cleanly.
          }
        } else if (it.t === 'line') {
          const x = Math.min(it.x1, it.x2);
          const y = Math.min(it.y1, it.y2);
          const goesUp = (it.x2 - it.x1) * (it.y2 - it.y1) < 0;
          slide.addShape(pres.ShapeType.line, {
            x: x, y: y, w: Math.abs(it.x2 - it.x1), h: Math.abs(it.y2 - it.y1), flipV: goesUp,
            line: { color: it.color, width: it.width, dashType: it.dash ? 'dash' : 'solid' }
          });
        } else if (it.t === 'text') {
          const base = { x: it.x, y: it.y, w: it.w, h: it.h, fontFace: it.font, fontSize: it.size, bold: !!it.bold, italic: !!it.italic, color: it.color, align: it.align, valign: it.valign, margin: 0, fit: 'none', wrap: true };
          if (it.runs) {
            slide.addText(it.runs.map(function (r) {
              return { text: r.text, options: { fontSize: r.size || it.size, bold: r.bold != null ? r.bold : !!it.bold, color: r.color || it.color, fontFace: it.font } };
            }), base);
          } else {
            slide.addText(String(it.text), base);
          }
        }
      });
      if (sd.notes) slide.addNotes(sd.notes);
    });
    return pres;
  }

  return { toPptx: toPptx };
});
