/*
 * Turns a briefing (from briefing.js) into slides.
 *
 * A slide is a plain list of shapes placed on a 13.333 x 7.5 inch page:
 *   { t:'text', x, y, w, h, text | runs, size, bold, italic, color, font, align, valign }
 *   { t:'rect', x, y, w, h, fill, line, radius }
 *   { t:'oval', x, y, w, h, fill, line }
 *   { t:'hex',  x, y, w, h, fill, line }                 (hexagon)
 *   { t:'ring', x, y, w, h, thick, track, color, pct }   (gauge: a ring filled to pct %)
 *   { t:'line', x1, y1, x2, y2, color, width, dash }
 *   { t:'table', x, y, w, colW, rowH, rows:[[cell]] }    (a real, editable PowerPoint table)
 * Both the on-screen preview and the PowerPoint file are drawn from this same list,
 * so what you see is what gets emailed.
 *
 * Look: corporate and high-contrast. Blue leads, charcoal and greys carry the structure, white
 * space does the rest. Green and red appear only inside charts (gaps in red, gains in green).
 * Every content slide has a numbered tab (matching the agenda), a headline that states the
 * takeaway, and a "for discussion" line so the slide can run a meeting.
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
  const GREEN = '1F9D55';     // charts only: gains
  const RED = 'D64545';       // charts only: gaps

  // ---------- number words ----------

  const n0 = function (n) { return Math.round(n || 0).toLocaleString('en-US'); };
  const pct0 = function (n) { return n == null ? '—' : Math.round(n) + '%'; };
  const pts = function (n) {
    const r = Math.round(Math.abs(n) * 10) / 10;
    return (r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)) + (r === 1 ? ' point' : ' points');
  };
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

  // ---------- drawing helpers ----------

  function Slide(bg, hidden) { this.bg = bg || 'FFFFFF'; this.items = []; this.notes = ''; this.hidden = !!hidden; }
  Slide.prototype.text = function (o) { this.items.push(Object.assign({ t: 'text', font: SANS, size: 16, color: CHAR, align: 'left', valign: 'top' }, o)); return this; };
  Slide.prototype.rect = function (o) { this.items.push(Object.assign({ t: 'rect' }, o)); return this; };
  Slide.prototype.oval = function (o) { this.items.push(Object.assign({ t: 'oval' }, o)); return this; };
  Slide.prototype.hex = function (o) { this.items.push(Object.assign({ t: 'hex' }, o)); return this; };
  Slide.prototype.ring = function (o) { this.items.push(Object.assign({ t: 'ring', track: GREY_LINE }, o)); return this; };
  Slide.prototype.table = function (o) { this.items.push(Object.assign({ t: 'table' }, o)); return this; };
  Slide.prototype.line = function (o) { this.items.push(Object.assign({ t: 'line', color: GREY_LINE, width: 1 }, o)); return this; };

  // The numbered tab and the headline. The tab number matches the agenda.
  function header(s, tab, title, blue) {
    s.rect({ x: 0, y: 0.5, w: 0.85, h: 0.85, fill: blue });
    s.text({ x: 0, y: 0.5, w: 0.85, h: 0.85, text: tab, size: 28, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    s.rect({ x: 0, y: 1.35, w: 0.22, h: 0.22, fill: CHAR });
    const size = title.length <= 44 ? 32 : title.length <= 58 ? 28 : 24;
    s.text({ x: 1.2, y: 0.4, w: W - 1.2 - M, h: 1.05, text: title, size: size, bold: true, valign: 'middle' });
  }
  // The line that runs the meeting.
  function discuss(s, text, blue, label) {
    s.rect({ x: 0, y: 6.4, w: W, h: 0.6, fill: CHAR });
    s.rect({ x: 0, y: 6.4, w: 0.2, h: 0.6, fill: blue });
    s.text({ x: M, y: 6.4, w: 1.9, h: 0.6, text: label || 'FOR DISCUSSION', size: 13, bold: true, color: tint(blue, 0.5), valign: 'middle' });
    s.text({ x: 2.7, y: 6.4, w: W - 2.7 - M, h: 0.6, text: text, size: 18, color: 'FFFFFF', valign: 'middle' });
  }
  // The dark line at the foot of a slide: a takeaway, a next step or a question, as the deck chooses.
  function band(s, o, fallback, blue) {
    const bd = o && o.band;
    discuss(s, (bd && bd.text) || fallback, blue, (bd && bd.label) || 'FOR DISCUSSION');
  }
  const tabOf = function (o, d) { return (o && o.tab) || d; };
  function footer(s, b, n, total, o) {
    const dark = o && o.dark;
    const col = dark ? 'AEB5BF' : GREY_MID;
    s.text({ x: M, y: 7.1, w: 9, h: 0.28, text: b.cfg.org + '   ·   Operating manual briefing   ·   ' + b.range.label, size: 11, color: col });
    s.text({ x: W - M - 2, y: 7.1, w: 2, h: 0.28, text: (o && o.label) || n + ' / ' + total, size: 11, color: col, align: 'right' });
  }

  // ---------- headline sentences ----------

  function verdict(b) {
    const m = b.range.name;
    if (b.b.total === 0) return 'No questions were recorded in ' + m + '.';
    const base = 'The bot answered ' + pct0(b.b.rate) + ' of questions in ' + m;
    if (b.vsGoal >= 0) return base + ', ' + (b.vsGoal < 0.5 ? 'right on' : 'above') + ' the ' + b.goal + '% goal.';
    return base + ', ' + pts(b.vsGoal) + ' short of the ' + b.goal + '% goal.';
  }
  function trendTitle(b) {
    const s = b.series;
    if (s.length < 2) return 'Not enough history yet to show a trend';
    const change = Math.round(s[s.length - 1].rate) - Math.round(s[0].rate);
    const months = s.length - 1;
    const span = months + (months === 1 ? ' month' : ' months');
    if (change >= 1) return 'Answer rate is up ' + pts(change) + ' in ' + span;
    if (change <= -1) return 'Answer rate is down ' + pts(change) + ' in ' + span;
    return 'Answer rate has held steady for ' + span;
  }
  function nextMonthName(b) {
    return new Date(b.range.end).toLocaleDateString('en-US', { month: 'long' });
  }

  // ---------- 1. cover ----------

  function cover(b, blue, o) {
    const s = new Slide(CHAR);
    // A cluster of hexagons holds the headline number.
    const hh = 4.0; const hw = hh * 1.1547;
    const hx = 8.3; const hy = 1.75;
    s.hex({ x: hx + 2.6, y: hy - 1.25, w: 1.3, h: 1.13, line: tint(blue, 0.2), lineWidth: 2.5 });
    s.hex({ x: hx - 1.15, y: hy + 3.35, w: 1.5, h: 1.3, fill: '3A4047' });
    s.hex({ x: hx + 3.1, y: hy + 3.7, w: 0.9, h: 0.78, fill: tint(blue, 0.35) });
    s.hex({ x: hx, y: hy, w: hw, h: hh, fill: blue });
    s.text({ x: hx, y: hy + 0.75, w: hw, h: 2.0, runs: [{ text: String(Math.round(b.b.rate || 0)), size: 100, bold: true, color: 'FFFFFF' }, { text: '%', size: 44, bold: true, color: 'FFFFFF' }], align: 'center', valign: 'middle' });
    s.text({ x: hx, y: hy + 2.65, w: hw, h: 0.5, text: 'answered by the bot', size: 18, color: 'FFFFFF', align: 'center' });
    s.rect({ x: 0, y: 2.0, w: 0.3, h: 1.9, fill: blue });
    s.text({ x: M, y: 1.7, w: 7, h: 0.4, text: ((o && o.eyebrow) || 'OPERATING MANUAL BRIEFING'), size: 16, bold: true, color: tint(blue, 0.5) });
    s.text({ x: M, y: 2.15, w: 7.4, h: 1.7, text: b.range.label, size: 62, bold: true, color: 'FFFFFF', valign: 'middle' });
    s.text({ x: M, y: 4.0, w: 7, h: 0.45, text: b.cfg.org, size: 22, color: 'C9CFD6' });
    s.text({ x: M, y: 4.75, w: 6.9, h: 1.3, text: verdict(b), size: 22, color: 'FFFFFF' });
    s.text({ x: M, y: 6.75, w: 7.5, h: 0.32, text: ((o && o.prepared) || 'Prepared for the Executive Board') + (b.cfg.preparedBy ? '   ·   ' + b.cfg.preparedBy : ''), size: 13, color: 'AEB5BF' });
    s.notes = 'Cover. One sentence that sums up the month: ' + verdict(b);
    if (o && o.coverNote) s.notes += ' ' + o.coverNote;
    return s;
  }

  // ---------- 2. agenda ----------

  function agenda(b, blue, n, total) {
    const s = new Slide('FFFFFF');
    const lw = 4.6;
    s.rect({ x: 0, y: 0, w: lw, h: H, fill: CHAR });
    s.rect({ x: lw, y: 0, w: 0.16, h: H, fill: blue });
    s.text({ x: M, y: 0.9, w: lw - 1.2, h: 0.4, text: b.range.label.toUpperCase(), size: 15, bold: true, color: tint(blue, 0.5) });
    s.text({ x: M, y: 1.4, w: lw - 1.0, h: 1.2, text: 'Agenda', size: 54, bold: true, color: 'FFFFFF', valign: 'middle' });
    s.text({ x: M, y: 3.0, w: lw - 1.3, h: 2.2, text: 'Results first, then the choices. Each slide ends with one question to settle in the room.', size: 19, color: 'C9CFD6' });
    s.hex({ x: M, y: 5.5, w: 0.9, h: 0.78, fill: blue });
    s.hex({ x: M + 1.05, y: 5.85, w: 0.6, h: 0.52, line: tint(blue, 0.3), lineWidth: 2 });
    const items = [
      ['Where we stand', 'Are we on track for the goal?'],
      ['The trend', 'What is moving the number?'],
      ['Why people reach a person', 'How much can the manual fix?'],
      ['What to change', 'Which changes do we back?'],
      ['Return on updates', 'Is the effort paying off?'],
      ['Decisions for today', 'What do we agree before we leave?']
    ];
    const rx = lw + 0.9;
    items.forEach(function (it, i) {
      const y = 0.85 + i * 1.0;
      const last = i === items.length - 1;
      s.rect({ x: rx, y: y, w: 0.7, h: 0.7, fill: last ? CHAR : blue });
      s.text({ x: rx, y: y, w: 0.7, h: 0.7, text: String(i + 1), size: 26, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
      s.text({ x: rx + 1.0, y: y - 0.02, w: 6.5, h: 0.42, text: it[0], size: 24, bold: true });
      s.text({ x: rx + 1.0, y: y + 0.4, w: 6.5, h: 0.32, text: it[1], size: 16, color: GREY });
      if (!last) s.line({ x1: rx + 1.0, y1: y + 0.86, x2: W - M, y2: y + 0.86, color: GREY_LINE });
    });
    s.text({ x: W - M - 2, y: 7.1, w: 2, h: 0.28, text: n + ' / ' + total, size: 11, color: GREY_MID, align: 'right' });
    s.notes = 'Agenda. The numbers on the following slides match the numbers here. The last item is where the room makes its decisions.';
    return s;
  }

  // ---------- 3. where we stand ----------

  function standing(b, blue, n, total, o) {
    const s = new Slide('FFFFFF');
    const bb = b.b;
    const title = bb.rate == null ? 'No questions recorded this month'
      : pct0(bb.rate) + ' answered by the bot, ' + (b.vsGoal >= 0 ? 'goal of ' + b.goal + '% met' : pts(b.vsGoal) + ' short of the ' + b.goal + '% goal');
    header(s, tabOf(o, '1'), title, blue);
    // Gauge
    const d = 4.0; const gx = M + 0.1; const gy = 1.95; const thick = 34;
    s.ring({ x: gx, y: gy, w: d, h: d, thick: thick, color: blue, pct: bb.rate || 0 });
    s.text({ x: gx, y: gy + 1.15, w: d, h: 1.1, text: pct0(bb.rate), size: 66, bold: true, align: 'center', valign: 'middle' });
    s.text({ x: gx, y: gy + 2.3, w: d, h: 0.4, text: 'answered by the bot', size: 17, color: GREY, align: 'center' });
    // Goal tick on the ring
    const ang = (Math.min(100, b.goal) * 3.6 - 90) * Math.PI / 180;
    const cx = gx + d / 2; const cy = gy + d / 2;
    const rOut = d / 2 + 0.12; const rIn = d / 2 - thick / 72 - 0.12;
    s.line({ x1: cx + rIn * Math.cos(ang), y1: cy + rIn * Math.sin(ang), x2: cx + rOut * Math.cos(ang), y2: cy + rOut * Math.sin(ang), color: CHAR, width: 3.5 });
    const lx = cx + (rOut + 0.5) * Math.cos(ang); const ly = cy + (rOut + 0.28) * Math.sin(ang);
    s.text({ x: lx - 0.7, y: ly - 0.16, w: 1.4, h: 0.32, text: 'Goal ' + b.goal + '%', size: 14, bold: true, align: 'center' });
    // Facts
    const rx = 6.2; const rw = W - M - rx;
    const facts = [
      { n: n0(bb.total), l: 'questions asked', c: CHAR },
      { n: n0(bb.answered), l: 'answered from the manual', c: blue },
      { n: n0(bb.tickets), l: 'sent to a person', c: CHAR }
    ];
    facts.forEach(function (f, i) {
      const y = 1.75 + i * 1.15;
      s.line({ x1: rx, y1: y, x2: rx + rw, y2: y, color: i === 0 ? CHAR : GREY_LINE, width: i === 0 ? 2.5 : 1 });
      s.text({ x: rx, y: y + 0.08, w: 2.5, h: 1.0, text: f.n, size: 54, bold: true, color: f.c, valign: 'middle' });
      s.text({ x: rx + 2.6, y: y + 0.08, w: rw - 2.6, h: 1.0, text: f.l, size: 20, color: GREY, valign: 'middle' });
    });
    s.line({ x1: rx, y1: 1.75 + 3 * 1.15, x2: rx + rw, y2: 1.75 + 3 * 1.15, color: GREY_LINE });
    const chips = [];
    if (b.delta != null) chips.push((b.delta >= 0.05 ? '▲ ' : b.delta <= -0.05 ? '▼ ' : '● ') + (Math.abs(b.delta) >= 0.05 ? pts(b.delta) + (b.delta > 0 ? ' up on ' : ' down on ') : 'Level with ') + b.prevRange.name);
    chips.push(b.vsGoal >= 0 ? 'Goal met by ' + pts(b.vsGoal) : n0(b.needForGoal) + ' more answers needed to reach the goal');
    s.text({ x: rx, y: 5.3, w: rw, h: 0.9, text: chips.join('\n'), size: 18, bold: true, color: CHAR, valign: 'middle' });
    band(s, o, b.vsGoal >= 0 ? 'Do we raise the ' + b.goal + '% goal?' : 'Is ' + b.goal + '% still the right goal, and by when?', blue);
    footer(s, b, n, total);
    s.notes = 'Answer rate = questions answered from the manual ÷ all questions asked in ' + b.range.label + '. ' +
      'Questions that go to a person are counted against the bot even when they are sent there by policy.' + (b.pb ? ' ' + b.prevRange.label + ' was ' + pct0(b.pb.rate) + '.' : '');
    return s;
  }

  // ---------- 4. the trend ----------

  function trend(b, blue, n, total, o) {
    const s = new Slide('FFFFFF');
    header(s, tabOf(o, '2'), trendTitle(b), blue);
    const data = b.series;
    if (data.length < 2) {
      s.text({ x: M, y: 2.3, w: W - 2 * M, h: 3.0, text: 'A trend line needs at least two full months of data. Add earlier months to the questions file to see it.', size: 26, color: GREY, valign: 'middle' });
      band(s, o, 'Can we export earlier months so the next briefing shows a trend?', blue);
      footer(s, b, n, total);
      s.notes = 'Not enough months in the data to draw a trend.';
      return s;
    }
    const cx = M + 0.8; const cy = 2.5; const cw = W - 2 * M - 0.95; const ch = 3.1;
    const rates = data.map(function (d) { return d.rate; }).concat([b.goal]);
    let lo = Math.floor((Math.min.apply(null, rates) - 6) / 10) * 10;
    let hi = Math.ceil((Math.max.apply(null, rates) + 6) / 10) * 10;
    lo = Math.max(0, lo); hi = Math.min(100, Math.max(hi, lo + 20));
    const Y = function (v) { return cy + ch - ((v - lo) / (hi - lo)) * ch; };
    const X = function (i) { return cx + (cw * (i + 0.5)) / data.length; };
    for (let v = lo; v <= hi; v += 10) {
      s.line({ x1: cx, y1: Y(v), x2: cx + cw, y2: Y(v), color: v === lo ? GREY_MID : GREY_LINE, width: 1 });
      s.text({ x: cx - 0.8, y: Y(v) - 0.16, w: 0.65, h: 0.32, text: v + '%', size: 13, color: GREY, align: 'right', valign: 'middle' });
    }
    // Manual updates
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
      s.text({ x: X(i) - 1.0, y: 1.72, w: 2.0, h: 0.72, text: 'MANUAL UPDATE\n' + shown.join('\n'), size: 12, bold: false, color: darken(blue, 0.2), align: 'center', valign: 'bottom' });
      const labelAbove = !(Math.abs(Y(b.goal) - (Y(d.rate) - 0.4)) < 0.28);
      s.line({ x1: X(i), y1: 2.46, x2: X(i), y2: Y(d.rate) - (labelAbove ? 0.66 : 0.28), color: GREY_MID, width: 1.25, dash: true });
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
      s.text({ x: X(i) - 0.7, y: cy + ch + 0.12, w: 1.4, h: 0.32, text: d.label, size: 15, bold: last, color: last ? CHAR : GREY, align: 'center' });
    });
    const first = data[0];
    const rising = data[data.length - 1].rate - first.rate >= 1;
    band(s, o, rising ? 'Which of these updates should we repeat?' : 'What changed, and what do we do about it?', blue);
    footer(s, b, n, total);
    s.notes = 'Monthly answer rate for the last ' + data.length + ' full months. Labels above the chart mark months in which a section was added to the manual. ' +
      'Months with no data or only a partial month of data are left out.';
    return s;
  }

  // ---------- 5. why people reach a person ----------

  function reasons(b, blue, n, total, o) {
    const s = new Slide('FFFFFF');
    const tk = b.b.tickets;
    header(s, tabOf(o, '3'), tk ? Math.round(b.fixablePct) + '% of tickets could be avoided by changing the manual' : 'Nothing went to a person this month', blue);
    const d = 3.7; const gx = M + 0.2; const gy = 1.9;
    s.ring({ x: gx, y: gy, w: d, h: d, thick: 30, color: RED, pct: b.fixablePct });
    s.text({ x: gx, y: gy + 1.0, w: d, h: 1.0, text: tk ? Math.round(b.fixablePct) + '%' : '0', size: 60, bold: true, align: 'center', valign: 'middle' });
    s.text({ x: gx + 0.5, y: gy + 2.0, w: d - 1.0, h: 0.9, text: 'of tickets are fixable', size: 17, color: GREY, align: 'center' });
    s.text({ x: gx - 0.2, y: gy + d + 0.2, w: d + 0.4, h: 0.55, text: n0(b.fixableTickets) + ' of ' + n0(tk) + ' tickets in ' + b.range.name, size: 15, bold: true, align: 'center' });
    const rx = 5.2; const rw = W - M - rx;
    const max = Math.max.apply(null, b.reasons.map(function (r) { return r.count; }).concat([1]));
    b.reasons.forEach(function (r, i) {
      const y = 1.75 + i * 1.12;
      const col = r.fixable ? RED : GREY_MID;
      s.line({ x1: rx, y1: y, x2: rx + rw, y2: y, color: i === 0 ? CHAR : GREY_LINE, width: i === 0 ? 2.5 : 1 });
      s.text({ x: rx, y: y + 0.08, w: rw - 1.9, h: 0.38, text: r.label, size: 20, bold: true, color: r.fixable ? CHAR : GREY });
      s.text({ x: rx, y: y + 0.46, w: rw - 1.9, h: 0.3, text: r.help, size: 14, color: GREY });
      s.text({ x: rx + rw - 1.8, y: y + 0.06, w: 1.8, h: 0.62, text: n0(r.count), size: 34, bold: true, color: r.fixable ? CHAR : GREY, align: 'right', valign: 'middle' });
      s.text({ x: rx + rw - 1.8, y: y + 0.66, w: 1.8, h: 0.28, text: Math.round(r.pctOfTickets) + '% of tickets', size: 13, color: GREY, align: 'right' });
      s.rect({ x: rx, y: y + 0.84, w: rw - 1.9, h: 0.14, fill: GREY_LINE });
      if (r.count) s.rect({ x: rx, y: y + 0.84, w: Math.max(0.07, ((rw - 1.9) * r.count) / max), h: 0.14, fill: col });
    });
    band(s, o, 'Do we accept that policy and out-of-scope tickets stay with people?', blue);
    footer(s, b, n, total);
    s.notes = 'Every ticket has one reason. "Nothing in the manual" and "section did not settle it" (red) can be fixed by editing the manual. ' +
      'Policy and out-of-scope questions (grey) are meant to reach a person.';
    return s;
  }

  // ---------- 6. what to change ----------

  function fixes(b, blue, n, total, o) {
    const s = new Slide('FFFFFF');
    const list = b.fixes;
    if (!list.length) {
      header(s, tabOf(o, '4'), 'No urgent changes to the manual this month', blue);
      s.text({ x: M, y: 2.2, w: 10.5, h: 3.2, text: 'No topic reached three tickets in the month. Topics appear here as soon as three or more questions on the same subject go to a person.', size: 26, color: GREY, valign: 'middle' });
      band(s, o, 'Is there any change to the manual we want to make anyway?', blue);
      footer(s, b, n, total);
      s.notes = 'No fix reached the minimum of three tickets in the month.';
      return s;
    }
    header(s, tabOf(o, '4'), (list.length === 3 ? 'Three' : String(list.length)) + ' changes lift the answer rate from ' + pct0(b.b.rate) + ' to about ' + pct0(b.projectedRate), blue);
    const rowH = 1.4; const y0 = 1.75;
    list.forEach(function (f, i) {
      const y = y0 + i * rowH;
      s.line({ x1: M, y1: y, x2: W - M, y2: y, color: i === 0 ? CHAR : GREY_LINE, width: i === 0 ? 2.5 : 1 });
      s.hex({ x: M, y: y + 0.27, w: 1.04, h: 0.9, fill: i % 2 ? CHAR : blue });
      s.text({ x: M, y: y + 0.27, w: 1.04, h: 0.9, text: String(i + 1), size: 30, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
      s.text({ x: 2.1, y: y + 0.14, w: 6.9, h: 0.5, text: clip(f.theme, 42), size: 24, bold: true });
      s.text({ x: 2.1, y: y + 0.66, w: 6.9, h: 0.3, text: (f.kind === 'add' ? 'ADD A SECTION' : 'IMPROVE A SECTION') + (f.rising ? '   ·   RISING' : ''), size: 13, bold: true, color: darken(blue, 0.15) });
      s.text({ x: 2.1, y: y + 0.96, w: 6.9, h: 0.32, text: '“' + clip(f.example, 58) + '”', size: 15, italic: true, color: GREY });
      s.text({ x: 9.2, y: y + 0.12, w: 3.38, h: 0.85, text: '+' + n0(f.more), size: 52, bold: true, color: blue, align: 'right', valign: 'middle' });
      s.text({ x: 9.2, y: y + 0.95, w: 3.38, h: 0.32, text: 'more answered a month', size: 15, color: GREY, align: 'right' });
    });
    s.line({ x1: M, y1: y0 + list.length * rowH, x2: W - M, y2: y0 + list.length * rowH, color: GREY_LINE });
    band(s, o, 'Do we back these ' + (list.length === 1 ? 'change' : list.length + ' changes') + ', and who owns each?', blue);
    footer(s, b, n, total);
    s.notes = 'Estimate, not a promise: each fix is assumed to let the bot answer ' + Math.round(b.fixFactor.factor * 100) + '% of the repeat questions on its topic' +
      (b.fixFactor.fromHistory ? ' (the average of ' + b.fixFactor.n + ' of our own past updates)' : ' (a typical figure; there is not enough history yet)') +
      '. Together they would answer about ' + n0(b.moreFromFixes) + ' more questions a month, about ' + hrs((b.moreFromFixes * b.cfg.minutesPerTicket) / 60) + ' staff hours at ' + b.cfg.minutesPerTicket + ' minutes of a person\'s time per ticket.';
    return s;
  }

  // ---------- 7. return on updates ----------

  function roi(b, blue, n, total, o) {
    const s = new Slide('FFFFFF');
    const r = b.roi;
    if (!r.count) {
      header(s, tabOf(o, '5'), 'No manual updates are being tracked yet', blue);
      s.text({ x: M, y: 2.2, w: 10.5, h: 3.2, text: 'Once a section is published, next month\'s briefing will show how many questions it answered, how many tickets it removed and how much staff time it saved.', size: 26, color: GREY, valign: 'middle' });
      band(s, o, 'Which change do we publish first?', blue);
      footer(s, b, n, total);
      s.notes = 'No sections were published during the period covered by the data.';
      return s;
    }
    header(s, tabOf(o, '5'), 'Manual updates have saved about ' + hrs(r.hoursSince) + ' staff hours', blue);
    const lw = 4.4;
    s.text({ x: M, y: 1.7, w: lw, h: 1.5, runs: [{ text: hrs(r.hoursSince), size: 88, bold: true, color: blue }, { text: '  hours', size: 26, color: GREY }], valign: 'middle' });
    s.text({ x: M, y: 3.15, w: lw, h: 0.35, text: 'of staff time saved', size: 18, color: GREY });
    s.line({ x1: M, y1: 3.75, x2: M + lw, y2: 3.75, color: GREY_LINE });
    s.text({ x: M, y: 3.85, w: 1.7, h: 0.75, text: n0(r.answersSince), size: 40, bold: true, valign: 'middle' });
    s.text({ x: M + 1.8, y: 3.85, w: lw - 1.8, h: 0.75, text: 'questions answered by updates', size: 16, color: GREY, valign: 'middle' });
    s.text({ x: M, y: 4.75, w: 1.7, h: 0.75, text: n0(r.fewerPerMonth), size: 40, bold: true, valign: 'middle' });
    s.text({ x: M + 1.8, y: 4.75, w: lw - 1.8, h: 0.75, text: 'fewer tickets a month on those topics', size: 16, color: GREY, valign: 'middle' });
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
    band(s, o, 'Is this return enough to keep investing in the manual?', blue);
    footer(s, b, n, total);
    s.notes = 'For each published update: questions on its topics that the bot answered since publishing, and tickets a week in the four weeks before publishing compared with the weeks since. ' +
      'Staff hours = answered questions × ' + b.cfg.minutesPerTicket + ' minutes ÷ 60; ' + n0(r.answersThisMonth) + ' of the answers came in ' + b.range.name + '. "Fewer tickets a month" converts the weekly drop at 52 ÷ 12 weeks per month. ' +
      'These are estimates; some of the change may come from other causes.';
    return s;
  }

  // ---------- 8. decisions ----------

  function decisions(b, blue, n, total, o) {
    const hasTracker = !!(o && o.hasTracker);
    const s = new Slide('FFFFFF');
    const target = Math.max(b.projectedRate || 0, b.b.rate || 0);
    const nm = nextMonthName(b);
    header(s, tabOf(o, '6'), (o && o.title) || 'Decisions for today', blue);
    const d = 3.5; const gx = M + 0.2; const gy = 1.8;
    s.ring({ x: gx, y: gy, w: d, h: d, thick: 28, color: blue, pct: target });
    s.text({ x: gx, y: gy + 0.85, w: d, h: 1.0, text: pct0(target), size: 58, bold: true, align: 'center', valign: 'middle' });
    s.text({ x: gx + 0.4, y: gy + 1.85, w: d - 0.8, h: 0.7, text: nm + ' target', size: 17, color: GREY, align: 'center' });
    s.text({ x: gx - 0.2, y: gy + d + 0.15, w: d + 0.4, h: 0.4, text: 'Today ' + pct0(b.b.rate) + '   ·   Goal ' + b.goal + '%', size: 15, bold: true, align: 'center' });
    const rx = 5.2; const rw = W - M - rx;
    const names = b.fixes.map(function (f) { return clip(f.theme, 34); }).join('  ·  ');
    const dec = [
      ['Back the changes to the manual', names || 'No changes proposed this month'],
      ['Give each one an owner and a date', hasTracker ? ((o && o.trackerRef) || 'Use the working table in the appendix') : 'Agree owners in the room'],
      ['Confirm the ' + nm + ' target', 'Aim for ' + pct0(target) + (b.moreFromFixes ? ', about ' + n0(b.moreFromFixes) + ' more answers a month' : '') + '; the goal stays at ' + b.goal + '%']
    ];
    dec.forEach(function (it, i) {
      const y = 1.8 + i * 1.2;
      s.rect({ x: rx, y: y, w: 0.7, h: 0.7, fill: i === 1 ? CHAR : blue });
      s.text({ x: rx, y: y, w: 0.7, h: 0.7, text: String(i + 1), size: 26, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
      s.text({ x: rx + 0.95, y: y - 0.04, w: rw - 0.95, h: 0.45, text: it[0], size: 24, bold: true });
      s.text({ x: rx + 0.95, y: y + 0.42, w: rw - 0.95, h: 0.62, text: it[1], size: 16, color: GREY });
      s.line({ x1: rx, y1: y + 1.08, x2: W - M, y2: y + 1.08, color: GREY_LINE });
    });
    if (String(b.cfg.note || '').trim()) {
      s.rect({ x: rx, y: 5.5, w: rw, h: 1.3, fill: GREY_BG });
      s.rect({ x: rx, y: 5.5, w: 0.1, h: 1.3, fill: blue });
      s.text({ x: rx + 0.3, y: 5.5, w: rw - 0.5, h: 1.3, text: clip(b.cfg.note, 240), size: 15, italic: true, valign: 'middle' });
    }
    footer(s, b, n, total);
    s.notes = 'The three decisions that close the meeting. The target is the projected answer rate if the listed changes are made, an estimate based on how well past updates worked. ' +
      (hasTracker ? ((o && o.trackerNote) || 'The hidden appendix has a working table for recording each decision, owner and due date. ') : '') + 'A personal note can be added in the Briefing Maker and appears on this slide.';
    return s;
  }

  // ---------- appendix (hidden slides) ----------
  //
  // Hidden slides stay out of the presentation but travel with the file. They hold the detail:
  // the questions behind each category that needs work, and a table the team fills in.

  const KIND_LABEL = { add: 'NOTHING IN THE MANUAL', clarify: 'SECTION DID NOT SETTLE IT' };

  function categorySlide(b, blue, c, idx, count, label) {
    const s = new Slide('FFFFFF', true);
    header(s, 'A' + (idx + 1), c.name + ': ' + n0(c.fixable) + ' tickets the manual could answer', blue);
    const d = 3.1; const gx = M + 0.2; const gy = 1.85;
    s.ring({ x: gx, y: gy, w: d, h: d, thick: 26, color: blue, pct: c.rate || 0 });
    s.text({ x: gx, y: gy + 0.75, w: d, h: 0.9, text: pct0(c.rate), size: 52, bold: true, align: 'center', valign: 'middle' });
    s.text({ x: gx + 0.3, y: gy + 1.65, w: d - 0.6, h: 0.6, text: 'answered here\n(overall ' + pct0(b.b.rate) + ')', size: 15, color: GREY, align: 'center' });
    const gain = c.themes.reduce(function (a, t) { return a + Math.max(1, Math.round(t.tickets * b.fixFactor.factor)); }, 0);
    s.text({ x: M, y: 5.2, w: 4.1, h: 1.0, runs: [{ text: 'Fixing ' + (c.themes.length === 1 ? 'this topic' : 'these ' + c.themes.length + ' topics') + ' could answer about ', size: 16, color: GREY }, { text: n0(gain) + ' more questions a month', size: 16, bold: true, color: CHAR }, { text: '.', size: 16, color: GREY }], valign: 'top' });
    const rx = 5.1; const rw = W - M - rx;
    s.text({ x: rx, y: 1.65, w: rw, h: 0.3, text: 'THE TOP QUESTIONS PEOPLE ASKED', size: 12, bold: true, color: GREY });
    c.themes.forEach(function (t, i) {
      const y = 2.05 + i * 0.95;
      s.line({ x1: rx, y1: y, x2: rx + rw, y2: y, color: i === 0 ? CHAR : GREY_LINE, width: i === 0 ? 2 : 1 });
      s.hex({ x: rx, y: y + 0.12, w: 0.8, h: 0.69, fill: i % 2 ? CHAR : blue });
      s.text({ x: rx, y: y + 0.12, w: 0.8, h: 0.69, text: n0(t.tickets), size: 22, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
      s.text({ x: rx + 1.0, y: y + 0.08, w: rw - 1.0, h: 0.38, text: '“' + clip(t.examples[0] || t.theme, 48) + '”', size: 18, bold: true });
      s.text({ x: rx + 1.0, y: y + 0.5, w: rw - 1.0, h: 0.3, text: (KIND_LABEL[t.kind] || '') + (t.note ? '   ·   Staff told them: ' + clip(t.note, 34) : ''), size: 12, color: GREY });
    });
    footer(s, b, 0, 0, { label: label });
    s.notes = 'Hidden appendix slide. Category: ' + c.name + '. Lists the topics in this category where the bot had nothing to answer from, or the section it found did not settle the question, most-asked first. ' +
      '"Staff told them" is how a person resolved the most recent ticket on that topic, a starting point for new manual wording. Topics already fixed by a new section are left out. ' +
      'To show this slide when presenting, choose Slide Show > Hide Slide again.';
    return s;
  }

  function trackerRows(b) {
    const rows = b.fixesTracker.map(function (f) {
      return { kind: f.kind === 'add' ? 'ADD A SECTION' : 'IMPROVE A SECTION', title: f.theme, ctx: n0(f.tickets) + ' tickets now  ·  +' + n0(f.more) + ' answered a month', quote: f.example };
    });
    b.review.forEach(function (r) {
      rows.push({ kind: 'REVIEW A SECTION', title: r.title, ctx: r.flag === 'unused' ? 'Never used this month' : Math.round(r.unclearRate) + '% of uses did not settle the question (' + r.cited + ' uses)', quote: '' });
    });
    return rows.slice(0, 12);
  }

  // The working table. Hidden (in the appendix) or visible (a main slide in the plan deck).
  function trackerPages(b) { return Math.ceil(trackerRows(b).length / 6); }

  function trackerSlides(b, blue, o) {
    const rows = trackerRows(b);
    if (!rows.length) return [];
    const hidden = !!(o && o.hidden);
    const per = 6;
    const pages = Math.ceil(rows.length / per);
    const out = [];
    const colW = [0.55, 2.7, 3.0, 1.55, 1.35, 0.95, 1.73];
    const border = function (c) { return [{ type: 'none' }, { type: 'none' }, { type: 'solid', pt: 0.75, color: c || GREY_LINE }, { type: 'none' }]; };
    for (let p = 0; p < pages; p++) {
      const hid = hidden || p >= ((o && o.visiblePages) || pages);
      const s = new Slide('FFFFFF', hid);
      const title = (hid ? 'Working plan' : 'Action plan') + ': decide, assign, track' + (pages > 1 ? ' (' + (p + 1) + ' of ' + pages + ')' : '');
      header(s, hid ? 'A' : String(o.tab + p), title, blue);
      s.text({ x: M, y: 1.62, w: W - 2 * M, h: 0.34, text: 'Tick a decision for each change, then name an owner and a date. This is a normal PowerPoint table, so type straight into it.', size: 14, color: GREY });
      const head = ['#', 'CHANGE', 'CONTEXT', 'DECISION', 'OWNER', 'DUE', 'STATUS'].map(function (t, i) {
        return { text: t, size: 11, bold: true, color: 'FFFFFF', fill: CHAR, align: i === 0 ? 'center' : 'left', border: border(CHAR) };
      });
      const body = rows.slice(p * per, p * per + per).map(function (r, i) {
        const fill = i % 2 ? GREY_BG : 'FFFFFF';
        return [
          { text: String(p * per + i + 1), size: 16, bold: true, color: blue, fill: fill, align: 'center', border: border() },
          { runs: [{ text: r.kind, size: 10, bold: true, color: darken(blue, 0.15), br: true }, { text: clip(r.title, 36), size: 13, bold: true, color: CHAR }], fill: fill, border: border() },
          { runs: [{ text: r.ctx, size: 11, color: CHAR, br: !!r.quote }].concat(r.quote ? [{ text: '“' + clip(r.quote, 46) + '”', size: 11, italic: true, color: GREY }] : []), fill: fill, border: border() },
          { text: '☐  Action item\n☐  Dismiss', size: 12, color: CHAR, fill: fill, border: border() },
          { text: '', size: 12, fill: fill, border: border(GREY_MID) },
          { text: '', size: 12, fill: fill, border: border(GREY_MID) },
          { text: '☐  To do\n☐  In progress\n☐  Done', size: 10.5, color: CHAR, fill: fill, border: border() }
        ];
      });
      s.table({ x: M, y: 2.1, w: W - 2 * M, colW: colW, rowH: [0.38].concat(body.map(function () { return 0.74; })), rows: [head].concat(body) });
      if (hid) footer(s, b, 0, 0, { label: '@@APPENDIX@@' });
      else footer(s, b, o.n + p, o.total);
      s.notes = (hid ? 'Hidden appendix slide: the rest of the working plan. ' : 'The action plan: the top changes first. ') + 'Every change suggested for the manual, ordered by how many tickets it would remove. ' +
        'Tick Action item or Dismiss, write an owner and a due date, and track status as work proceeds. Rows can be added or deleted like any PowerPoint table.';
      out.push(s);
    }
    return out;
  }

  // ---------- new slide: the most-asked questions (update deck) ----------

  function topQuestions(b, blue, n, total, o) {
    const s = new Slide('FFFFFF');
    const tq = b.topQuestions;
    const rows = tq.rows;
    header(s, tabOf(o, '3'), rows.length ? (rows.length === 6 ? 'Six' : String(rows.length)) + ' topics made up ' + Math.round(tq.share) + '% of all questions' : 'No questions recorded this month', blue);
    if (!rows.length) { footer(s, b, n, total); return s; }
    // Legend
    s.rect({ x: W - M - 4.6, y: 1.66, w: 0.2, h: 0.2, fill: GREEN });
    s.text({ x: W - M - 4.3, y: 1.6, w: 2.0, h: 0.32, text: 'answered by the bot', size: 14, color: GREY, valign: 'middle' });
    s.rect({ x: W - M - 2.1, y: 1.66, w: 0.2, h: 0.2, fill: RED });
    s.text({ x: W - M - 1.8, y: 1.6, w: 1.8, h: 0.32, text: 'sent to a person', size: 14, color: GREY, valign: 'middle' });
    s.text({ x: M, y: 1.6, w: 5, h: 0.32, text: 'WHAT PEOPLE ASKED ABOUT MOST', size: 12, bold: true, color: GREY, valign: 'middle' });
    const bw = 8.3; const max = Math.max.apply(null, rows.map(function (r) { return r.asked; }).concat([1]));
    rows.forEach(function (r, i) {
      const y = 2.05 + i * 0.7;
      s.line({ x1: M, y1: y, x2: W - M, y2: y, color: i === 0 ? CHAR : GREY_LINE, width: i === 0 ? 2 : 1 });
      s.text({ x: M, y: y + 0.07, w: 0.4, h: 0.5, text: String(i + 1), size: 22, bold: true, color: blue, valign: 'middle' });
      s.text({ x: M + 0.5, y: y + 0.03, w: bw, h: 0.34, text: '“' + clip(r.example, 60) + '”', size: 18, bold: true });
      const full = (bw * r.asked) / max;
      const ans = r.asked ? (full * r.answered) / r.asked : 0;
      s.rect({ x: M + 0.5, y: y + 0.4, w: full, h: 0.18, fill: RED });
      if (r.answered) s.rect({ x: M + 0.5, y: y + 0.4, w: Math.max(0.05, ans), h: 0.18, fill: GREEN });
      s.text({ x: W - M - 3.0, y: y + 0.03, w: 1.0, h: 0.6, text: n0(r.asked), size: 26, bold: true, align: 'right', valign: 'middle' });
      s.text({ x: W - M - 1.9, y: y + 0.03, w: 1.9, h: 0.6, text: 'asked  ·  ' + Math.round(r.answeredShare) + '% answered', size: 13, color: GREY, valign: 'middle' });
    });
    const gap = rows.slice().sort(function (a, z) { return z.tickets - a.tickets; })[0];
    const allGood = rows.every(function (r) { return r.tickets === 0; });
    band(s, o, allGood ? 'The topics people ask about most are all answered by the bot.' : 'Biggest gap among them: “' + clip(gap.example, 48) + '”, ' + n0(gap.tickets) + ' sent to a person.', blue);
    footer(s, b, n, total);
    s.notes = 'The topics people asked about most in ' + b.range.label + ', grouped by theme, with how many were answered by the bot (green) and how many went to a person (red). ' +
      'The six topics shown made up ' + Math.round(tq.share) + '% of all ' + n0(b.b.total) + ' questions.';
    return s;
  }

  // ---------- new slide: condensed snapshot (plan deck) ----------

  function snapshot(b, blue, n, total, o) {
    const s = new Slide('FFFFFF');
    const bb = b.b;
    header(s, tabOf(o, '1'), bb.rate == null ? 'No questions recorded this month' : pct0(bb.rate) + ' answered, ' + (b.vsGoal >= 0 ? 'goal of ' + b.goal + '% met' : pts(b.vsGoal) + ' short of the ' + b.goal + '% goal'), blue);
    const d = 3.9; const gx = M + 0.15; const gy = 1.95; const thick = 32;
    s.ring({ x: gx, y: gy, w: d, h: d, thick: thick, color: blue, pct: bb.rate || 0 });
    s.text({ x: gx, y: gy + 1.1, w: d, h: 1.1, text: pct0(bb.rate), size: 64, bold: true, align: 'center', valign: 'middle' });
    s.text({ x: gx, y: gy + 2.2, w: d, h: 0.4, text: 'answered by the bot', size: 17, color: GREY, align: 'center' });
    const ang = (Math.min(100, b.goal) * 3.6 - 90) * Math.PI / 180;
    const cx = gx + d / 2; const cy = gy + d / 2;
    const rOut = d / 2 + 0.12; const rIn = d / 2 - thick / 72 - 0.12;
    s.line({ x1: cx + rIn * Math.cos(ang), y1: cy + rIn * Math.sin(ang), x2: cx + rOut * Math.cos(ang), y2: cy + rOut * Math.sin(ang), color: CHAR, width: 3.5 });
    s.text({ x: cx + (rOut + 0.5) * Math.cos(ang) - 0.7, y: cy + (rOut + 0.28) * Math.sin(ang) - 0.16, w: 1.4, h: 0.32, text: 'Goal ' + b.goal + '%', size: 14, bold: true, align: 'center' });
    // Three things to know
    const rx = 5.9; const rw = W - M - rx;
    const dl = b.delta == null ? 'No earlier month to compare' : (b.delta >= 0.05 ? '▲ ' : b.delta <= -0.05 ? '▼ ' : '● ') + (Math.abs(b.delta) >= 0.05 ? pts(b.delta) + (b.delta > 0 ? ' up on ' : ' down on ') : 'Level with ') + b.prevRange.name;
    const items = [
      { big: n0(b.fixableTickets), cap: 'tickets a month the manual could have answered', c: blue },
      { big: b.roi.count ? hrs(b.roi.hoursSince) + ' hrs' : '–', cap: b.roi.count ? 'staff time already saved by ' + b.roi.count + ' manual update' + (b.roi.count === 1 ? '' : 's') : 'no manual updates tracked yet', c: CHAR },
      { big: b.moreFromFixes ? '+' + n0(b.moreFromFixes) : '–', cap: b.moreFromFixes ? 'more answered a month if the next changes are made' : 'no further changes suggested', c: CHAR }
    ];
    items.forEach(function (it, i) {
      const y = 1.75 + i * 1.3;
      s.line({ x1: rx, y1: y, x2: rx + rw, y2: y, color: i === 0 ? CHAR : GREY_LINE, width: i === 0 ? 2.5 : 1 });
      s.text({ x: rx, y: y + 0.1, w: 2.6, h: 1.05, text: it.big, size: 50, bold: true, color: it.c, valign: 'middle' });
      s.text({ x: rx + 2.75, y: y + 0.1, w: rw - 2.75, h: 1.05, text: it.cap, size: 18, color: GREY, valign: 'middle' });
    });
    s.line({ x1: rx, y1: 1.75 + 3 * 1.3, x2: rx + rw, y2: 1.75 + 3 * 1.3, color: GREY_LINE });
    s.text({ x: rx, y: 5.7, w: rw, h: 0.5, text: dl, size: 17, bold: true, valign: 'middle' });
    band(s, o, b.vsGoal >= 0 ? 'Hold the gain and keep closing the remaining gaps.' : 'Close the ' + pts(b.vsGoal) + ' gap by fixing the gaps in the manual.', blue);
    footer(s, b, n, total);
    s.notes = 'A one-page snapshot. Answer rate = questions answered from the manual ÷ all questions asked in ' + b.range.label + '. ' +
      'Fixable tickets are those where the manual had nothing or the section did not settle the question. Estimates assume ' + b.cfg.minutesPerTicket + ' minutes of a person\'s time per ticket.';
    return s;
  }

  // ---------- email text ----------

  function emailUpdate(b) {
    const subject = 'Operating manual update, ' + b.range.label + ': ' + pct0(b.b.rate) + ' of questions answered by the bot';
    const lines = ['Hello,', '', 'Attached is the ' + b.range.label + ' operating manual update (5 slides, a two-minute read).', '', 'The short version:', '- ' + verdict(b)];
    if (b.delta != null) lines.push('- ' + (b.delta >= 0.05 ? 'Up ' : b.delta <= -0.05 ? 'Down ' : 'Unchanged, ') + (Math.abs(b.delta) >= 0.05 ? pts(b.delta) + ' ' : '') + 'on ' + b.prevRange.name + ' (' + pct0(b.pb.rate) + ').');
    if (b.topQuestions.rows.length) lines.push('- The most-asked topic was “' + clip(b.topQuestions.rows[0].example, 70) + '” (' + n0(b.topQuestions.rows[0].asked) + ' questions).');
    if (b.roi.count) lines.push('- Manual updates have answered ' + n0(b.roi.answersSince) + ' questions, saving about ' + hrs(b.roi.hoursSince) + ' staff hours.');
    if (String(b.cfg.note || '').trim()) lines.push('', b.cfg.note.trim());
    lines.push('', 'Best regards,', b.cfg.preparedBy || b.cfg.org);
    return { subject: subject, body: lines.join('\n') };
  }

  function emailPlan(b) {
    const subject = 'Operating manual improvement plan, ' + b.range.label + ': ' + (b.fixes.length ? b.fixes.length + ' change' + (b.fixes.length === 1 ? '' : 's') + ' to reach about ' + pct0(b.projectedRate) : 'no urgent changes');
    const lines = ['Hello,', '', 'Attached is the ' + b.range.label + ' improvement plan for the operating manual.', '', 'Where we are: ' + verdict(b)];
    if (b.fixes.length) {
      lines.push('', 'Proposed changes:');
      b.fixes.forEach(function (f, i) { lines.push((i + 1) + '. ' + (f.kind === 'add' ? 'Add' : 'Improve') + ': ' + f.theme + ' (about +' + n0(f.more) + ' answered a month)'); });
      lines.push('', 'Together they would take the answer rate from ' + pct0(b.b.rate) + ' to about ' + pct0(b.projectedRate) + '.');
    }
    lines.push('', 'Please review the action plan slide, mark each change as an action item or dismiss it, and put an owner and a date against each one.');
    if (String(b.cfg.note || '').trim()) lines.push('', b.cfg.note.trim());
    lines.push('', 'Best regards,', b.cfg.preparedBy || b.cfg.org);
    return { subject: subject, body: lines.join('\n') };
  }

  // ---------- the decks ----------

  function sentence(b, kind) {
    const up = b.delta != null && b.delta >= 0.05;
    if (kind === 'goal') return b.vsGoal >= 0 ? 'We met the ' + b.goal + '% goal' + (up ? ', up ' + pts(b.delta) + ' on ' + b.prevRange.name + '.' : '.') : 'We reached ' + pct0(b.b.rate) + ', ' + pts(b.vsGoal) + ' short of the ' + b.goal + '% goal' + (up ? ', but up ' + pts(b.delta) + ' on ' + b.prevRange.name + '.' : '.');
    if (kind === 'trend') {
      const sr = b.series;
      if (sr.length < 2) return 'More months of data will show the trend.';
      const ch = Math.round(sr[sr.length - 1].rate) - Math.round(sr[0].rate);
      return (ch >= 1 ? 'Up ' + pts(ch) : ch <= -1 ? 'Down ' + pts(ch) : 'Steady') + ' since ' + sr[0].label + (ch >= 1 && b.roi.count ? ', the same stretch in which the manual updates went live.' : '.');
    }
    return b.roi.count ? 'Updates answered ' + n0(b.roi.answersSince) + ' questions and saved about ' + hrs(b.roi.hoursSince) + ' staff hours.' : 'No manual updates have been tracked yet.';
  }

  /** Deck 1: the update a client presents upward. What people ask, did we hit the goal, what changed and what it did. */
  function buildUpdate(b) {
    const blue = hex(b.cfg.brand) || '1473E6';
    const total = 5;
    const T = { label: 'TAKEAWAY' };
    const slides = [
      cover(b, blue, { eyebrow: 'OPERATING MANUAL UPDATE', prepared: 'Prepared for leadership' }),
      standing(b, blue, 2, total, { tab: '1', band: { label: T.label, text: sentence(b, 'goal') } }),
      trend(b, blue, 3, total, { tab: '2', band: { label: T.label, text: sentence(b, 'trend') } }),
      topQuestions(b, blue, 4, total, { tab: '3', band: { label: T.label } }),
      roi(b, blue, 5, total, { tab: '4', band: { label: T.label, text: sentence(b, 'roi') } })
    ];
    return { id: 'update', name: 'Executive update', w: W, h: H, font: SANS, slides: slides, visible: total, email: emailUpdate(b), fileBase: 'Board-Update-' + b.range.ym };
  }

  /** Deck 2: the condensed improvement plan. What to fix next, who does it, and by when. */
  function buildPlan(b) {
    const blue = hex(b.cfg.brand) || '1473E6';
    const total = 6; // cover, snapshot, gaps, changes, action plan, next steps
    const N = 'NEXT STEP';
    const cats = b.categories || [];
    const biggest = b.reasons.filter(function (r) { return r.fixable; }).sort(function (a, z) { return z.count - a.count; })[0];
    const trackers = trackerSlides(b, blue, { hidden: false, visiblePages: 1, tab: 4, n: 5, total: total });
    const shownTrackers = trackers.filter(function (t) { return !t.hidden; });
    const hiddenTrackers = trackers.filter(function (t) { return t.hidden; });
    const slides = [
      cover(b, blue, { eyebrow: 'IMPROVEMENT PLAN', prepared: 'Prepared for the operations team', coverNote: 'This deck is the working version: what to fix next, who owns it, and by when.' }),
      snapshot(b, blue, 2, total, { tab: '1', band: { label: N } }),
      reasons(b, blue, 3, total, { tab: '2', band: { label: N, text: biggest && biggest.count ? 'Start with “' + biggest.label.toLowerCase() + '”: ' + n0(biggest.count) + ' tickets.' : 'No fixable gaps this month.' } }),
      fixes(b, blue, 4, total, { tab: '3', band: { label: N, text: 'Give each change an owner and a date on the next slide.' } })
    ];
    shownTrackers.forEach(function (t) { slides.push(t); });
    const hasTracker = trackers.length > 0;
    slides.push(decisions(b, blue, total, total, { tab: String(hasTracker ? 5 : 4), title: 'Next steps', hasTracker: hasTracker, trackerRef: 'Use the action plan on the previous slide', trackerNote: 'The action plan slide records each decision, owner and due date. ' }));
    const visible = slides.length;
    // Hidden appendix: the rest of the action plan, then the questions behind each category.
    const appendix = hiddenTrackers.concat(cats.map(function (c, i) { return categorySlide(b, blue, c, i, cats.length, '@@APPENDIX@@'); }));
    appendix.forEach(function (sl, i) {
      sl.items.forEach(function (it) { if (it.t === 'text' && it.text === '@@APPENDIX@@') it.text = 'Appendix · ' + (i + 1) + ' of ' + appendix.length; });
      slides.push(sl);
    });
    if (appendix.length) slides[visible - 1].notes += ' The slides after this one are a hidden appendix: the top questions behind each category that needs work' + (hiddenTrackers.length ? ', and the rest of the action plan.' : '.');
    return { id: 'plan', name: 'Improvement plan', w: W, h: H, font: SANS, slides: slides, visible: visible, email: emailPlan(b), fileBase: 'Improvement-Plan-' + b.range.ym };
  }

  function build(b) { return { update: buildUpdate(b), plan: buildPlan(b) }; }

  return { build: build, buildUpdate: buildUpdate, buildPlan: buildPlan, W: W, H: H, FONT: SANS, verdict: verdict };
});
