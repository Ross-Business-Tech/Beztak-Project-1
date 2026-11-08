/*
 * Turns a briefing (from briefing.js) into slides.
 *
 * A slide is a plain list of shapes placed on a 13.333 x 7.5 inch page:
 *   { t:'text', x, y, w, h, text | runs, size, bold, italic, color, font, align, valign }
 *   { t:'rect', x, y, w, h, fill, line, radius }
 *   { t:'oval', x, y, w, h, fill, line }
 *   { t:'line', x1, y1, x2, y2, color, width, dash }
 *   { t:'table', x, y, w, colW, rowH, rows:[[cell]] }   (a real, editable PowerPoint table)
 * Both the on-screen preview and the PowerPoint file are drawn from this same list,
 * so what you see is what gets emailed.
 *
 * Design: a warm paper-and-ink palette. Green means answered and improving, vermilion means
 * a gap or a ticket, saffron marks the manual updates the team made. Headlines and big numbers
 * are set in a serif (Cambria); everything else in a humanist sans (Trebuchet MS). Each slide
 * has its own composition: the story decides the layout.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.QAD = root.QAD || {}; root.QAD.slides = factory(); }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const W = 13.333;
  const H = 7.5;
  const M = 0.75; // page margin
  const SERIF = 'Cambria';
  const SANS = 'Trebuchet MS';

  const INK = '1B2A24';       // deep green-black: structure, dark slides
  const PAPER = 'F4EEE1';     // warm cream: light slides
  const PAPER2 = 'E8DFCA';    // darker cream: bar tracks
  const RULE = 'D3C8AE';      // hairlines on paper
  const STONE = '756F5F';     // secondary text on paper
  const VERMILION = 'D9481F'; // tickets, gaps, shortfall
  const SAFFRON = 'EFB02E';   // manual updates, highlights
  const SAFFRON_DEEP = 'A8700F'; // saffron text on paper
  const GOOD = '1E6B52';      // met goal, improving
  const ON_DARK = 'F4EEE1';   // text on dark
  const ON_DARK_DIM = 'AEB8AC';

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

  // ---------- drawing helpers ----------

  function Slide(bg, hidden) { this.bg = bg || PAPER; this.items = []; this.notes = ''; this.hidden = !!hidden; }
  Slide.prototype.text = function (o) { this.items.push(Object.assign({ t: 'text', font: SANS, size: 14, color: INK, align: 'left', valign: 'top' }, o)); return this; };
  Slide.prototype.rect = function (o) { this.items.push(Object.assign({ t: 'rect' }, o)); return this; };
  Slide.prototype.oval = function (o) { this.items.push(Object.assign({ t: 'oval' }, o)); return this; };
  Slide.prototype.table = function (o) { this.items.push(Object.assign({ t: 'table' }, o)); return this; };
  Slide.prototype.line = function (o) { this.items.push(Object.assign({ t: 'line', color: RULE, width: 1 }, o)); return this; };

  // Small capitalised label that names the slide's job.
  function eyebrow(s, x, y, w, text, color) {
    s.text({ x: x, y: y, w: w, h: 0.3, text: text.toUpperCase(), size: 11, bold: true, color: color });
  }
  // Serif headline; the size steps down with length so it never crowds the page.
  function headline(s, x, y, w, text, color, maxSize) {
    const n = text.length;
    let size = n <= 36 ? 34 : n <= 46 ? 30 : n <= 58 ? 26 : 23;
    if (maxSize) size = Math.min(size, maxSize);
    s.text({ x: x, y: y, w: w, h: 1.15, text: text, size: size, bold: true, font: SERIF, color: color });
  }
  function footer(s, b, n, total, o) {
    const dark = o && o.dark;
    const x0 = (o && o.x) != null ? o.x : M;
    const col = dark ? ON_DARK_DIM : STONE;
    s.text({ x: x0, y: 7.06, w: Math.min(8, W - M - 2.1 - x0), h: 0.28, text: b.cfg.org + '   ·   Operating manual briefing   ·   ' + b.range.label, size: 9.5, color: col });
    s.text({ x: W - M - 2, y: 7.06, w: 2, h: 0.28, text: (o && o.label) || n + ' / ' + total, size: 9.5, color: col, align: 'right' });
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

  // ---------- slide 1: cover (dark, with the number teased in a green column) ----------

  function cover(b, brand, total) {
    const s = new Slide(INK);
    const px = 8.75;
    s.rect({ x: px, y: 0, w: W - px, h: H, fill: brand });
    s.rect({ x: px, y: 0, w: 0.09, h: H, fill: SAFFRON });
    // The teaser
    s.text({ x: px + 0.55, y: 1.0, w: W - px - 0.8, h: 0.3, text: 'ANSWERED BY THE BOT', size: 11, bold: true, color: ON_DARK });
    s.text({ x: px + 0.45, y: 1.5, w: W - px - 0.6, h: 2.6, runs: [{ text: String(Math.round(b.b.rate || 0)), size: 150, bold: true, color: ON_DARK }, { text: '%', size: 60, bold: true, color: SAFFRON }], valign: 'middle' });
    s.line({ x1: px + 0.55, y1: 4.35, x2: px + 1.75, y2: 4.35, color: SAFFRON, width: 3 });
    s.text({ x: px + 0.55, y: 4.55, w: W - px - 1.0, h: 0.9, text: 'Goal ' + b.goal + '%', size: 22, font: SERIF, italic: true, color: ON_DARK });
    s.text({ x: px + 0.55, y: 5.05, w: W - px - 1.0, h: 0.9, text: b.delta == null ? '' : (b.delta >= 0.05 ? '▲ ' : b.delta <= -0.05 ? '▼ ' : '● ') + (Math.abs(b.delta) >= 0.05 ? pts(b.delta) + (b.delta > 0 ? ' up on ' : ' down on ') : 'Level with ') + b.prevRange.name, size: 14, color: ON_DARK });
    // Title block
    eyebrow(s, M, 1.0, 7, 'Operating manual briefing', SAFFRON);
    s.text({ x: M, y: 1.45, w: 7.7, h: 1.5, text: b.range.name, size: 84, bold: true, font: SERIF, color: ON_DARK, valign: 'middle' });
    s.text({ x: M, y: 2.95, w: 7.7, h: 1.0, text: String(b.range.start.getFullYear()), size: 54, italic: true, font: SERIF, color: SAFFRON, valign: 'middle' });
    s.text({ x: M, y: 4.1, w: 7.5, h: 0.4, text: b.cfg.org, size: 18, color: ON_DARK_DIM });
    s.text({ x: M, y: 5.0, w: 7.3, h: 1.4, text: verdict(b), size: 22, italic: true, font: SERIF, color: ON_DARK });
    s.text({ x: M, y: 6.8, w: 7.5, h: 0.3, text: 'Prepared for the Executive Board' + (b.cfg.preparedBy ? '   ·   ' + b.cfg.preparedBy : ''), size: 11, color: ON_DARK_DIM });
    s.notes = 'Cover. One sentence that sums up the month: ' + verdict(b);
    return s;
  }

  // ---------- slide 2: the number (paper; one giant figure, stats as a typographic list) ----------

  function theNumber(b, brand, n, total) {
    const s = new Slide(PAPER);
    const bb = b.b;
    eyebrow(s, M, 0.6, 6, '01   The number', brand);
    headline(s, M, 0.95, 7.2, 'Answered by the bot in ' + b.range.name, INK, 32);

    s.text({ x: M - 0.05, y: 1.85, w: 7.6, h: 3.3, runs: [{ text: String(Math.round(bb.rate || 0)), size: 230, bold: true, color: INK }, { text: '%', size: 80, bold: true, color: brand }], valign: 'middle' });

    // What changed
    const lines = [];
    if (b.delta != null) {
      const up = b.delta >= 0.05;
      const down = b.delta <= -0.05;
      lines.push({ t: (up ? '▲  ' : down ? '▼  ' : '●  ') + (up || down ? pts(b.delta) + (up ? ' up on ' : ' down on ') : 'Level with ') + b.prevRange.name, c: up ? GOOD : down ? VERMILION : STONE });
    }
    lines.push(b.vsGoal >= 0
      ? { t: '✓  Goal of ' + b.goal + '% met (' + pts(b.vsGoal) + ' above)', c: GOOD }
      : { t: pts(b.vsGoal) + ' short of the ' + b.goal + '% goal: about ' + n0(b.needForGoal) + ' more answers needed', c: VERMILION });
    lines.forEach(function (l, i) { s.text({ x: M, y: 5.2 + i * 0.4, w: 7.4, h: 0.36, text: l.t, size: 15, bold: true, color: l.c }); });

    // Three facts as a ruled list
    const rx = 8.55;
    const rw = W - M - rx;
    const facts = [
      { n: n0(bb.total), l: 'questions asked', c: INK },
      { n: n0(bb.answered), l: 'answered from the manual', c: brand },
      { n: n0(bb.tickets), l: 'sent to a person', c: VERMILION }
    ];
    facts.forEach(function (f, i) {
      const y = 1.55 + i * 1.3;
      s.line({ x1: rx, y1: y, x2: rx + rw, y2: y, color: i === 0 ? INK : RULE, width: i === 0 ? 2 : 1 });
      s.text({ x: rx, y: y + 0.12, w: rw, h: 0.8, text: f.n, size: 46, bold: true, font: SERIF, color: f.c, valign: 'middle' });
      s.text({ x: rx, y: y + 0.88, w: rw, h: 0.3, text: f.l, size: 13, color: STONE });
    });

    // Progress to goal as a single ruled bar
    const bx = rx;
    const by = 6.15;
    s.text({ x: bx, y: by - 0.38, w: rw, h: 0.3, text: 'PROGRESS TO GOAL', size: 10, bold: true, color: STONE });
    s.rect({ x: bx, y: by, w: rw, h: 0.2, fill: PAPER2 });
    s.rect({ x: bx, y: by, w: Math.max(0.05, (rw * Math.min(100, bb.rate || 0)) / 100), h: 0.2, fill: brand });
    const gx = bx + (rw * Math.min(100, b.goal)) / 100;
    s.line({ x1: gx, y1: by - 0.12, x2: gx, y2: by + 0.32, color: INK, width: 2.5 });
    s.text({ x: gx - 1, y: by + 0.36, w: 2, h: 0.28, text: 'Goal ' + b.goal + '%', size: 11, bold: true, align: 'center' });
    footer(s, b, n, total);
    s.notes = 'Answer rate = questions answered from the manual ÷ all questions asked in ' + b.range.label + '. ' +
      'Questions that go to a person are counted against the bot even when they are sent there by policy.' +
      (b.pb ? ' ' + b.prevRange.label + ' was ' + pct0(b.pb.rate) + '.' : '');
    return s;
  }

  // ---------- slide 3: the trend (dark, annotated like a chart in a newspaper) ----------

  function trend(b, brand, n, total) {
    const s = new Slide(INK);
    const live = tint(brand, 0.5); // brand, lightened so it glows on dark
    eyebrow(s, M, 0.6, 6, '02   The trend', SAFFRON);
    headline(s, M, 0.95, W - 2 * M, trendTitle(b), ON_DARK, 34);
    s.text({ x: M, y: 1.62, w: W - 2 * M, h: 0.35, text: 'Share of questions answered by the bot, by month, against the ' + b.goal + '% goal', size: 14, color: ON_DARK_DIM });
    const data = b.series;
    if (data.length < 2) {
      s.text({ x: M, y: 3.0, w: W - 2 * M, h: 2.4, text: 'A trend line needs at least two full months of data. Add earlier months to the questions file to see it.', size: 24, italic: true, font: SERIF, color: ON_DARK, valign: 'middle' });
      footer(s, b, n, total, { dark: true });
      s.notes = 'Not enough months in the data to draw a trend.';
      return s;
    }
    const cx = M + 0.7;
    const cy = 3.25;
    const cw = W - 2 * M - 0.85;
    const ch = 2.75;
    const rates = data.map(function (d) { return d.rate; }).concat([b.goal]);
    let lo = Math.floor((Math.min.apply(null, rates) - 6) / 10) * 10;
    let hi = Math.ceil((Math.max.apply(null, rates) + 6) / 10) * 10;
    lo = Math.max(0, lo); hi = Math.min(100, Math.max(hi, lo + 20));
    const Y = function (v) { return cy + ch - ((v - lo) / (hi - lo)) * ch; };
    const X = function (i) { return cx + (cw * (i + 0.5)) / data.length; };
    for (let v = lo; v <= hi; v += 10) {
      s.line({ x1: cx, y1: Y(v), x2: cx + cw, y2: Y(v), color: v === lo ? '5A6E64' : '31453C', width: 1 });
      s.text({ x: cx - 0.7, y: Y(v) - 0.15, w: 0.55, h: 0.3, text: v + '%', size: 10, color: ON_DARK_DIM, align: 'right', valign: 'middle' });
    }
    // Manual updates: a saffron flag above the month, with a thin guide down to the line.
    const byMonth = {};
    b.roi.updates.forEach(function (u) {
      const d = new Date(u.publishedAt);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      (byMonth[k] = byMonth[k] || []).push(u.title);
    });
    data.forEach(function (d, i) {
      const list = byMonth[d.ym];
      if (!list) return;
      const shown = list.slice(0, 2).map(function (t) { return clip(t, 28); });
      if (list.length > 2) shown.push('+ ' + (list.length - 2) + ' more');
      s.text({ x: X(i) - 0.95, y: 2.12, w: 1.9, h: 0.75, text: 'MANUAL UPDATE\n' + shown.join('\n'), size: 9.5, color: SAFFRON, align: 'center', valign: 'bottom' });
      const labelAbove = !(Math.abs(Y(b.goal) - (Y(d.rate) - 0.36)) < 0.26);
      s.line({ x1: X(i), y1: 2.93, x2: X(i), y2: Y(d.rate) - (labelAbove ? 0.62 : 0.2), color: SAFFRON, width: 1.25, dash: true });
    });
    // Goal
    s.line({ x1: cx, y1: Y(b.goal), x2: cx + cw, y2: Y(b.goal), color: ON_DARK, width: 1.5, dash: true });
    const goalAtLeft = Math.abs(data[0].rate - b.goal) >= Math.abs(data[data.length - 1].rate - b.goal);
    s.text({ x: goalAtLeft ? cx + 0.05 : cx + cw - 1.65, y: Y(b.goal) - 0.33, w: 1.6, h: 0.28, text: 'GOAL ' + b.goal + '%', size: 10.5, bold: true, color: ON_DARK, align: goalAtLeft ? 'left' : 'right' });
    // The rate itself
    for (let i = 0; i < data.length - 1; i++) {
      s.line({ x1: X(i), y1: Y(data[i].rate), x2: X(i + 1), y2: Y(data[i + 1].rate), color: live, width: 4.5 });
    }
    data.forEach(function (d, i) {
      const last = i === data.length - 1;
      const r = last ? 0.15 : 0.09;
      s.oval({ x: X(i) - r, y: Y(d.rate) - r, w: 2 * r, h: 2 * r, fill: last ? SAFFRON : INK, line: last ? SAFFRON : live, lineWidth: 3 });
      const nearGoal = Math.abs(Y(b.goal) - (Y(d.rate) - 0.36)) < 0.26;
      s.text({ x: X(i) - 0.65, y: nearGoal ? Y(d.rate) + 0.2 : Y(d.rate) - 0.55, w: 1.3, h: 0.36, text: pct0(d.rate), size: last ? 24 : 15, bold: true, font: SERIF, color: last ? SAFFRON : ON_DARK, align: 'center', valign: nearGoal ? 'top' : 'bottom' });
      s.text({ x: X(i) - 0.6, y: cy + ch + 0.14, w: 1.2, h: 0.3, text: d.label, size: 12, bold: last, color: last ? ON_DARK : ON_DARK_DIM, align: 'center' });
    });
    footer(s, b, n, total, { dark: true });
    s.notes = 'Monthly answer rate for the last ' + data.length + ' full months. Saffron flags mark months in which a section was added to the manual. ' +
      'Months with no data or only a partial month of data are left out.';
    return s;
  }

  // ---------- slide 4: why tickets happen (split: a vermilion verdict beside the evidence) ----------

  function reasons(b, brand, n, total) {
    const s = new Slide(PAPER);
    const tk = b.b.tickets;
    const lw = 5.1;
    s.rect({ x: 0, y: 0, w: lw, h: H, fill: VERMILION });
    eyebrow(s, M, 0.6, 4, '03   Why people were sent to a person', 'FFE3D6');
    if (tk) {
      s.text({ x: M - 0.05, y: 1.5, w: lw - 0.7, h: 2.2, text: n0(b.fixableTickets), size: 130, bold: true, font: SERIF, color: 'FFFFFF', valign: 'middle' });
      s.text({ x: M, y: 3.85, w: lw - 1.3, h: 1.4, text: 'tickets a month that a clearer or fuller manual could have answered', size: 22, italic: true, font: SERIF, color: 'FFFFFF' });
      s.line({ x1: M, y1: 5.55, x2: M + 0.9, y2: 5.55, color: 'FFFFFF', width: 2.5 });
      s.text({ x: M, y: 5.75, w: lw - 1.3, h: 1.0, text: 'The other ' + n0(b.b.byDesign) + ' go to a person on purpose: personal or approval questions, and topics outside the manual.', size: 12, color: 'FFE3D6' });
    } else {
      s.text({ x: M, y: 2.5, w: lw - 1.3, h: 2.5, text: 'Every question was answered by the bot.', size: 30, bold: true, font: SERIF, color: 'FFFFFF', valign: 'middle' });
    }
    const rx = lw + 0.7;
    const rw = W - M - rx;
    headline(s, rx, 0.6, rw, tk ? Math.round(b.fixablePct) + '% of tickets could be avoided by changing the manual' : 'Nothing went to a person this month', INK, 28);
    s.text({ x: rx, y: 1.85, w: rw, h: 0.35, text: n0(tk) + ' of ' + n0(b.b.total) + ' questions in ' + b.range.name + ' went to a person. Here is why.', size: 13, color: STONE });
    const max = Math.max.apply(null, b.reasons.map(function (r) { return r.count; }).concat([1]));
    b.reasons.forEach(function (r, i) {
      const y = 2.5 + i * 1.12;
      const col = r.fixable ? VERMILION : '9C9582';
      s.line({ x1: rx, y1: y, x2: rx + rw, y2: y, color: RULE });
      s.text({ x: rx, y: y + 0.12, w: rw - 1.9, h: 0.34, text: r.label, size: 15, bold: true, color: r.fixable ? INK : STONE });
      s.text({ x: rx, y: y + 0.46, w: rw - 1.9, h: 0.28, text: r.help, size: 11, color: STONE });
      s.text({ x: rx + rw - 1.8, y: y + 0.08, w: 1.8, h: 0.6, text: n0(r.count), size: 30, bold: true, font: SERIF, color: col, align: 'right', valign: 'middle' });
      s.text({ x: rx + rw - 1.8, y: y + 0.66, w: 1.8, h: 0.26, text: Math.round(r.pctOfTickets) + '% of tickets', size: 10.5, color: STONE, align: 'right' });
      s.rect({ x: rx, y: y + 0.84, w: rw - 1.9, h: 0.1, fill: PAPER2 });
      if (r.count) s.rect({ x: rx, y: y + 0.84, w: Math.max(0.06, ((rw - 1.9) * r.count) / max), h: 0.1, fill: col });
    });
    footer(s, b, n, total, { x: rx });
    s.notes = 'Every ticket has one reason. "Nothing in the manual" and "section did not settle it" (vermilion) can be fixed by editing the manual. ' +
      'Policy and out-of-scope questions (grey) are meant to reach a person.';
    return s;
  }

  // ---------- slide 5: the changes (an editorial list, numerals as the anchor) ----------

  function fixes(b, brand, n, total) {
    const s = new Slide(PAPER);
    const list = b.fixes;
    eyebrow(s, M, 0.6, 6, '04   What to change in the manual', brand);
    if (!list.length) {
      headline(s, M, 0.95, W - 2 * M, 'No urgent changes to the manual this month', INK, 34);
      s.text({ x: M, y: 2.8, w: 9, h: 2.5, text: 'No topic reached three tickets in the month. Topics appear here as soon as three or more questions on the same subject go to a person.', size: 24, italic: true, font: SERIF, color: STONE, valign: 'top' });
      footer(s, b, n, total);
      s.notes = 'No fix reached the minimum of three tickets in the month.';
      return s;
    }
    headline(s, M, 0.95, W - 2 * M, (list.length === 3 ? 'Three' : String(list.length)) + ' manual change' + (list.length === 1 ? '' : 's') + ' would answer about ' + n0(b.moreFromFixes) + ' more questions a month', INK, 32);
    const rowH = 1.38;
    const y0 = 1.95;
    list.forEach(function (f, i) {
      const y = y0 + i * rowH;
      s.line({ x1: M, y1: y, x2: W - M, y2: y, color: i === 0 ? INK : RULE, width: i === 0 ? 2 : 1 });
      s.text({ x: M - 0.04, y: y + 0.1, w: 0.9, h: 1.1, text: String(i + 1), size: 60, bold: true, italic: true, font: SERIF, color: 'C9BC9C', valign: 'middle' });
      const tagColor = f.kind === 'add' ? VERMILION : SAFFRON_DEEP;
      s.text({ x: 1.85, y: y + 0.16, w: 6.9, h: 0.26, text: (f.kind === 'add' ? 'ADD A SECTION' : 'IMPROVE A SECTION') + (f.rising ? '   ·   RISING' : ''), size: 10.5, bold: true, color: tagColor });
      s.text({ x: 1.85, y: y + 0.44, w: 6.9, h: 0.42, text: clip(f.theme, 46), size: 21, bold: true, font: SERIF });
      s.text({ x: 1.85, y: y + 0.88, w: 6.9, h: 0.3, text: '“' + clip(f.example, 78) + '”', size: 11.5, italic: true, color: STONE });
      s.text({ x: 9.2, y: y + 0.12, w: 3.38, h: 0.75, text: '+' + n0(f.more), size: 46, bold: true, font: SERIF, color: brand, align: 'right', valign: 'middle' });
      s.text({ x: 9.2, y: y + 0.84, w: 3.38, h: 0.3, text: 'answered a month  ·  ≈ ' + hrs(f.hours) + ' staff hrs', size: 11, color: STONE, align: 'right' });
    });
    const by = y0 + list.length * rowH + 0.0;
    s.line({ x1: M, y1: by, x2: W - M, y2: by, color: RULE });
    // The payoff, on an ink band
    s.rect({ x: 0, y: 6.2, w: W, h: 0.78, fill: INK });
    s.text({ x: M, y: 6.2, w: W - 2 * M, h: 0.78, runs: [
      { text: 'Make ' + (list.length === 1 ? 'it' : list.length === 3 ? 'all three' : 'them all') + ' and the answer rate moves from ' + pct0(b.b.rate) + ' to about ', size: 18, font: SERIF, italic: true, color: ON_DARK },
      { text: pct0(b.projectedRate), size: 28, bold: true, font: SERIF, color: SAFFRON },
      { text: b.projectedRate >= b.goal ? '   (reaches the ' + b.goal + '% goal)' : '   (goal ' + b.goal + '%)', size: 14, color: ON_DARK_DIM }], valign: 'middle' });
    footer(s, b, n, total);
    s.notes = 'Estimate, not a promise: each fix is assumed to let the bot answer ' + Math.round(b.fixFactor.factor * 100) + '% of the repeat questions on its topic' +
      (b.fixFactor.fromHistory ? ' (the average of ' + b.fixFactor.n + ' of our own past updates)' : ' (a typical figure; there is not enough history yet)') +
      '. Staff hours assume ' + b.cfg.minutesPerTicket + ' minutes of a person\'s time per ticket.';
    return s;
  }

  // ---------- slide 6: return on updates (green panel with the payoff; bars for each update) ----------

  function roi(b, brand, n, total) {
    const s = new Slide(PAPER);
    const r = b.roi;
    const lw = 4.9;
    s.rect({ x: 0, y: 0, w: lw, h: H, fill: brand });
    eyebrow(s, M, 0.6, 4, '05   Return on updates', ON_DARK);
    if (!r.count) {
      s.text({ x: M, y: 2.3, w: lw - 1.3, h: 2.8, text: 'No updates tracked yet', size: 34, bold: true, font: SERIF, color: ON_DARK, valign: 'middle' });
      const rx0 = lw + 0.7;
      headline(s, rx0, 0.6, W - M - rx0, 'Publish the first change, then watch it pay off', INK, 28);
      s.text({ x: rx0, y: 2.2, w: W - M - rx0, h: 2.5, text: 'Once a section is published, next month\'s briefing will show how many questions it answered, how many tickets it removed, and how much staff time it saved.', size: 18, italic: true, font: SERIF, color: STONE });
      footer(s, b, n, total, { x: rx0 });
      s.notes = 'No sections were published during the period covered by the data.';
      return s;
    }
    s.text({ x: M - 0.05, y: 1.35, w: lw - 0.8, h: 2.4, runs: [{ text: hrs(r.hoursSince), size: 150, bold: true, color: ON_DARK }, { text: ' hrs', size: 36, italic: true, color: SAFFRON }], valign: 'middle' });
    s.text({ x: M, y: 3.8, w: lw - 1.2, h: 0.8, text: 'of staff time saved by updates to the manual', size: 20, italic: true, font: SERIF, color: ON_DARK });
    s.line({ x1: M, y1: 4.85, x2: lw - 0.75, y2: 4.85, color: tint(brand, 0.5), width: 1 });
    s.text({ x: M, y: 5.0, w: 1.7, h: 0.6, text: n0(r.answersSince), size: 32, bold: true, font: SERIF, color: SAFFRON, valign: 'middle' });
    s.text({ x: M + 1.75, y: 5.0, w: lw - 2.7, h: 0.6, text: 'questions answered\n' + n0(r.answersThisMonth) + ' of them in ' + b.range.name, size: 11.5, color: ON_DARK, valign: 'middle' });
    s.text({ x: M, y: 5.8, w: 1.7, h: 0.6, text: n0(r.fewerPerMonth), size: 32, bold: true, font: SERIF, color: SAFFRON, valign: 'middle' });
    s.text({ x: M + 1.75, y: 5.8, w: lw - 2.7, h: 0.6, text: 'fewer tickets a month\non the topics they cover', size: 11.5, color: ON_DARK, valign: 'middle' });

    const rx = lw + 0.7;
    const rw = W - M - rx;
    headline(s, rx, 0.6, rw, 'What each update delivered', INK, 28);
    s.text({ x: rx, y: 1.3, w: rw, h: 0.32, text: r.count + ' section' + (r.count === 1 ? '' : 's') + ' published' + (r.newThisMonth ? ', ' + r.newThisMonth + ' of them in ' + b.range.name : '') + '.', size: 13, color: STONE });
    const barW = 3.3;
    const cA = rx + barW + 0.35; // answered
    const cT = cA + 1.0;         // tickets a week
    const cH = cT + 1.45;        // hours
    const heads = [{ t: 'ANSWERED', x: cA, w: 0.95, a: 'right' }, { t: 'TICKETS / WEEK', x: cT, w: 1.4, a: 'right' }, { t: 'HOURS', x: cH, w: W - M - cH, a: 'right' }];
    heads.forEach(function (h) { s.text({ x: h.x, y: 2.05, w: h.w, h: 0.26, text: h.t, size: 9, bold: true, color: STONE, align: h.a }); });
    const rows = r.updates.slice(0, 4);
    const max = Math.max.apply(null, rows.map(function (u) { return u.answersSince; }).concat([1]));
    rows.forEach(function (u, i) {
      const y = 2.4 + i * 1.12;
      const d = new Date(u.publishedAt);
      s.line({ x1: rx, y1: y, x2: W - M, y2: y, color: i === 0 ? INK : RULE, width: i === 0 ? 2 : 1 });
      s.text({ x: rx, y: y + 0.1, w: barW, h: 0.36, text: clip(u.title, 34), size: 15, bold: true, font: SERIF });
      s.text({ x: rx, y: y + 0.47, w: barW, h: 0.26, text: 'Published ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), size: 10.5, color: STONE });
      s.rect({ x: rx, y: y + 0.8, w: barW, h: 0.12, fill: PAPER2 });
      s.rect({ x: rx, y: y + 0.8, w: Math.max(0.06, (barW * u.answersSince) / max), h: 0.12, fill: brand });
      const tw = u.ticketsBeforePerWeek != null && u.ticketsAfterPerWeek != null
        ? (Math.round(u.ticketsBeforePerWeek * 10) / 10) + ' → ' + (Math.round(u.ticketsAfterPerWeek * 10) / 10) : 'n/a';
      s.text({ x: cA, y: y + 0.1, w: 0.95, h: 0.7, text: n0(u.answersSince), size: 28, bold: true, font: SERIF, color: brand, align: 'right', valign: 'middle' });
      s.text({ x: cT, y: y + 0.1, w: 1.4, h: 0.7, text: tw, size: 15, bold: true, color: GOOD, align: 'right', valign: 'middle' });
      s.text({ x: cH, y: y + 0.1, w: W - M - cH, h: 0.7, text: hrs(u.hoursSaved), size: 28, bold: true, font: SERIF, color: INK, align: 'right', valign: 'middle' });
    });
    s.line({ x1: rx, y1: 2.4 + rows.length * 1.12, x2: W - M, y2: 2.4 + rows.length * 1.12, color: RULE });
    footer(s, b, n, total, { x: rx });
    s.notes = 'For each published update: questions on its topics that the bot answered since publishing; tickets a week in the four weeks before publishing compared with the weeks since; ' +
      'and staff hours = answered questions × ' + b.cfg.minutesPerTicket + ' minutes ÷ 60. "Fewer tickets a month" converts the weekly drop at 52 ÷ 12 weeks per month. ' +
      'These are estimates; some of the change may come from other causes.';
    return s;
  }

  // ---------- slide 7: next month (full-bleed green close; target, plan, note) ----------

  function next(b, brand, n, total) {
    const s = new Slide(brand);
    const target = Math.max(b.projectedRate || 0, b.b.rate || 0);
    const nm = nextMonthName(b);
    eyebrow(s, M, 0.6, 6, '06   Next month', SAFFRON);
    s.text({ x: M, y: 1.05, w: 5.6, h: 0.6, text: 'In ' + nm + ', aim for', size: 24, italic: true, font: SERIF, color: ON_DARK });
    s.text({ x: M - 0.05, y: 1.6, w: 6.2, h: 2.7, runs: [{ text: String(Math.round(target)), size: 170, bold: true, color: SAFFRON }, { text: '%', size: 60, bold: true, color: ON_DARK }], valign: 'middle' });
    s.text({ x: M, y: 4.3, w: 5.6, h: 0.7, text: 'up from ' + pct0(b.b.rate) + ' in ' + b.range.name + (b.moreFromFixes ? ', about ' + n0(b.moreFromFixes) + ' more answers a month' : ''), size: 14, color: ON_DARK });

    const rx = 7.3;
    const rw = W - M - rx;
    s.line({ x1: rx - 0.4, y1: 1.1, x2: rx - 0.4, y2: 4.95, color: tint(brand, 0.45), width: 1 });
    eyebrow(s, rx, 1.1, rw, 'The plan', tint(brand, 0.7));
    const plan = b.fixes.map(function (f) { return { k: f.kind === 'add' ? 'Add' : 'Improve', t: clip(f.theme, 40) }; });
    if (!plan.length) plan.push({ k: 'Keep', t: 'watching for repeat questions' });
    plan.forEach(function (p, i) {
      const y = 1.55 + i * 0.85;
      s.text({ x: rx, y: y, w: 0.6, h: 0.7, text: String(i + 1), size: 40, bold: true, italic: true, font: SERIF, color: SAFFRON, valign: 'middle' });
      s.text({ x: rx + 0.7, y: y, w: rw - 0.7, h: 0.28, text: p.k.toUpperCase(), size: 9.5, bold: true, color: tint(brand, 0.7), valign: 'bottom' });
      s.text({ x: rx + 0.7, y: y + 0.28, w: rw - 0.7, h: 0.42, text: p.t, size: 18, bold: true, font: SERIF, color: ON_DARK, valign: 'top' });
    });
    if (b.review.length) {
      const txt = b.review.slice(0, 3).map(function (r) { return r.flag === 'unused' ? r.title + ' (never used)' : r.title + ' (' + Math.round(r.unclearRate) + '% unclear)'; }).join('  ·  ');
      s.text({ x: rx, y: 4.15, w: rw, h: 0.26, text: 'ALSO TO REVIEW', size: 9.5, bold: true, color: tint(brand, 0.7) });
      s.text({ x: rx, y: 4.42, w: rw, h: 0.6, text: clip(txt, 110), size: 11.5, color: ON_DARK });
    }
    if (String(b.cfg.note || '').trim()) {
      s.rect({ x: M, y: 5.25, w: 0.07, h: 1.3, fill: SAFFRON });
      s.text({ x: M + 0.3, y: 5.2, w: W - 2 * M - 0.3, h: 1.3, text: clip(b.cfg.note, 420), size: 15, italic: true, font: SERIF, color: ON_DARK, valign: 'middle' });
      s.text({ x: M + 0.3, y: 6.58, w: 6, h: 0.22, text: '— ' + (b.cfg.preparedBy || b.cfg.org), size: 10, color: ON_DARK_DIM });
    }
    footer(s, b, n, total, { dark: true });
    s.notes = 'The target is the projected answer rate if the listed changes are made, an estimate based on how well past updates worked. ' +
      'Staff can add a personal note in the Briefing Maker and it will appear here.';
    return s;
  }


  // ---------- appendix (hidden slides) ----------
  //
  // Hidden slides stay out of the presentation but travel with the file. They hold the detail:
  // the questions behind each category that needs work, and a table the team fills in.

  const KIND_LABEL = { add: 'NOTHING IN THE MANUAL', clarify: 'SECTION DID NOT SETTLE IT' };

  function categorySlide(b, brand, c, idx, count, label) {
    const s = new Slide(PAPER, true);
    const lw = 4.4;
    s.rect({ x: 0, y: 0, w: 0.22, h: H, fill: VERMILION });
    eyebrow(s, M, 0.6, lw, 'Appendix   ·   category ' + (idx + 1) + ' of ' + count, STONE);
    s.text({ x: M, y: 0.98, w: lw, h: 1.5, text: c.name, size: c.name.length > 22 ? 28 : 34, bold: true, font: SERIF });
    s.text({ x: M - 0.04, y: 2.6, w: lw, h: 1.5, text: n0(c.fixable), size: 100, bold: true, font: SERIF, color: VERMILION, valign: 'middle' });
    s.text({ x: M, y: 4.1, w: lw - 0.4, h: 0.8, text: 'tickets a month the manual could have answered in this category', size: 17, italic: true, font: SERIF, color: INK });
    s.line({ x1: M, y1: 5.15, x2: M + 0.9, y2: 5.15, color: INK, width: 2.5 });
    s.text({ x: M, y: 5.3, w: lw - 0.4, h: 1.4, text: 'Answer rate here: ' + pct0(c.rate) + '  (overall ' + pct0(b.b.rate) + ')\n' + Math.round(c.shareOfFixable) + '% of all the gaps in the manual\n' + n0(c.total) + ' questions asked in ' + b.range.name, size: 12, color: STONE });
    const rx = 5.5;
    const rw = W - M - rx;
    s.text({ x: rx, y: 0.6, w: rw, h: 0.3, text: 'THE TOP QUESTIONS PEOPLE ASKED', size: 11, bold: true, color: VERMILION });
    c.themes.forEach(function (t, i) {
      const y = 1.05 + i * 0.98;
      s.line({ x1: rx, y1: y, x2: rx + rw, y2: y, color: i === 0 ? INK : RULE, width: i === 0 ? 2 : 1 });
      s.text({ x: rx, y: y + 0.1, w: 0.95, h: 0.55, text: n0(t.tickets), size: 34, bold: true, font: SERIF, color: t.kind === 'add' ? VERMILION : SAFFRON_DEEP, valign: 'middle' });
      s.text({ x: rx, y: y + 0.64, w: 0.95, h: 0.24, text: 'tickets', size: 10, color: STONE });
      s.text({ x: rx + 1.1, y: y + 0.08, w: rw - 1.1, h: 0.38, text: '“' + clip(t.examples[0] || t.theme, 52) + '”', size: 16, italic: true, font: SERIF });
      s.text({ x: rx + 1.1, y: y + 0.47, w: rw - 1.1, h: 0.24, text: (KIND_LABEL[t.kind] || '') + (t.section ? '   ·   ' + clip(t.section, 36) : ''), size: 9.5, bold: true, color: t.kind === 'add' ? VERMILION : SAFFRON_DEEP });
      s.text({ x: rx + 1.1, y: y + 0.71, w: rw - 1.1, h: 0.24, text: t.note ? 'Staff told them: ' + clip(t.note, 60) : (t.examples[1] ? 'Also asked: “' + clip(t.examples[1], 70) + '”' : ''), size: 10.5, color: STONE });
    });
    // What it adds up to
    const gain = c.themes.reduce(function (a, t) { return a + Math.max(1, Math.round(t.tickets * b.fixFactor.factor)); }, 0);
    s.line({ x1: rx, y1: 6.25, x2: rx + rw, y2: 6.25, color: INK, width: 2 });
    s.text({ x: rx, y: 6.35, w: rw, h: 0.55, runs: [{ text: 'Fixing ' + (c.themes.length === 1 ? 'this topic' : 'these ' + c.themes.length + ' topics') + ' could answer about ', size: 14, italic: true, font: SERIF, color: STONE }, { text: n0(gain) + ' more questions a month', size: 15, bold: true, italic: true, font: SERIF, color: GOOD }, { text: '.', size: 15, italic: true, font: SERIF, color: STONE }], valign: 'middle' });
    footer(s, b, 0, 0, { label: label });
    s.notes = 'Hidden appendix slide. Category: ' + c.name + '. Lists the topics in this category where the bot had nothing to answer from or the section found did not settle the question, ' +
      'most-asked first. "Staff told them" is how a person resolved the most recent ticket on that topic, a starting point for new manual wording. ' +
      'Topics already fixed by a new section are left out. To show this slide when presenting, choose Slide Show > Hide Slide again.';
    return s;
  }

  // The working table: every suggested change, with room to decide, assign and track it.
  function trackerRows(b) {
    const rows = b.fixesTracker.map(function (f) {
      return { kind: f.kind === 'add' ? 'ADD A SECTION' : 'IMPROVE A SECTION', color: f.kind === 'add' ? VERMILION : SAFFRON_DEEP, title: f.theme,
        ctx: n0(f.tickets) + ' tickets now  ·  +' + n0(f.more) + ' answered a month', quote: f.example };
    });
    b.review.forEach(function (r) {
      rows.push({ kind: 'REVIEW A SECTION', color: STONE, title: r.title,
        ctx: r.flag === 'unused' ? 'Never used this month' : Math.round(r.unclearRate) + '% of uses did not settle the question (' + r.cited + ' uses)', quote: '' });
    });
    return rows.slice(0, 12);
  }

  function trackerSlides(b, brand, labelFor) {
    const rows = trackerRows(b);
    if (!rows.length) return [];
    const per = 6;
    const pages = Math.ceil(rows.length / per);
    const out = [];
    const colW = [0.55, 2.6, 3.0, 1.5, 1.4, 0.95, 1.83];
    const border = function (c) { return [{ type: 'none' }, { type: 'none' }, { type: 'solid', pt: 0.75, color: c || RULE }, { type: 'none' }]; };
    for (let p = 0; p < pages; p++) {
      const s = new Slide(PAPER, true);
      eyebrow(s, M, 0.6, 9, 'Appendix   ·   working plan' + (pages > 1 ? '   ·   part ' + (p + 1) + ' of ' + pages : ''), brand);
      headline(s, M, 0.95, W - 2 * M, 'Changes to the manual: decide, assign, track', INK, 30);
      s.text({ x: M, y: 1.55, w: W - 2 * M, h: 0.34, text: 'Tick a decision for each change, name an owner and a date. This is a normal PowerPoint table, so type straight into it.', size: 12.5, color: STONE });
      const head = ['#', 'CHANGE', 'CONTEXT', 'DECISION', 'OWNER', 'DUE', 'STATUS'].map(function (t, i) {
        return { text: t, size: 9.5, bold: true, color: ON_DARK, fill: INK, align: i === 0 ? 'center' : 'left', border: border(INK) };
      });
      const body = rows.slice(p * per, p * per + per).map(function (r, i) {
        const fill = i % 2 ? 'EFE7D6' : PAPER;
        return [
          { text: String(p * per + i + 1), size: 16, bold: true, font: SERIF, color: 'B9AB88', fill: fill, align: 'center', border: border() },
          { runs: [{ text: r.kind, size: 8.5, bold: true, color: r.color, br: true }, { text: clip(r.title, 38), size: 12, bold: true, font: SERIF, color: INK }], fill: fill, border: border() },
          { runs: [{ text: r.ctx, size: 9.5, color: INK, br: !!r.quote }].concat(r.quote ? [{ text: '“' + clip(r.quote, 52) + '”', size: 9.5, italic: true, color: STONE }] : []), fill: fill, border: border() },
          { text: '☐  Action item\n☐  Dismiss', size: 10.5, color: INK, fill: fill, border: border() },
          { text: '', size: 10.5, fill: fill, border: border('9C9582') },
          { text: '', size: 10.5, fill: fill, border: border('9C9582') },
          { text: '☐  To do\n☐  In progress\n☐  Done', size: 9.5, color: INK, fill: fill, border: border() }
        ];
      });
      s.table({ x: M, y: 2.05, w: W - 2 * M, colW: colW, rowH: [0.38].concat(body.map(function () { return 0.74; })), rows: [head].concat(body) });
      footer(s, b, 0, 0, { label: labelFor(out.length) });
      s.notes = 'Hidden appendix slide: the working plan. Every change suggested for the manual, in the order of how many tickets it would remove. ' +
        'Tick Action item or Dismiss, write an owner and a due date, and track status as work proceeds. Rows can be added or deleted like any PowerPoint table.';
      out.push(s);
    }
    return out;
  }

  // ---------- email text ----------

  function email(b) {
    const subject = 'Operating manual briefing, ' + b.range.label + ': ' + pct0(b.b.rate) + ' of questions answered by the bot';
    const lines = [
      'Hello,', '',
      'Attached is the ' + b.range.label + ' operating manual briefing (7 slides, about a two-minute read, plus hidden appendix slides with the detail and a working table for the changes).', '',
      'The short version:',
      '- ' + verdict(b)
    ];
    if (b.delta != null) lines.push('- ' + (b.delta >= 0.05 ? 'Up ' : b.delta <= -0.05 ? 'Down ' : 'Unchanged, ') + (Math.abs(b.delta) >= 0.05 ? pts(b.delta) + ' ' : '') + 'on ' + b.prevRange.name + ' (' + pct0(b.pb.rate) + ').');
    if (b.roi.count) lines.push('- Manual updates have answered ' + n0(b.roi.answersSince) + ' questions, saving about ' + hrs(b.roi.hoursSince) + ' staff hours.');
    if (b.fixes.length) lines.push('- Next: ' + b.fixes.length + ' manual change' + (b.fixes.length === 1 ? '' : 's') + ' could take the rate to about ' + pct0(b.projectedRate) + '.');
    if (String(b.cfg.note || '').trim()) lines.push('', b.cfg.note.trim());
    lines.push('', 'Best regards,', b.cfg.preparedBy || b.cfg.org);
    return { subject: subject, body: lines.join('\n') };
  }

  // ---------- the deck ----------

  function build(b) {
    const brand = hex(b.cfg.brand) || '1E6B52';
    const total = 7;
    const slides = [
      cover(b, brand, total),
      theNumber(b, brand, 2, total),
      trend(b, brand, 3, total),
      reasons(b, brand, 4, total),
      fixes(b, brand, 5, total),
      roi(b, brand, 6, total),
      next(b, brand, 7, total)
    ];
    // Hidden appendix: top questions per category, then the working table.
    const cats = b.categories || [];
    const trackers = trackerSlides(b, brand, function (i) { return 'Appendix · ' + (cats.length + i + 1); });
    const appendixCount = cats.length + trackers.length;
    cats.forEach(function (c, i) { slides.push(categorySlide(b, brand, c, i, cats.length, 'Appendix · ' + (i + 1) + ' of ' + appendixCount)); });
    trackers.forEach(function (t, i) {
      t.items.forEach(function (it) { if (it.t === 'text' && /^Appendix · \d+$/.test(it.text)) it.text = 'Appendix · ' + (cats.length + i + 1) + ' of ' + appendixCount; });
      slides.push(t);
    });
    if (appendixCount) slides[6].notes += ' The slides after this one are a hidden appendix: the questions behind each category and a working table for deciding and assigning the changes.';
    return { w: W, h: H, font: SANS, slides: slides, visible: total, email: email(b), fileBase: 'Board-Briefing-' + b.range.ym };
  }

  return { build: build, W: W, H: H, FONT: SANS, verdict: verdict, email: email };
});
