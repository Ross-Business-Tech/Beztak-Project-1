/*
 * Turns a briefing (from briefing.js) into slides.
 *
 * A slide is a plain list of shapes placed on a 13.333 x 7.5 inch page:
 *   { t:'text', x, y, w, h, text | runs, size, bold, color, align, valign, italic }
 *   { t:'rect', x, y, w, h, fill, line, radius }
 *   { t:'oval', x, y, w, h, fill, line }
 *   { t:'line', x1, y1, x2, y2, color, width, dash }
 * Both the on-screen preview and the PowerPoint file are drawn from this same list,
 * so what you see is what gets emailed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.QAD = root.QAD || {}; root.QAD.slides = factory(); }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const W = 13.333;
  const H = 7.5;
  const M = 0.7; // page margin
  const FONT = 'Arial';
  const INK = '0B2545';
  const MUTED = '5B6678';
  const FAINT = 'E6E9EF';
  const PAPER = 'FFFFFF';
  const GOOD = '15803D';
  const BAD = 'B91C1C';
  const WARN = 'B45309';

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
  // A pale tint of a brand color, for backgrounds.
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

  function Slide(bg) { this.bg = bg || PAPER; this.items = []; this.notes = ''; }
  Slide.prototype.text = function (o) { this.items.push(Object.assign({ t: 'text', font: FONT, size: 14, color: INK, align: 'left', valign: 'top' }, o)); return this; };
  Slide.prototype.rect = function (o) { this.items.push(Object.assign({ t: 'rect' }, o)); return this; };
  Slide.prototype.oval = function (o) { this.items.push(Object.assign({ t: 'oval' }, o)); return this; };
  Slide.prototype.line = function (o) { this.items.push(Object.assign({ t: 'line', color: FAINT, width: 1 }, o)); return this; };

  function header(s, title, sub, brand) {
    s.rect({ x: M, y: 0.62, w: 0.6, h: 0.07, fill: brand });
    const size = title.length <= 52 ? 30 : title.length <= 62 ? 26 : 23;
    s.text({ x: M, y: 0.8, w: W - 2 * M, h: 0.95, text: title, size: size, bold: true, valign: 'top' });
    if (sub) s.text({ x: M, y: 1.78, w: W - 2 * M, h: 0.4, text: sub, size: 15, color: MUTED });
  }
  function footer(s, b, n, total) {
    s.line({ x1: M, y1: 7.0, x2: W - M, y2: 7.0, color: FAINT });
    s.text({ x: M, y: 7.06, w: 8, h: 0.3, text: b.cfg.org + '  ·  Operating manual briefing  ·  ' + b.range.label, size: 10, color: MUTED });
    s.text({ x: W - M - 1, y: 7.06, w: 1, h: 0.3, text: n + ' / ' + total, size: 10, color: MUTED, align: 'right' });
  }
  function card(s, x, y, w, h, fill) {
    s.rect({ x: x, y: y, w: w, h: h, fill: fill || 'F4F6F9', radius: 0.12 });
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

  // ---------- slide 1: cover ----------

  function cover(b, brand, nTotal) {
    const s = new Slide(INK);
    s.rect({ x: M, y: 1.7, w: 1.0, h: 0.09, fill: brand });
    s.text({ x: M, y: 2.0, w: 10, h: 0.4, text: 'OPERATING MANUAL BRIEFING', size: 16, bold: true, color: tint(brand, 0.55) });
    s.text({ x: M, y: 2.5, w: 11.5, h: 1.2, text: b.range.label, size: 60, bold: true, color: 'FFFFFF' });
    s.text({ x: M, y: 3.7, w: 11, h: 0.5, text: b.cfg.org, size: 22, color: 'C9D2E3' });
    s.text({ x: M, y: 4.75, w: 10.5, h: 1.3, text: verdict(b), size: 26, color: 'FFFFFF' });
    const prep = 'Prepared for the Executive Board' + (b.cfg.preparedBy ? '  ·  ' + b.cfg.preparedBy : '');
    s.text({ x: M, y: 6.75, w: 10, h: 0.35, text: prep, size: 12, color: 'C9D2E3' });
    s.notes = 'Cover. One sentence that sums up the month: ' + verdict(b);
    return s;
  }

  // ---------- slide 2: the number ----------

  function headline(b, brand, n, total) {
    const s = new Slide();
    const bb = b.b;
    header(s, pct0(bb.rate) + ' of staff questions were answered by the bot', b.range.label + '  ·  ' + n0(bb.total) + ' questions', brand);

    // Big number
    s.text({ x: M, y: 2.35, w: 6.4, h: 2.3, runs: [{ text: String(Math.round(bb.rate || 0)), size: 130, bold: true, color: brand }, { text: '%', size: 60, bold: true, color: brand }], valign: 'middle' });
    s.text({ x: M + 0.05, y: 4.6, w: 6, h: 0.4, text: 'answered straight from the manual', size: 18, color: MUTED });

    // Goal bar
    const bx = 7.5;
    const bw = 5.1;
    const by = 3.05;
    s.text({ x: bx, y: 2.45, w: bw, h: 0.4, text: 'Progress to goal', size: 14, bold: true, color: MUTED });
    s.rect({ x: bx, y: by, w: bw, h: 0.5, fill: FAINT, radius: 0.1 });
    s.rect({ x: bx, y: by, w: Math.max(0.2, (bw * Math.min(100, bb.rate || 0)) / 100), h: 0.5, fill: brand, radius: 0.1 });
    const gx = bx + (bw * Math.min(100, b.goal)) / 100;
    s.line({ x1: gx, y1: by - 0.16, x2: gx, y2: by + 0.66, color: INK, width: 2.5 });
    s.text({ x: gx - 1, y: by + 0.7, w: 2, h: 0.3, text: 'Goal ' + b.goal + '%', size: 12, bold: true, align: 'center' });

    // Change chips
    const chips = [];
    if (b.delta != null) {
      const up = b.delta >= 0.05;
      const down = b.delta <= -0.05;
      chips.push({ text: (up ? '▲ ' : down ? '▼ ' : '● ') + (up || down ? pts(b.delta) + (up ? ' up' : ' down') : 'No change') + ' on ' + b.prevRange.name, color: up ? GOOD : down ? BAD : MUTED });
    }
    chips.push(b.vsGoal >= 0
      ? { text: '✓ Goal met (' + pts(b.vsGoal) + ' above)', color: GOOD }
      : { text: pts(b.vsGoal) + ' to go, about ' + n0(b.needForGoal) + ' more answers', color: WARN });
    chips.forEach(function (c, i) {
      s.text({ x: bx, y: 4.2 + i * 0.5, w: bw, h: 0.4, text: c.text, size: 16, bold: true, color: c.color });
    });

    // Three stat cards
    const cw = (W - 2 * M - 0.6) / 3;
    const stats = [
      { n: n0(bb.total), l: 'questions asked' },
      { n: n0(bb.answered), l: 'answered by the bot', c: brand },
      { n: n0(bb.tickets), l: 'sent to a person' }
    ];
    stats.forEach(function (st, i) {
      const x = M + i * (cw + 0.3);
      card(s, x, 5.35, cw, 1.35, i === 1 ? tint(brand, 0.88) : null);
      s.text({ x: x + 0.3, y: 5.45, w: cw - 0.6, h: 0.8, text: st.n, size: 40, bold: true, color: st.c || INK, valign: 'middle' });
      s.text({ x: x + 0.3, y: 6.2, w: cw - 0.6, h: 0.35, text: st.l, size: 14, color: MUTED });
    });
    footer(s, b, n, total);
    s.notes = 'Answer rate = questions answered from the manual ÷ all questions asked in ' + b.range.label + '. ' +
      'Questions that go to a person are counted against the bot even when they are sent there by policy.' +
      (b.pb ? ' ' + b.prevRange.label + ' was ' + pct0(b.pb.rate) + '.' : '');
    return s;
  }

  // ---------- slide 3: trend ----------

  function trend(b, brand, n, total) {
    const s = new Slide();
    header(s, trendTitle(b), 'Share of questions answered by the bot, by month, against the ' + b.goal + '% goal', brand);
    const data = b.series;
    if (data.length < 2) {
      card(s, M, 2.6, W - 2 * M, 2.4);
      s.text({ x: M + 0.5, y: 2.6, w: W - 2 * M - 1, h: 2.4, text: 'A trend line needs at least two full months of data. Add earlier months to the questions file to see it.', size: 20, color: MUTED, valign: 'middle', align: 'center' });
      footer(s, b, n, total);
      s.notes = 'Not enough months in the data to draw a trend.';
      return s;
    }
    const cx = M + 0.8;
    const cy = 2.5;
    const cw = W - 2 * M - 1.0;
    const ch = 3.1;
    const rates = data.map(function (d) { return d.rate; }).concat([b.goal]);
    let lo = Math.floor((Math.min.apply(null, rates) - 6) / 10) * 10;
    let hi = Math.ceil((Math.max.apply(null, rates) + 6) / 10) * 10;
    lo = Math.max(0, lo); hi = Math.min(100, Math.max(hi, lo + 20));
    const Y = function (v) { return cy + ch - ((v - lo) / (hi - lo)) * ch; };
    const X = function (i) { return cx + (cw * (i + 0.5)) / data.length; };
    for (let v = lo; v <= hi; v += 10) {
      s.line({ x1: cx, y1: Y(v), x2: cx + cw, y2: Y(v), color: v === lo ? 'C4CBD8' : FAINT, width: 1 });
      s.text({ x: cx - 0.75, y: Y(v) - 0.15, w: 0.6, h: 0.3, text: v + '%', size: 11, color: MUTED, align: 'right', valign: 'middle' });
    }
    // Goal line
    s.line({ x1: cx, y1: Y(b.goal), x2: cx + cw, y2: Y(b.goal), color: INK, width: 1.75, dash: true });
    // The goal label sits at whichever end of the line is farther from the data.
    const goalAtLeft = Math.abs(data[0].rate - b.goal) >= Math.abs(data[data.length - 1].rate - b.goal);
    s.text({ x: goalAtLeft ? cx + 0.05 : cx + cw - 1.65, y: Y(b.goal) - 0.34, w: 1.6, h: 0.3, text: 'Goal ' + b.goal + '%', size: 12, bold: true, align: goalAtLeft ? 'left' : 'right' });
    // Line and points
    for (let i = 0; i < data.length - 1; i++) {
      s.line({ x1: X(i), y1: Y(data[i].rate), x2: X(i + 1), y2: Y(data[i + 1].rate), color: brand, width: 4 });
    }
    const markedMonths = {};
    b.roi.updates.forEach(function (u) {
      const d = new Date(u.publishedAt);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      (markedMonths[k] = markedMonths[k] || []).push(u.title);
    });
    data.forEach(function (d, i) {
      const last = i === data.length - 1;
      const r = last ? 0.13 : 0.09;
      s.oval({ x: X(i) - r, y: Y(d.rate) - r, w: 2 * r, h: 2 * r, fill: last ? brand : 'FFFFFF', line: brand, lineWidth: 3 });
      // Put the value above the point, or below it when the goal line would run through the label.
      const nearGoal = Math.abs(Y(b.goal) - (Y(d.rate) - 0.34)) < 0.26;
      s.text({ x: X(i) - 0.6, y: nearGoal ? Y(d.rate) + 0.18 : Y(d.rate) - 0.5, w: 1.2, h: 0.32, text: pct0(d.rate), size: last ? 18 : 14, bold: true, color: last ? brand : INK, align: 'center', valign: nearGoal ? 'top' : 'bottom' });
      s.text({ x: X(i) - 0.6, y: cy + ch + 0.12, w: 1.2, h: 0.3, text: d.label, size: 13, bold: last, color: last ? INK : MUTED, align: 'center' });
      if (markedMonths[d.ym]) {
        s.rect({ x: X(i) - 0.09, y: cy + ch + 0.5, w: 0.18, h: 0.18, fill: WARN, radius: 0.03 });
      }
    });
    // Update key
    const keys = data.filter(function (d) { return markedMonths[d.ym]; }).map(function (d) { return d.label + ': ' + markedMonths[d.ym].join(', '); });
    if (keys.length) {
      s.rect({ x: M, y: 6.43, w: 0.16, h: 0.16, fill: WARN, radius: 0.03 });
      s.text({ x: M + 0.28, y: 6.34, w: W - 2 * M - 0.3, h: 0.45, text: 'Manual updates published:  ' + clip(keys.join('   ·   '), 150), size: 12, color: MUTED, valign: 'middle' });
    }
    footer(s, b, n, total);
    s.notes = 'Monthly answer rate for the last ' + data.length + ' full months. Orange squares mark months in which a section was added to the manual. ' +
      'Months with no data or only a partial month of data are left out.';
    return s;
  }

  // ---------- slide 4: why questions go to a person ----------

  function reasons(b, brand, n, total) {
    const s = new Slide();
    const tk = b.b.tickets;
    header(s, tk ? Math.round(b.fixablePct) + '% of tickets could be avoided by changing the manual' : 'Every question was answered by the bot',
      n0(tk) + ' of ' + n0(b.b.total) + ' questions in ' + b.range.name + ' were sent to a person. Here is why.', brand);
    const lx = M;
    const lw = 7.7;
    const max = Math.max.apply(null, b.reasons.map(function (r) { return r.count; }).concat([1]));
    b.reasons.forEach(function (r, i) {
      const y = 2.5 + i * 1.08;
      const col = r.fixable ? brand : '9AA3B2';
      s.text({ x: lx, y: y, w: 5.2, h: 0.35, text: r.label, size: 17, bold: true });
      s.text({ x: lx, y: y + 0.36, w: 5.4, h: 0.3, text: r.help, size: 12, color: MUTED });
      s.rect({ x: lx + 5.6, y: y + 0.08, w: 2.1, h: 0.44, fill: 'F1F3F7', radius: 0.08 });
      if (r.count) s.rect({ x: lx + 5.6, y: y + 0.08, w: Math.max(0.14, (2.1 * r.count) / max), h: 0.44, fill: col, radius: 0.08 });
      s.text({ x: lx + 5.6, y: y + 0.6, w: 2.1, h: 0.3, text: n0(r.count) + '  ·  ' + Math.round(r.pctOfTickets) + '% of tickets', size: 12, bold: true, color: INK });
      s.line({ x1: lx, y1: y + 0.98, x2: lx + lw, y2: y + 0.98, color: FAINT });
    });
    // Right-hand callout
    const rx = 8.9;
    const rw = W - M - rx;
    card(s, rx, 2.5, rw, 4.2, INK);
    s.text({ x: rx + 0.35, y: 2.7, w: rw - 0.7, h: 0.35, text: 'WITHIN OUR CONTROL', size: 12, bold: true, color: tint(brand, 0.55) });
    s.text({ x: rx + 0.35, y: 3.05, w: rw - 0.7, h: 1.2, text: n0(b.fixableTickets), size: 72, bold: true, color: 'FFFFFF', valign: 'middle' });
    s.text({ x: rx + 0.35, y: 4.3, w: rw - 0.7, h: 1.1, text: 'tickets a month that a clearer or fuller manual could answer', size: 16, color: 'FFFFFF' });
    s.line({ x1: rx + 0.35, y1: 5.5, x2: rx + rw - 0.35, y2: 5.5, color: '3A4F73' });
    s.text({ x: rx + 0.35, y: 5.6, w: rw - 0.7, h: 1.0, text: 'The other ' + n0(b.b.byDesign) + ' go to a person on purpose and are not counted against the bot in the fix list.', size: 12, color: 'C9D2E3' });
    footer(s, b, n, total);
    s.notes = 'Every ticket has one reason. "Nothing in the manual" and "section did not settle it" can be fixed by editing the manual. ' +
      'Policy and out-of-scope questions are meant to reach a person.';
    return s;
  }

  // ---------- slide 5: the three best next changes ----------

  function fixes(b, brand, n, total) {
    const s = new Slide();
    const list = b.fixes;
    if (!list.length) {
      header(s, 'No urgent changes to the manual this month', 'No topic reached enough tickets to make the fix list.', brand);
      card(s, M, 2.6, W - 2 * M, 2.4);
      s.text({ x: M + 0.5, y: 2.6, w: W - 2 * M - 1, h: 2.4, text: 'Keep watching: topics appear here once three or more questions on the same subject go to a person in a month.', size: 20, color: MUTED, valign: 'middle', align: 'center' });
      footer(s, b, n, total);
      s.notes = 'No fix reached the minimum of three tickets in the month.';
      return s;
    }
    header(s, (list.length === 3 ? 'Three' : String(list.length)) + ' manual change' + (list.length === 1 ? '' : 's') + ' would answer ~' + n0(b.moreFromFixes) + ' more questions a month',
      'Ranked by how many tickets each would remove. ' + (list.length < 3 ? 'Only ' + list.length + ' topic' + (list.length === 1 ? '' : 's') + ' reached the threshold.' : ''), brand);
    const gap = 0.3;
    const cw = (W - 2 * M - 2 * gap) / 3;
    list.forEach(function (f, i) {
      const x = M + i * (cw + gap);
      const y = 2.4;
      const h = 3.65;
      card(s, x, y, cw, h);
      s.rect({ x: x, y: y, w: cw, h: 0.09, fill: brand });
      s.text({ x: x + 0.3, y: y + 0.28, w: cw - 0.6, h: 0.3, text: (i + 1) + '   ' + (f.kind === 'add' ? 'ADD A SECTION' : 'IMPROVE A SECTION') + (f.rising ? '  ·  RISING' : ''), size: 11, bold: true, color: darken(brand, 0.1) });
      s.text({ x: x + 0.3, y: y + 0.62, w: cw - 0.6, h: 0.8, text: clip(f.theme, 48), size: 19, bold: true });
      s.text({ x: x + 0.3, y: y + 1.45, w: cw - 0.6, h: 0.8, runs: [{ text: '+' + n0(f.more), size: 44, bold: true, color: brand }, { text: '  answered a month', size: 13, color: MUTED }], valign: 'middle' });
      s.text({ x: x + 0.3, y: y + 2.25, w: cw - 0.6, h: 0.3, text: '≈ ' + hrs(f.hours) + ' staff hours a month  ·  ' + n0(f.tickets) + ' tickets now', size: 11, color: MUTED });
      s.line({ x1: x + 0.3, y1: y + 2.65, x2: x + cw - 0.3, y2: y + 2.65, color: 'D3D9E3' });
      s.text({ x: x + 0.3, y: y + 2.75, w: cw - 0.6, h: 0.85, text: '“' + clip(f.example, 70) + '”', size: 12, italic: true, color: INK });
    });
    s.text({ x: M, y: 6.3, w: W - 2 * M, h: 0.5, runs: [
      { text: 'If all ' + (list.length === 1 ? 'is' : list.length === 3 ? 'three are' : 'are') + ' made:  ', size: 18, color: MUTED },
      { text: 'answer rate from ' + pct0(b.b.rate) + ' to about ' + pct0(b.projectedRate), size: 18, bold: true, color: INK },
      { text: b.projectedRate >= b.goal ? '  (reaches the ' + b.goal + '% goal)' : '  (goal is ' + b.goal + '%)', size: 18, color: MUTED }], valign: 'middle' });
    footer(s, b, n, total);
    s.notes = 'Estimate, not a promise: each fix is assumed to let the bot answer ' + Math.round(b.fixFactor.factor * 100) + '% of the repeat questions on its topic' +
      (b.fixFactor.fromHistory ? ' (the average of ' + b.fixFactor.n + ' of our own past updates)' : ' (a typical figure; there is not enough history yet)') +
      '. Staff hours assume ' + b.cfg.minutesPerTicket + ' minutes of a person\'s time per ticket.';
    return s;
  }

  // ---------- slide 6: return on updates ----------

  function roi(b, brand, n, total) {
    const s = new Slide();
    const r = b.roi;
    if (!r.count) {
      header(s, 'No manual updates are being tracked yet', 'Once a new section is published, its effect shows up here.', brand);
      card(s, M, 2.6, W - 2 * M, 2.4);
      s.text({ x: M + 0.5, y: 2.6, w: W - 2 * M - 1, h: 2.4, text: 'Publish the first change from the previous slide and next month\'s briefing will show how many questions it answered and how much time it saved.', size: 20, color: MUTED, valign: 'middle', align: 'center' });
      footer(s, b, n, total);
      s.notes = 'No sections were published during the period covered by the data.';
      return s;
    }
    header(s, 'Updates to the manual have saved about ' + hrs(r.hoursSince) + ' staff hours', r.count + ' section' + (r.count === 1 ? '' : 's') + ' published' + (r.newThisMonth ? ', ' + r.newThisMonth + ' of them in ' + b.range.name : '') + '. Here is what each one did.', brand);
    const gap = 0.3;
    const cw = (W - 2 * M - 2 * gap) / 3;
    const blocks = [
      { n: n0(r.answersSince), l: 'questions answered by updates', s: n0(r.answersThisMonth) + ' of them in ' + b.range.name, f: brand },
      { n: n0(r.fewerPerMonth), l: 'fewer tickets a month', s: 'on the topics these sections cover', f: darken(brand, 0.3) },
      { n: hrs(r.hoursSince), l: 'staff hours saved', s: hrs(r.hoursThisMonth) + ' in ' + b.range.name + ' (at ' + b.cfg.minutesPerTicket + ' min a ticket)', f: INK }
    ];
    blocks.forEach(function (bl, i) {
      const x = M + i * (cw + gap);
      s.rect({ x: x, y: 2.4, w: cw, h: 1.75, fill: bl.f, radius: 0.12 });
      s.text({ x: x + 0.3, y: 2.45, w: cw - 0.6, h: 0.95, text: bl.n, size: 50, bold: true, color: 'FFFFFF', valign: 'middle' });
      s.text({ x: x + 0.3, y: 3.4, w: cw - 0.6, h: 0.3, text: bl.l, size: 15, bold: true, color: 'FFFFFF' });
      s.text({ x: x + 0.3, y: 3.72, w: cw - 0.6, h: 0.3, text: bl.s, size: 11, color: 'E3E8F1' });
    });
    // Table
    const cols = [
      { h: 'Update', x: M, w: 4.6, a: 'left' },
      { h: 'Published', x: M + 4.6, w: 1.5, a: 'left' },
      { h: 'Answered since', x: M + 6.1, w: 1.8, a: 'right' },
      { h: 'Tickets a week', x: M + 8.0, w: 2.2, a: 'right' },
      { h: 'Hours saved', x: M + 10.3, w: 1.63, a: 'right' }
    ];
    const ty = 4.45;
    cols.forEach(function (c) { s.text({ x: c.x, y: ty, w: c.w, h: 0.3, text: c.h.toUpperCase(), size: 10, bold: true, color: MUTED, align: c.a }); });
    s.line({ x1: M, y1: ty + 0.33, x2: W - M, y2: ty + 0.33, color: 'C4CBD8' });
    r.updates.slice(0, 4).forEach(function (u, i) {
      const y = ty + 0.45 + i * 0.58;
      const d = new Date(u.publishedAt);
      const tw = u.ticketsBeforePerWeek != null && u.ticketsAfterPerWeek != null
        ? (Math.round(u.ticketsBeforePerWeek * 10) / 10) + '  →  ' + (Math.round(u.ticketsAfterPerWeek * 10) / 10) : 'n/a';
      const cells = [clip(u.title, 44), d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), n0(u.answersSince), tw, hrs(u.hoursSaved)];
      cols.forEach(function (c, j) {
        s.text({ x: c.x, y: y, w: c.w, h: 0.4, text: cells[j], size: 14, bold: j === 0 || j === 4, color: j === 3 ? GOOD : INK, align: c.a, valign: 'middle' });
      });
      if (i < Math.min(4, r.updates.length) - 1) s.line({ x1: M, y1: y + 0.5, x2: W - M, y2: y + 0.5, color: FAINT });
    });
    footer(s, b, n, total);
    s.notes = 'For each published update: questions on its topics that the bot answered since publishing; tickets a week in the four weeks before publishing compared with the weeks since; ' +
      'and staff hours = answered questions × ' + b.cfg.minutesPerTicket + ' minutes ÷ 60. "Fewer tickets a month" converts the weekly drop at 52 ÷ 12 weeks per month. ' +
      'These are estimates; some of the change may come from other causes.';
    return s;
  }

  // ---------- slide 7: next month ----------

  function next(b, brand, n, total) {
    const s = new Slide();
    const nm = nextMonthName(b);
    header(s, 'Next month: aim for ' + pct0(Math.max(b.projectedRate || 0, b.b.rate || 0)) + ' answered', 'What the team will do in ' + nm + ', and what to watch.', brand);
    const hasNote = !!String(b.cfg.note || '').trim();
    const lw = hasNote ? 6.9 : W - 2 * M;
    // Plan
    s.text({ x: M, y: 2.45, w: lw, h: 0.35, text: 'THE PLAN', size: 12, bold: true, color: darken(brand, 0.1) });
    const plan = b.fixes.map(function (f) { return (f.kind === 'add' ? 'Add  —  ' : 'Improve  —  ') + clip(f.theme, 52); });
    if (!plan.length) plan.push('Keep watching for repeat questions that go to a person.');
    plan.forEach(function (p, i) {
      const y = 2.85 + i * 0.62;
      s.oval({ x: M, y: y + 0.04, w: 0.4, h: 0.4, fill: brand });
      s.text({ x: M, y: y + 0.04, w: 0.4, h: 0.4, text: String(i + 1), size: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
      s.text({ x: M + 0.6, y: y, w: lw - 0.6, h: 0.48, text: p, size: 17, valign: 'middle' });
    });
    if (b.review.length) {
      const y = 2.85 + Math.max(plan.length, 1) * 0.62 + 0.25;
      s.text({ x: M, y: y, w: lw, h: 0.35, text: 'ALSO TO REVIEW', size: 12, bold: true, color: WARN });
      const txt = b.review.slice(0, 3).map(function (r) { return r.flag === 'unused' ? r.title + ' (never used)' : r.title + ' (' + Math.round(r.unclearRate) + '% unclear)'; }).join('   ·   ');
      s.text({ x: M, y: y + 0.38, w: lw, h: 0.7, text: clip(txt, 130), size: 13, color: MUTED });
    }
    // Target strip
    s.rect({ x: M, y: 5.85, w: lw, h: 0.95, fill: tint(brand, 0.88), radius: 0.12 });
    s.text({ x: M + 0.3, y: 5.85, w: lw - 0.6, h: 0.95, runs: [
      { text: pct0(b.b.rate) + '  →  ', size: 24, bold: true, color: MUTED },
      { text: pct0(Math.max(b.projectedRate || 0, b.b.rate || 0)), size: 30, bold: true, color: brand },
      { text: '   about ' + n0(b.moreFromFixes) + ' more answers a month', size: 14, color: MUTED }], valign: 'middle' });
    // Note from the team
    if (hasNote) {
      const nx = M + lw + 0.45;
      const nw = W - M - nx;
      card(s, nx, 2.45, nw, 4.35, INK);
      s.text({ x: nx + 0.35, y: 2.65, w: nw - 0.7, h: 0.35, text: 'FROM THE OPERATIONS TEAM', size: 12, bold: true, color: tint(brand, 0.55) });
      s.text({ x: nx + 0.35, y: 3.1, w: nw - 0.7, h: 3.5, text: clip(b.cfg.note, 420), size: 16, color: 'FFFFFF' });
    }
    footer(s, b, n, total);
    s.notes = 'The target is the projected answer rate if the listed changes are made, an estimate based on how well past updates worked. ' +
      'Staff can add a personal note in the Briefing Maker and it will appear here.';
    return s;
  }
  function nextMonthName(b) {
    const d = new Date(b.range.end);
    return d.toLocaleDateString('en-US', { month: 'long' });
  }

  // ---------- email text ----------

  function email(b) {
    const subject = 'Operating manual briefing, ' + b.range.label + ': ' + pct0(b.b.rate) + ' of questions answered by the bot';
    const lines = [
      'Hello,', '',
      'Attached is the ' + b.range.label + ' operating manual briefing (7 slides, about a two-minute read).', '',
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
    const brand = hex(b.cfg.brand) || '0F766E';
    const total = 7;
    const slides = [
      cover(b, brand, total),
      headline(b, brand, 2, total),
      trend(b, brand, 3, total),
      reasons(b, brand, 4, total),
      fixes(b, brand, 5, total),
      roi(b, brand, 6, total),
      next(b, brand, 7, total)
    ];
    return { w: W, h: H, font: FONT, slides: slides, email: email(b), fileBase: 'Board-Briefing-' + b.range.ym };
  }

  return { build: build, W: W, H: H, FONT: FONT, verdict: verdict, email: email };
});
