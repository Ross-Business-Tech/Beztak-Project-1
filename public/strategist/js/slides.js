/*
 * Turns a briefing (from briefing.js) into the executive deck.
 *
 * A slide is a plain list of shapes placed on a 13.333 x 7.5 inch page:
 *   { t:'text', x, y, w, h, text | runs, size, bold, italic, color, font, align, valign }
 *   { t:'rect', x, y, w, h, fill, line, radius }
 *   { t:'oval', x, y, w, h, fill, line }
 *   { t:'hex',  x, y, w, h, fill, line }                 (hexagon)
 *   { t:'ring', x, y, w, h, thick, track, color, pct }   (gauge: a ring filled to pct %)
 *   { t:'line', x1, y1, x2, y2, color, width, dash }
 * Both the on-screen preview and the PowerPoint file are drawn from this same list,
 * so what you see is what gets emailed.
 *
 * The answer rate on every slide is the fair one: answered / (asked - sent to a person on purpose).
 * Look: corporate and high-contrast. Blue leads, charcoal and greys carry the structure.
 * Green and red appear only inside charts. Every content slide has a numbered tab, a headline
 * that states the takeaway, and a dark takeaway line at the foot.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.QAD = root.QAD || {}; root.QAD.slides = factory(); }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const W = 13.333;
  const H = 7.5;
  const M = 0.75; // page margin
  const SANS = 'Calibri';

  const CHAR = '22262B';      // charcoal: headlines, dark slides
  const GREY = '555D68';      // body text on white
  const GREY_MID = '9AA1AB';  // quiet marks
  const GREY_LINE = 'D9DDE2'; // hairlines and bar tracks
  const GREY_BG = 'F2F4F6';   // panels
  const GREEN = '1F9D55';     // charts only: answered
  const RED = 'D64545';       // charts only: not answered

  // ---------- number words ----------

  const n0 = function (n) { return Math.round(n || 0).toLocaleString('en-US'); };
  const pct0 = function (n) { return n == null ? '—' : Math.round(n) + '%'; };
  const hrs = function (n) {
    const r = n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
    return String(r);
  };
  const clip = function (s, max) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1).replace(/[\s,.;:]+\S*$/, '') + '…' : s;
  };
  const hex = function (c) { return String(c || '').replace('#', '').toUpperCase(); };
  function tint(c, amount) {
    const h = hex(c);
    const mix = function (i) { const v = parseInt(h.slice(i, i + 2), 16); return Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0'); };
    return (mix(0) + mix(2) + mix(4)).toUpperCase();
  }
  function darken(c, amount) {
    const h = hex(c);
    const mix = function (i) { const v = parseInt(h.slice(i, i + 2), 16); return Math.round(v * (1 - amount)).toString(16).padStart(2, '0'); };
    return (mix(0) + mix(2) + mix(4)).toUpperCase();
  }
  const rounded = function (n) { return Math.round(n); };

  // ---------- drawing helpers ----------

  function Slide(bg) { this.bg = bg || 'FFFFFF'; this.items = []; this.notes = ''; this.hidden = false; }
  Slide.prototype.text = function (o) { this.items.push(Object.assign({ t: 'text', font: SANS, size: 16, color: CHAR, align: 'left', valign: 'top' }, o)); return this; };
  Slide.prototype.rect = function (o) { this.items.push(Object.assign({ t: 'rect' }, o)); return this; };
  Slide.prototype.hex = function (o) { this.items.push(Object.assign({ t: 'hex' }, o)); return this; };
  Slide.prototype.ring = function (o) { this.items.push(Object.assign({ t: 'ring', track: GREY_LINE }, o)); return this; };
  Slide.prototype.line = function (o) { this.items.push(Object.assign({ t: 'line', color: GREY_LINE, width: 1 }, o)); return this; };

  // The numbered tab and the headline.
  function header(s, tab, title, blue) {
    s.rect({ x: 0, y: 0.5, w: 0.85, h: 0.85, fill: blue });
    s.text({ x: 0, y: 0.5, w: 0.85, h: 0.85, text: tab, size: 28, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    s.rect({ x: 0, y: 1.35, w: 0.22, h: 0.22, fill: CHAR });
    const size = title.length <= 44 ? 32 : title.length <= 58 ? 28 : 24;
    s.text({ x: 1.2, y: 0.4, w: W - 1.2 - M, h: 1.05, text: title, size: size, bold: true, valign: 'middle' });
  }
  // The dark line at the foot of a slide.
  function takeaway(s, text, blue) {
    s.rect({ x: 0, y: 6.4, w: W, h: 0.6, fill: CHAR });
    s.rect({ x: 0, y: 6.4, w: 0.2, h: 0.6, fill: blue });
    s.text({ x: M, y: 6.4, w: 1.9, h: 0.6, text: 'TAKEAWAY', size: 13, bold: true, color: tint(blue, 0.5), valign: 'middle' });
    s.text({ x: 2.7, y: 6.4, w: W - 2.7 - M, h: 0.6, text: text, size: 18, color: 'FFFFFF', valign: 'middle' });
  }
  function footer(s, b, n, total) {
    s.text({ x: M, y: 7.1, w: 9, h: 0.28, text: b.cfg.org + '   ·   Operating manual update   ·   ' + b.range.label, size: 11, color: GREY_MID });
    s.text({ x: W - M - 2, y: 7.1, w: 2, h: 0.28, text: n + ' / ' + total, size: 11, color: GREY_MID, align: 'right' });
  }
  function legend(s, x, y, items) {
    let cx = x;
    items.forEach(function (it) {
      s.rect({ x: cx, y: y + 0.06, w: 0.2, h: 0.2, fill: it.c });
      s.text({ x: cx + 0.3, y: y, w: it.w, h: 0.32, text: it.t, size: 14, color: GREY, valign: 'middle' });
      cx += 0.3 + it.w + 0.2;
    });
  }

  // ---------- headline sentences ----------

  const monthOf = function (b) { return b.range.name; };

  function verdict(b) {
    if (!b.b.total) return 'No questions were recorded in ' + monthOf(b) + '.';
    const base = 'The bot answered ' + pct0(b.rate) + ' of the questions it should cover in ' + monthOf(b);
    return base + (b.vsGoal >= 0 ? ', above the ' + b.goal + '% goal.' : ', short of the ' + b.goal + '% goal.');
  }
  function fromPrev(b) {
    if (b.prevRate == null) return '';
    const d = Math.round(b.rate) - Math.round(b.prevRate);
    return d > 0 ? 'up from ' + pct0(b.prevRate) + ' in ' + b.prevRange.name : d < 0 ? 'down from ' + pct0(b.prevRate) + ' in ' + b.prevRange.name : 'level with ' + b.prevRange.name + ' (' + pct0(b.prevRate) + ')';
  }
  function trendTitle(b) {
    const s = b.series;
    if (s.length < 2) return 'Not enough history yet to show a trend';
    const a = s[0]; const z = s[s.length - 1];
    const d = Math.round(z.rate) - Math.round(a.rate);
    if (d >= 1) return 'Up from ' + pct0(a.rate) + ' in ' + a.label + ' to ' + pct0(z.rate) + ' in ' + z.label;
    if (d <= -1) return 'Down from ' + pct0(a.rate) + ' in ' + a.label + ' to ' + pct0(z.rate) + ' in ' + z.label;
    return 'Holding steady at about ' + pct0(z.rate) + ' since ' + a.label;
  }

  // ---------- 1. cover ----------

  function cover(b, blue) {
    const s = new Slide(CHAR);
    const hh = 4.0; const hw = hh * 1.1547;
    const hx = 8.3; const hy = 1.75;
    s.hex({ x: hx + 2.6, y: hy - 1.25, w: 1.3, h: 1.13, line: tint(blue, 0.2), lineWidth: 2.5 });
    s.hex({ x: hx - 1.15, y: hy + 3.35, w: 1.5, h: 1.3, fill: '3A4047' });
    s.hex({ x: hx + 3.1, y: hy + 3.7, w: 0.9, h: 0.78, fill: tint(blue, 0.35) });
    s.hex({ x: hx, y: hy, w: hw, h: hh, fill: blue });
    s.text({ x: hx, y: hy + 0.75, w: hw, h: 2.0, runs: [{ text: String(rounded(b.rate || 0)), size: 100, bold: true, color: 'FFFFFF' }, { text: '%', size: 44, bold: true, color: 'FFFFFF' }], align: 'center', valign: 'middle' });
    s.text({ x: hx, y: hy + 2.65, w: hw, h: 0.5, text: 'answered by the bot', size: 18, color: 'FFFFFF', align: 'center' });
    s.text({ x: hx, y: hy + 3.12, w: hw, h: 0.36, text: 'Counting every question: ' + pct0(b.strictRate), size: 14, color: 'DCE9FB', align: 'center' });
    s.rect({ x: 0, y: 2.0, w: 0.3, h: 1.9, fill: blue });
    s.text({ x: M, y: 1.7, w: 7, h: 0.4, text: 'OPERATING MANUAL UPDATE', size: 16, bold: true, color: tint(blue, 0.5) });
    s.text({ x: M, y: 2.15, w: 7.4, h: 1.7, text: b.range.label, size: 62, bold: true, color: 'FFFFFF', valign: 'middle' });
    s.text({ x: M, y: 4.0, w: 7, h: 0.45, text: b.cfg.org, size: 22, color: 'C9CFD6' });
    s.text({ x: M, y: 4.75, w: 6.9, h: 1.3, text: verdict(b), size: 22, color: 'FFFFFF' });
    s.text({ x: M, y: 6.75, w: 7.5, h: 0.32, text: 'Prepared for leadership' + (b.cfg.preparedBy ? '   ·   ' + b.cfg.preparedBy : ''), size: 13, color: 'AEB5BF' });
    s.notes = 'Cover. One sentence that sums up the month: ' + verdict(b) + ' The rate leaves out ' + n0(b.byDesign) + ' questions that go to a person on purpose.';
    return s;
  }

  // ---------- 2. did we hit the goal ----------

  function goalSlide(b, blue, n, total) {
    const s = new Slide('FFFFFF');
    const bb = b.b;
    const title = bb.total === 0 ? 'No questions recorded this month'
      : pct0(b.rate) + ' answered, ' + (b.vsGoal >= 0 ? 'goal of ' + b.goal + '% met' : 'short of the ' + b.goal + '% goal');
    header(s, '1', title, blue);
    const d = 3.9; const gx = M + 0.15; const gy = 1.8; const thick = 32;
    s.ring({ x: gx, y: gy, w: d, h: d, thick: thick, color: blue, pct: b.rate || 0 });
    s.text({ x: gx, y: gy + 1.1, w: d, h: 1.1, text: pct0(b.rate), size: 64, bold: true, align: 'center', valign: 'middle' });
    s.text({ x: gx, y: gy + 2.2, w: d, h: 0.4, text: 'answered by the bot', size: 17, color: GREY, align: 'center' });
    const ang = (Math.min(100, b.goal) * 3.6 - 90) * Math.PI / 180;
    const cx = gx + d / 2; const cy = gy + d / 2;
    const rOut = d / 2 + 0.12; const rIn = d / 2 - thick / 72 - 0.12;
    s.line({ x1: cx + rIn * Math.cos(ang), y1: cy + rIn * Math.sin(ang), x2: cx + rOut * Math.cos(ang), y2: cy + rOut * Math.sin(ang), color: CHAR, width: 3.5 });
    s.text({ x: cx + (rOut + 0.5) * Math.cos(ang) - 0.7, y: cy + (rOut + 0.28) * Math.sin(ang) - 0.16, w: 1.4, h: 0.32, text: 'Goal ' + b.goal + '%', size: 14, bold: true, align: 'center' });
    const prevLine = fromPrev(b);
    s.text({ x: gx - 0.2, y: gy + d + 0.12, w: d + 0.4, h: 0.4, text: prevLine ? prevLine.charAt(0).toUpperCase() + prevLine.slice(1) : '', size: 16, bold: true, align: 'center' });

    // How the questions split: answered, not answered, and sent to a person on purpose.
    const rx = 5.9; const rw = W - M - rx;
    const notAnswered = Math.max(0, b.eligible - bb.answered);
    const parts = [
      { n: bb.answered, c: GREEN, big: n0(bb.answered), label: 'answered by the bot', sub: '' },
      { n: notAnswered, c: RED, big: n0(notAnswered), label: 'not answered: a gap in the manual', sub: '' },
      { n: b.byDesign, c: GREY_MID, big: n0(b.byDesign), label: 'go to a person on purpose, so they are left out', sub: n0(b.byDesignPolicy) + ' personal or approval questions and ' + n0(b.byDesignScope) + ' outside the manual' }
    ];
    s.text({ x: rx, y: 1.72, w: rw, h: 0.3, text: n0(bb.total) + ' QUESTIONS ASKED IN ' + monthOf(b).toUpperCase(), size: 12, bold: true, color: GREY });
    let bx = rx;
    parts.forEach(function (p) {
      const w = bb.total ? (rw * p.n) / bb.total : 0;
      if (w > 0) s.rect({ x: bx, y: 2.08, w: w, h: 0.42, fill: p.c });
      bx += w;
    });
    parts.forEach(function (p, i) {
      const y = 2.7 + i * 0.98;
      s.rect({ x: rx, y: y + 0.27, w: 0.22, h: 0.22, fill: p.c });
      s.text({ x: rx + 0.4, y: y, w: 1.4, h: 0.76, text: p.big, size: 38, bold: true, valign: 'middle' });
      s.text({ x: rx + 1.9, y: y + (p.sub ? -0.02 : 0.02), w: rw - 1.9, h: p.sub ? 0.45 : 0.72, text: p.label, size: 17, valign: p.sub ? 'bottom' : 'middle' });
      if (p.sub) s.text({ x: rx + 1.9, y: y + 0.43, w: rw - 1.9, h: 0.32, text: p.sub, size: 13, color: GREY });
      s.line({ x1: rx, y1: y + 0.86, x2: rx + rw, y2: y + 0.86 });
    });
    s.text({ x: rx, y: 5.5, w: rw, h: 0.85, text: 'How it is counted: ' + n0(bb.answered) + ' answered ÷ ' + n0(b.eligible) + ' the manual should cover (' + n0(bb.total) + ' asked − ' + n0(b.byDesign) + ' that go to a person on purpose) = ' + pct0(b.rate) + '. Counting every question against the bot, the rate would be ' + pct0(b.strictRate) + '.', size: 13, color: GREY, valign: 'middle' });
    takeaway(s, b.vsGoal >= 0
      ? 'We met the ' + b.goal + '% goal' + (fromPrev(b) ? ', ' + fromPrev(b) : '') + '.'
      : 'We reached ' + pct0(b.rate) + ', short of the ' + b.goal + '% goal by about ' + n0(b.needForGoal) + ' answers' + (fromPrev(b) ? ', ' + fromPrev(b) : '') + '.', blue);
    footer(s, b, n, total);
    s.notes = 'Answer rate = questions answered from the manual ÷ questions the manual should cover. Questions that go to a person on purpose (personal, confidential or approval questions, and topics outside operating procedures) are left out of both sides, because the bot is not meant to answer them. ' +
      'In ' + b.range.label + ' that was ' + n0(b.byDesign) + ' of ' + n0(bb.total) + '. Counting them against the bot would give ' + pct0(b.strictRate) + '.' + (b.pb ? ' ' + b.prevRange.label + ' was ' + pct0(b.prevRate) + ' on the same basis.' : '');
    return s;
  }

  // ---------- 3. the trend ----------

  function trend(b, blue, n, total) {
    const s = new Slide('FFFFFF');
    header(s, '2', trendTitle(b), blue);
    const data = b.series;
    if (data.length < 2) {
      s.text({ x: M, y: 2.3, w: W - 2 * M, h: 3.0, text: 'A trend line needs at least two full months of data. Add earlier months to the questions file to see it.', size: 26, color: GREY, valign: 'middle' });
      takeaway(s, 'More months of data will show the trend.', blue);
      footer(s, b, n, total);
      s.notes = 'Not enough months in the data to draw a trend.';
      return s;
    }
    const cx = M + 0.8; const cy = 2.5; const cw = W - 2 * M - 0.95; const ch = 2.95;
    const rates = data.map(function (d) { return d.rate; }).concat([b.goal]);
    let lo = Math.floor((Math.min.apply(null, rates) - 6) / 10) * 10;
    let hi = Math.ceil((Math.max.apply(null, rates) + 6) / 10) * 10;
    lo = Math.max(0, lo); hi = Math.min(100, Math.max(hi, lo + 20));
    const Y = function (v) { return cy + ch - ((v - lo) / (hi - lo)) * ch; };
    const X = function (i) { return cx + (cw * (i + 0.5)) / data.length; };
    s.text({ x: M, y: 1.62, w: 6, h: 0.3, text: 'SHARE ANSWERED, QUESTIONS THE MANUAL SHOULD COVER', size: 12, bold: true, color: GREY });
    for (let v = lo; v <= hi; v += 10) {
      s.line({ x1: cx, y1: Y(v), x2: cx + cw, y2: Y(v), color: v === lo ? GREY_MID : GREY_LINE, width: 1 });
      s.text({ x: cx - 0.8, y: Y(v) - 0.16, w: 0.65, h: 0.32, text: v + '%', size: 13, color: GREY, align: 'right', valign: 'middle' });
    }
    const byMonth = {};
    b.roi.updates.forEach(function (u) {
      const d = new Date(u.publishedAt);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      (byMonth[k] = byMonth[k] || []).push(u.title);
    });
    data.forEach(function (d, i) {
      const list = byMonth[d.ym];
      if (!list) return;
      const shown = list.slice(0, 2).map(function (t) { return clip(t, 24); });
      if (list.length > 2) shown.push('+ ' + (list.length - 2) + ' more');
      s.text({ x: X(i) - 1.0, y: 1.9, w: 2.0, h: 0.62, text: 'MANUAL UPDATE\n' + shown.join('\n'), size: 12, color: darken(blue, 0.2), align: 'center', valign: 'bottom' });
      const labelAbove = !(Math.abs(Y(b.goal) - (Y(d.rate) - 0.4)) < 0.28);
      s.line({ x1: X(i), y1: 2.54, x2: X(i), y2: Y(d.rate) - (labelAbove ? 0.66 : 0.28), color: GREY_MID, width: 1.25, dash: true });
    });
    s.line({ x1: cx, y1: Y(b.goal), x2: cx + cw, y2: Y(b.goal), color: CHAR, width: 2, dash: true });
    const goalAtLeft = Math.abs(data[0].rate - b.goal) >= Math.abs(data[data.length - 1].rate - b.goal);
    s.text({ x: goalAtLeft ? cx + 0.05 : cx + cw - 1.75, y: Y(b.goal) - 0.36, w: 1.7, h: 0.3, text: 'GOAL ' + b.goal + '%', size: 13, bold: true, align: goalAtLeft ? 'left' : 'right' });
    for (let i = 0; i < data.length - 1; i++) {
      s.line({ x1: X(i), y1: Y(data[i].rate), x2: X(i + 1), y2: Y(data[i + 1].rate), color: blue, width: 5 });
    }
    data.forEach(function (d, i) {
      const last = i === data.length - 1;
      const hw = last ? 0.46 : 0.32; const hh = hw * 0.866;
      s.hex({ x: X(i) - hw / 2, y: Y(d.rate) - hh / 2, w: hw, h: hh, fill: last ? blue : 'FFFFFF', line: blue, lineWidth: 3 });
      const nearGoal = Math.abs(Y(b.goal) - (Y(d.rate) - 0.4)) < 0.28;
      s.text({ x: X(i) - 0.7, y: nearGoal ? Y(d.rate) + 0.26 : Y(d.rate) - 0.66, w: 1.4, h: 0.4, text: pct0(d.rate), size: last ? 26 : 18, bold: true, color: last ? blue : CHAR, align: 'center', valign: nearGoal ? 'top' : 'bottom' });
      s.text({ x: X(i) - 0.7, y: cy + ch + 0.1, w: 1.4, h: 0.3, text: d.label, size: 15, bold: last, color: last ? CHAR : GREY, align: 'center' });
      s.text({ x: X(i) - 0.8, y: cy + ch + 0.38, w: 1.6, h: 0.26, text: n0(d.total) + ' asked', size: 12, color: GREY_MID, align: 'center' });
    });
    const a = data[0]; const z = data[data.length - 1];
    const d = Math.round(z.rate) - Math.round(a.rate);
    takeaway(s, (d >= 1 ? 'Up from ' + pct0(a.rate) + ' in ' + a.label : d <= -1 ? 'Down from ' + pct0(a.rate) + ' in ' + a.label : 'Steady since ' + a.label) +
      (d >= 1 && b.roi.count ? ', the same stretch in which the manual updates went live.' : '.'), blue);
    footer(s, b, n, total);
    s.notes = 'Monthly answer rate (answered ÷ questions the manual should cover) for the last ' + data.length + ' full months, with the number of questions asked under each month. Labels above the chart mark months in which a section was added to the manual. ' +
      'Months with no data or only a partial month of data are left out.';
    return s;
  }

  // ---------- 4. what people ask most ----------

  function topQuestions(b, blue, n, total) {
    const s = new Slide('FFFFFF');
    const tq = b.topQuestions;
    const rows = tq.rows;
    header(s, '3', rows.length ? (rows.length === 6 ? 'Six' : String(rows.length)) + ' topics made up ' + Math.round(tq.share) + '% of all questions' : 'No questions recorded this month', blue);
    if (!rows.length) { footer(s, b, n, total); return s; }
    s.text({ x: M, y: 1.6, w: 6, h: 0.32, text: 'WHAT PEOPLE ASKED ABOUT MOST, ' + tq.label.toUpperCase(), size: 12, bold: true, color: GREY, valign: 'middle' });
    legend(s, W - M - 6.3, 1.6, [{ c: GREEN, t: 'answered', w: 0.95 }, { c: RED, t: 'not answered', w: 1.2 }, { c: GREY_MID, t: 'to a person on purpose', w: 2.0 }]);
    const bw = 8.3; const max = Math.max.apply(null, rows.map(function (r) { return r.asked; }).concat([1]));
    rows.forEach(function (r, i) {
      const y = 2.05 + i * 0.7;
      s.line({ x1: M, y1: y, x2: W - M, y2: y, color: i === 0 ? CHAR : GREY_LINE, width: i === 0 ? 2 : 1 });
      s.text({ x: M, y: y + 0.07, w: 0.4, h: 0.5, text: String(i + 1), size: 22, bold: true, color: blue, valign: 'middle' });
      s.text({ x: M + 0.5, y: y + 0.03, w: bw, h: 0.34, text: '“' + clip(r.example, 60) + '”', size: 18, bold: true });
      const unit = bw * (r.asked / max) / Math.max(1, r.asked);
      s.rect({ x: M + 0.5, y: y + 0.4, w: Math.max(0.05, unit * r.asked), h: 0.18, fill: GREY_MID });
      let x = M + 0.5;
      if (r.gaps) s.rect({ x: x, y: y + 0.4, w: unit * (r.answered + r.gaps), h: 0.18, fill: RED });
      if (r.answered) s.rect({ x: x, y: y + 0.4, w: Math.max(0.05, unit * r.answered), h: 0.18, fill: GREEN });
      s.text({ x: W - M - 3.0, y: y + 0.03, w: 1.0, h: 0.6, text: n0(r.asked), size: 26, bold: true, align: 'right', valign: 'middle' });
      s.text({ x: W - M - 1.9, y: y + 0.03, w: 1.9, h: 0.6, text: r.answeredShare == null ? 'asked  ·  to a person' : 'asked  ·  ' + Math.round(r.answeredShare) + '% answered', size: 13, color: GREY, valign: 'middle' });
    });
    const gap = rows.slice().sort(function (a, z) { return z.gaps - a.gaps; })[0];
    takeaway(s, gap.gaps > 0 ? 'Biggest gap among them: “' + clip(gap.example, 48) + '”, ' + n0(gap.gaps) + ' not answered.' : 'The topics people ask about most are all answered by the bot.', blue);
    footer(s, b, n, total);
    s.notes = 'The topics people asked about most over ' + tq.label + ', grouped by theme. Green = answered by the bot, red = not answered (a gap in the manual), grey = sent to a person on purpose. ' +
      '"% answered" leaves out the questions that go to a person on purpose. The six topics shown made up ' + Math.round(tq.share) + '% of all questions in that period.';
    return s;
  }

  // ---------- 5. what we changed, and what it did ----------

  function roi(b, blue, n, total) {
    const s = new Slide('FFFFFF');
    const r = b.roi;
    if (!r.count) {
      header(s, '4', 'No manual updates are being tracked yet', blue);
      s.text({ x: M, y: 2.2, w: 10.5, h: 3.2, text: 'Once a section is published, the next update will show how many questions it answered, how many tickets it removed and how much staff time it saved.', size: 26, color: GREY, valign: 'middle' });
      takeaway(s, 'No updates have been tracked yet.', blue);
      footer(s, b, n, total);
      s.notes = 'No sections were published during the period covered by the data.';
      return s;
    }
    header(s, '4', 'Since the updates went live: about ' + hrs(r.hoursSince) + ' staff hours saved', blue);
    const lw = 4.4;
    s.text({ x: M, y: 1.7, w: lw, h: 1.5, runs: [{ text: hrs(r.hoursSince), size: 88, bold: true, color: blue }, { text: '  hours', size: 26, color: GREY }], valign: 'middle' });
    s.text({ x: M, y: 3.15, w: lw, h: 0.35, text: 'of staff time saved (estimate)', size: 18, color: GREY });
    s.line({ x1: M, y1: 3.75, x2: M + lw, y2: 3.75, color: GREY_LINE });
    s.text({ x: M, y: 3.85, w: 1.7, h: 0.75, text: n0(r.answersSince), size: 40, bold: true, valign: 'middle' });
    s.text({ x: M + 1.8, y: 3.85, w: lw - 1.8, h: 0.75, text: 'questions answered by updates', size: 16, color: GREY, valign: 'middle' });
    s.text({ x: M, y: 4.75, w: 1.7, h: 0.75, text: n0(r.fewerPerMonth), size: 40, bold: true, valign: 'middle' });
    s.text({ x: M + 1.8, y: 4.75, w: lw - 1.8, h: 0.75, text: 'fewer tickets a month on those topics (estimate)', size: 16, color: GREY, valign: 'middle' });
    s.text({ x: M, y: 5.5, w: lw, h: 0.85, text: 'Estimate. Hours = questions answered × ' + b.cfg.minutesPerTicket + ' minutes per ticket, assuming each would otherwise have become a ticket. Before and after compares the 4 weeks before each update with the weeks since. Other causes may also have played a part.', size: 11, color: GREY });
    const rx = 5.6; const rw = W - M - rx;
    s.text({ x: rx, y: 1.7, w: rw, h: 0.3, text: 'QUESTIONS ANSWERED SINCE EACH UPDATE WENT LIVE', size: 12, bold: true, color: GREY });
    const rows = r.updates.slice(0, 4);
    const max = Math.max.apply(null, rows.map(function (u) { return u.answersSince; }).concat([1]));
    const bw = rw - 1.2;
    rows.forEach(function (u, i) {
      const y = 2.15 + i * 1.03;
      const d = new Date(u.publishedAt);
      const tw = u.ticketsBeforePerWeek != null && u.ticketsAfterPerWeek != null ? '   ·   tickets a week ' + (Math.round(u.ticketsBeforePerWeek * 10) / 10) + ' → ' + (Math.round(u.ticketsAfterPerWeek * 10) / 10) : '';
      s.text({ x: rx, y: y, w: rw, h: 0.34, text: clip(u.title, 38), size: 19, bold: true });
      s.text({ x: rx, y: y + 0.34, w: rw, h: 0.28, text: 'Live since ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + tw, size: 13, color: GREY });
      s.rect({ x: rx, y: y + 0.66, w: bw, h: 0.24, fill: GREY_LINE });
      s.rect({ x: rx, y: y + 0.66, w: Math.max(0.07, (bw * u.answersSince) / max), h: 0.24, fill: GREEN });
      s.text({ x: rx + bw + 0.1, y: y + 0.58, w: 1.1, h: 0.4, text: n0(u.answersSince), size: 24, bold: true, valign: 'middle' });
    });
    takeaway(s, 'Since going live, updates answered ' + n0(r.answersSince) + ' questions: an estimated ' + hrs(r.hoursSince) + ' staff hours.', blue);
    footer(s, b, n, total);
    s.notes = 'For each published update: questions on its topics that the bot answered since publishing, and tickets a week in the four weeks before publishing compared with the weeks since. ' +
      'Staff hours = answered questions × ' + b.cfg.minutesPerTicket + ' minutes ÷ 60; ' + n0(r.answersThisMonth) + ' of the answers came in ' + b.range.label + '. "Fewer tickets a month" converts the weekly drop at 52 ÷ 12 weeks per month. ' +
      'These are estimates: they assume each answered question would otherwise have become a ticket, and some of the change may come from other causes.';
    return s;
  }

  // ---------- 6. what comes next ----------

  function next(b, blue, n, total) {
    const s = new Slide('FFFFFF');
    const list = b.fixes;
    if (!list.length) {
      header(s, '5', 'No urgent changes to the manual', blue);
      s.text({ x: M, y: 2.2, w: 10.5, h: 3.2, text: 'No topic reached three tickets over ' + b.window.label + '. New gaps will appear here as soon as they do.', size: 26, color: GREY, valign: 'middle' });
      takeaway(s, 'Nothing needs fixing right now. The manual owner keeps watching.', blue);
      footer(s, b, n, total);
      s.notes = 'No fix reached the minimum of three tickets over the ranking window.';
      return s;
    }
    header(s, '5', (list.length === 3 ? 'Three' : String(list.length)) + ' changes would lift the answer rate to about ' + pct0(b.projectedRate), blue);
    s.text({ x: M, y: 1.62, w: 9, h: 0.3, text: 'THE BIGGEST GAPS IN THE MANUAL, RANKED OVER ' + b.window.label.toUpperCase(), size: 12, bold: true, color: GREY });
    const rowH = 1.28; const y0 = 2.0;
    list.forEach(function (f, i) {
      const y = y0 + i * rowH;
      s.line({ x1: M, y1: y, x2: W - M, y2: y, color: i === 0 ? CHAR : GREY_LINE, width: i === 0 ? 2.5 : 1 });
      s.hex({ x: M, y: y + 0.22, w: 1.0, h: 0.866, fill: i % 2 ? CHAR : blue });
      s.text({ x: M, y: y + 0.22, w: 1.0, h: 0.866, text: String(i + 1), size: 30, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
      s.text({ x: 2.05, y: y + 0.1, w: 6.9, h: 0.5, text: clip(f.theme, 42), size: 24, bold: true });
      s.text({ x: 2.05, y: y + 0.6, w: 6.9, h: 0.3, text: (f.kind === 'add' ? 'ADD A SECTION' : 'IMPROVE A SECTION') + (f.rising ? '   ·   RISING' : '') + '   ·   ' + n0(f.tickets) + ' tickets', size: 13, bold: true, color: darken(blue, 0.15) });
      s.text({ x: 2.05, y: y + 0.88, w: 6.9, h: 0.32, text: '“' + clip(f.example, 58) + '”', size: 15, italic: true, color: GREY });
      s.text({ x: 9.2, y: y + 0.08, w: 3.38, h: 0.85, text: '+' + n0(f.more), size: 52, bold: true, color: blue, align: 'right', valign: 'middle' });
      s.text({ x: 9.2, y: y + 0.9, w: 3.38, h: 0.32, text: 'more answered a month (estimate)', size: 14, color: GREY, align: 'right' });
    });
    s.line({ x1: M, y1: y0 + list.length * rowH, x2: W - M, y2: y0 + list.length * rowH, color: GREY_LINE });
    s.text({ x: M, y: 5.9, w: W - 2 * M, h: 0.45, text: 'Estimates, not promises: each change is assumed to let the bot answer about ' + Math.round(b.fixFactor.factor * 100) + '% of the repeat questions on its topic (' + (b.fixFactor.fromHistory ? 'the average of ' + b.fixFactor.n + ' past updates' : 'a typical figure; there is not enough history yet') + '). Real results will vary.', size: 12, color: GREY, valign: 'middle' });
    takeaway(s, 'The manual owner is tracking owners and progress on all ' + b.changes.length + ' changes.', blue);
    footer(s, b, n, total);
    s.notes = 'Estimate, not a promise: each change is assumed to let the bot answer ' + Math.round(b.fixFactor.factor * 100) + '% of the repeat questions on its topic' +
      (b.fixFactor.fromHistory ? ' (the average of ' + b.fixFactor.n + ' of our own past updates)' : ' (a typical figure; there is not enough history yet)') +
      '. Ranking uses the last ' + b.window.months + ' month' + (b.window.months === 1 ? '' : 's') + ' (' + b.window.label + ') so one unusual month does not reorder the list. Together the top ' + list.length + ' would answer about ' + n0(b.moreFromFixes) + ' more questions a month, about ' + hrs((b.moreFromFixes * b.cfg.minutesPerTicket) / 60) + ' staff hours at ' + b.cfg.minutesPerTicket + ' minutes of a person\'s time per ticket. ' +
      'The Fix list shows every change with the questions behind it, and lets each one be assigned to an owner.';
    return s;
  }

  // ---------- email text ----------

  function email(b) {
    const subject = 'Operating manual update, ' + b.range.label + ': ' + pct0(b.rate) + ' of questions answered by the bot';
    const lines = ['Hello,', '', 'Attached is the ' + b.range.label + ' operating manual update (6 slides, a two-minute read).', '', 'The short version:', '- ' + verdict(b)];
    if (b.byDesign) lines.push('- ' + n0(b.byDesign) + ' of ' + n0(b.b.total) + ' questions go to a person on purpose (personal or approval questions, and topics outside the manual), so they are not counted either way.');
    if (b.prevRate != null) lines.push('- ' + fromPrev(b).charAt(0).toUpperCase() + fromPrev(b).slice(1) + '.');
    if (b.topQuestions.rows.length) lines.push('- The most-asked topic was “' + clip(b.topQuestions.rows[0].example, 70) + '” (' + n0(b.topQuestions.rows[0].asked) + ' questions over ' + b.topQuestions.label + ').');
    if (b.roi.count) lines.push('- Manual updates have answered ' + n0(b.roi.answersSince) + ' questions, an estimated ' + hrs(b.roi.hoursSince) + ' staff hours saved.');
    if (b.fixes.length) lines.push('- Next: ' + b.fixes.length + ' changes to the manual could lift the rate to about ' + pct0(b.projectedRate) + '.');
    if (String(b.cfg.note || '').trim()) lines.push('', b.cfg.note.trim());
    lines.push('', 'Best regards,', b.cfg.preparedBy || b.cfg.org);
    return { subject: subject, body: lines.join('\n') };
  }

  // ---------- the deck ----------

  function build(b) {
    const blue = hex(b.cfg.brand) || '1473E6';
    const total = 6;
    const slides = [
      cover(b, blue),
      goalSlide(b, blue, 2, total),
      trend(b, blue, 3, total),
      topQuestions(b, blue, 4, total),
      roi(b, blue, 5, total),
      next(b, blue, 6, total)
    ];
    return { id: 'update', name: 'Executive update', w: W, h: H, font: SANS, slides: slides, visible: total, email: email(b), fileBase: 'Board-Update-' + b.range.ym };
  }

  return { build: build, W: W, H: H, FONT: SANS, verdict: verdict };
});
