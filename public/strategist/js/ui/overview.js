/*
 * Overview: one sentence that says how things are, three numbers, the trend,
 * what to fix next, and where tickets come from. Detail stays one click away.
 */
(function () {
  'use strict';
  const Q = window.QAD;
  const U = Q.ui;
  const h = U.h;
  const S = U.s;
  const A = Q.A;
  const svc = Q.svc;

  // ---------- the verdict ----------

  function verdict(b) {
    const open = svc.openItems().slice(0, 3);
    if (b.rate == null) return { head: 'No questions in ' + b.range.label + '.', sub: 'Pick another month.' };
    const met = b.rate >= b.goal;
    let head = A.round(b.rate) + '% of questions were answered by the bot in ' + b.range.name;
    if (b.delta != null && Math.abs(b.delta) >= 0.5) head += ', ' + (b.delta > 0 ? 'up ' : 'down ') + U.n0(Math.abs(b.delta)) + ' points from ' + b.prevRange.name;
    head += met ? '. That meets your ' + b.goal + '% goal.' : '. That is ' + Math.max(1, Math.ceil(b.goal - b.rate)) + ' points short of your ' + b.goal + '% goal.';
    let sub;
    if (open.length) {
      const gain = open.reduce(function (a, c) { return a + c.more; }, 0);
      const lifted = b.eligible ? ((b.b.answered + gain) / b.eligible) * 100 : null;
      sub = 'The top ' + (open.length === 1 ? 'fix' : open.length + ' fixes') + ' could let the bot answer about ' + U.n0(gain) + ' more questions a month' + (lifted != null ? ', lifting the rate to about ' + A.round(lifted) + '%.' : '.');
    } else {
      sub = b.changes.length ? 'Every gap has been picked up or dismissed. Nice work.' : 'No topic reached three tickets, so there is nothing to fix right now.';
    }
    return { head: head, sub: sub };
  }

  // ---------- KPI tiles ----------

  function kpis(b) {
    const prev = b.prevRange.name;
    const mins = b.cfg.minutesPerTicket;
    const gapNow = b.b.fixable;
    const gapPrev = b.pb ? b.pb.fixable : null;
    const hrsNow = (gapNow * mins) / 60;
    const hrsPrev = gapPrev == null ? null : (gapPrev * mins) / 60;
    const met = b.rate != null && b.rate >= b.goal;
    const meter = h('div', { class: 'meter', role: 'img', 'aria-label': 'Answer rate ' + A.round(b.rate || 0) + ' percent, goal ' + b.goal + ' percent' },
      h('i', { class: 'fill' + (met ? ' ok' : ''), style: 'width:' + Math.max(0, Math.min(100, b.rate || 0)) + '%' }),
      h('i', { class: 'goal', style: 'left:' + Math.min(100, b.goal) + '%' }));
    return h('section', { class: 'kpis', 'aria-label': 'Key numbers' },
      h('article', { class: 'tile' },
        h('h2', {}, 'Answered by the bot'),
        h('p', { class: 'big' }, b.rate == null ? '—' : A.round(b.rate) + '%'),
        meter,
        h('p', { class: 'sub' }, 'Goal ' + b.goal + '%' + (b.rate != null ? (met ? ' · met' : ' · ' + Math.max(1, Math.ceil(b.goal - b.rate)) + ' points to go') : '')),
        A.delta(b.rate, b.prevRate, { upIsGood: true, prev: prev, fmt: function (d) { return U.n0(d) + ' pts'; }, min: 0.5 })),
      h('article', { class: 'tile' },
        h('h2', {}, 'Tickets from manual gaps'),
        h('p', { class: 'big' }, U.n0(gapNow)),
        h('p', { class: 'sub' }, 'The manual had nothing, or did not settle it'),
        A.delta(gapNow, gapPrev, { upIsGood: false, prev: prev, fmt: function (d) { return U.n0(d); }, min: 0.5 })),
      h('article', { class: 'tile' },
        h('h2', {}, 'Staff time on those tickets'),
        h('p', { class: 'big' }, U.hours(hrsNow), h('small', {}, ' hours')),
        h('p', { class: 'sub' }, 'At ' + mins + ' minutes a ticket'),
        A.delta(hrsNow, hrsPrev, { upIsGood: false, prev: prev, fmt: function (d) { return U.hours(d) + ' h'; }, min: 0.1 })));
  }

  // ---------- trend ----------

  function trendCard(b) {
    const card = h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Answer rate by month')));
    const pts = b.series.filter(function (p) { return p.rate != null; });
    if (pts.length < 2) { card.append(h('p', { class: 'muted pad' }, 'Add at least two full months of questions to see the trend.')); return card; }
    const wrap = h('div', { class: 'chart-wrap' });
    card.append(wrap);
    const ups = (b.roi.updates || []).slice().sort(function (a, z) { return a.publishedAt - z.publishedAt; });
    const legend = h('p', { class: 'legend' },
      h('span', { class: 'lg' }, h('i', { class: 'sw line' }), 'Answer rate'),
      h('span', { class: 'lg' }, h('i', { class: 'sw dash' }), 'Goal ' + b.goal + '%'),
      ups.length ? h('span', { class: 'lg' }, h('i', { class: 'sw dia' }), 'Manual update went live') : null);
    card.append(legend);

    const table = h('details', { class: 'more' }, h('summary', {}, 'View as table'),
      h('div', { class: 'scroll' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Month', 'Questions', 'Answer rate'].map(function (t) { return h('th', {}, t); }))),
        h('tbody', {}, b.series.map(function (p) { return h('tr', {}, h('td', {}, p.label), h('td', {}, U.n0(p.total)), h('td', {}, A.pct(p.rate))); })))));
    card.append(table);

    function draw() {
      const W = Math.max(260, (wrap.clientWidth || 616) - 16);
      const H = W < 420 ? 220 : 260;
      const L = 40, R = 16, T = 22, Bt = 34;
      const vals = pts.map(function (p) { return p.rate; }).concat([b.goal]);
      const lo = Math.max(0, Math.floor((Math.min.apply(null, vals) - 8) / 10) * 10);
      const hi = Math.min(100, Math.ceil((Math.max.apply(null, vals) + 6) / 10) * 10);
      const PAD = 18;
      const n = b.series.length;
      const step = (W - L - R - 2 * PAD) / ((n - 1) || 1);
      const xAt = function (i) { return L + PAD + i * step; };
      const yAt = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - Bt); };
      const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'chart', role: 'img', 'aria-label': 'Answer rate by month, from ' + A.pct(pts[0].rate) + ' to ' + A.pct(pts[pts.length - 1].rate) + '. Goal ' + b.goal + ' percent.' });
      for (let g = lo; g <= hi; g += 10) {
        svg.append(S('line', { x1: L, x2: W - R, y1: yAt(g), y2: yAt(g), class: 'grid' }), S('text', { x: L - 8, y: yAt(g) + 4, class: 'ax', 'text-anchor': 'end' }, g + '%'));
      }
      svg.append(S('line', { x1: L, x2: W - R, y1: yAt(b.goal), y2: yAt(b.goal), class: 'goalline' }));
      // manual updates
      const idx = function (ym) { return b.series.findIndex(function (p) { return p.ym === ym; }); };
      ups.forEach(function (u) {
        const dt = new Date(u.publishedAt);
        const j = idx(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'));
        if (j < 0) return;
        const dim = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
        const x = Math.max(L + PAD, Math.min(W - R - PAD, xAt(j) - step / 2 + (dt.getDate() / dim) * step));
        svg.append(S('line', { x1: x, x2: x, y1: T, y2: H - Bt, class: 'mark' }), S('path', { d: 'M' + x + ' ' + (T - 12) + ' l5 6 l-5 6 l-5 -6 z', class: 'diamond', 'data-update': u.title }, S('title', {}, u.title + ' went live ' + U.fmtShort(u.publishedAt))));
      });
      const path = b.series.map(function (p, i) { return p.rate == null ? null : (xAt(i) + ',' + yAt(p.rate)); }).filter(Boolean);
      svg.append(S('polyline', { points: path.join(' '), class: 'line', fill: 'none' }));
      const tip = A.tooltip(wrap);
      b.series.forEach(function (p, i) {
        const last = i === n - 1;
        svg.append(S('text', { x: xAt(i), y: H - 12, class: 'ax', 'text-anchor': 'middle' }, p.label));
        if (p.rate == null) return;
        const cy = yAt(p.rate);
        svg.append(S('circle', { cx: xAt(i), cy: cy, r: last ? 5 : 3.5, class: 'pt' + (last ? ' last' : '') }));
        if (last) svg.append(S('text', { x: xAt(i), y: cy - 12, class: 'val', 'text-anchor': 'middle' }, A.round(p.rate) + '%'));
        const show = function () {
          const prevP = i > 0 ? b.series[i - 1].rate : null;
          tip.show(xAt(i), cy, [h('b', {}, p.label + ': ' + A.round(p.rate) + '%'), h('span', {}, U.n0(p.answered) + ' answered of ' + U.n0(p.eligible) + ' the manual should cover'),
            prevP != null ? h('span', {}, (p.rate - prevP >= 0 ? '▲ ' : '▼ ') + U.n1(Math.abs(p.rate - prevP)) + ' pts vs ' + b.series[i - 1].label) : null]);
        };
        const hit = S('rect', { x: xAt(i) - Math.max(14, step / 2), y: T - 6, width: Math.max(28, step), height: H - T - Bt + 6, class: 'hit', tabindex: '0', 'aria-label': p.label + ' ' + A.pct(p.rate) });
        hit.addEventListener('mouseenter', show);
        hit.addEventListener('focus', show);
        hit.addEventListener('mouseleave', tip.hide);
        hit.addEventListener('blur', tip.hide);
        svg.append(hit);
      });
      const old = wrap.querySelector('svg');
      if (old) old.remove();
      wrap.prepend(svg);
    }
    requestAnimationFrame(draw);
    if (window.ResizeObserver) {
      let last = 0;
      new ResizeObserver(function () { const w = wrap.clientWidth; if (w && Math.abs(w - last) > 2) { last = w; draw(); } }).observe(wrap);
    }
    return card;
  }

  // ---------- fix next ----------

  function fixNext(b) {
    const open = svc.openItems();
    const card = h('section', { class: 'card' },
      h('div', { class: 'card-h' }, h('h2', {}, 'Fix next'), h('button', { type: 'button', class: 'btn sm', onclick: function () { A.actions.go('fixes'); } }, 'All ' + open.length + ' open', A.icon('chevron'))));
    if (!open.length) { card.append(h('p', { class: 'muted pad' }, b.changes.length ? 'Every gap is done or dismissed.' : 'No topic reached three tickets in ' + b.window.label + '.')); return card; }
    const list = h('ol', { class: 'rows' });
    open.slice(0, 3).forEach(function (c, i) {
      list.append(h('li', {}, h('button', { type: 'button', class: 'row', onclick: function () { A.actions.openGap(c.key); } },
        h('span', { class: 'rk' }, i + 1),
        h('span', { class: 'main' }, h('b', {}, A.chip(svc.verb(c), 'verb ' + c.kind), ' ', c.theme), h('span', { class: 'sub clip' }, '“' + c.example + '”')),
        h('span', { class: 'num' }, h('b', {}, U.n0(c.tickets)), h('span', { class: 'sub' }, 'tickets')))));
    });
    card.append(list);
    return card;
  }

  // ---------- where tickets come from ----------

  function reasonsCard(b) {
    const card = h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Where tickets come from'),
      h('span', { class: 'muted' }, U.n0(b.b.tickets) + ' tickets in ' + b.range.name)));
    if (!b.b.tickets) { card.append(h('p', { class: 'muted pad' }, 'No tickets this month.')); return card; }
    const bar = h('div', { class: 'stack', role: 'img', 'aria-label': b.reasons.map(function (r) { return r.label + ' ' + r.count; }).join(', ') });
    b.reasons.forEach(function (r) { if (r.count) bar.append(h('i', { class: 'sg r-' + r.key, style: 'flex:' + r.count, title: r.label + ': ' + r.count })); });
    card.append(bar);
    const list = h('ul', { class: 'reasons' });
    b.reasons.forEach(function (r) {
      list.append(h('li', {}, h('i', { class: 'sw r-' + r.key }),
        h('span', { class: 'rt' }, h('b', {}, r.label), A.chip(r.fixable ? 'Fixable' : 'By design', r.fixable ? 'fixable' : 'design'), h('span', { class: 'sub block' }, r.help)),
        h('span', { class: 'num' }, h('b', {}, U.n0(r.count)), h('span', { class: 'sub' }, A.round(r.pctOfTickets) + '%'))));
    });
    card.append(list);
    card.append(h('p', { class: 'foot' }, 'Only the fixable tickets count against the bot. ' + U.n0(b.byDesign) + ' went to a person on purpose, so the rate is ' + U.n0(b.b.answered) + ' ÷ ' + U.n0(b.eligible) + '.'));
    return card;
  }

  function topicsCard(b) {
    const t = b.topQuestions;
    const card = h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Most asked topics'), h('span', { class: 'muted' }, t.label + ' · ' + A.round(t.share) + '% of questions')));
    const max = Math.max.apply(null, t.rows.map(function (r) { return r.asked; }).concat([1]));
    const list = h('ul', { class: 'topics' });
    t.rows.forEach(function (r) {
      list.append(h('li', {},
        h('span', { class: 'tn' }, h('b', {}, r.theme), h('span', { class: 'sub block clip' }, '“' + r.example + '”')),
        h('span', { class: 'tbar', 'aria-hidden': 'true' }, h('i', { class: 'ans', style: 'width:' + (r.answered / max) * 100 + '%' }), h('i', { class: 'gap', style: 'width:' + (r.gaps / max) * 100 + '%' }), h('i', { class: 'des', style: 'width:' + (r.byDesign / max) * 100 + '%' })),
        h('span', { class: 'num' }, h('b', {}, U.n0(r.asked)), h('span', { class: 'sub' }, r.answeredShare == null ? '' : A.round(r.answeredShare) + '% answered'))));
    });
    card.append(list, h('p', { class: 'legend' }, h('span', { class: 'lg' }, h('i', { class: 'sw ans' }), 'Answered'), h('span', { class: 'lg' }, h('i', { class: 'sw gap' }), 'Manual gap'), h('span', { class: 'lg' }, h('i', { class: 'sw des' }), 'By design')));
    return card;
  }

  function checks() {
    const list = svc.dataChecks();
    if (!list.length) return null;
    return h('details', { class: 'checks' }, h('summary', {}, A.icon('down'), U.plural(list.length, 'data note'), h('span', { class: 'muted' }, ' · things that make the numbers less reliable')),
      h('ul', {}, list.map(function (c) { return h('li', {}, h('b', {}, c[0]), ' ', c[1]); })));
  }

  function render(root, b) {
    const v = verdict(b);
    root.replaceChildren(
      h('div', { class: 'page' },
        h('header', { class: 'page-h verdict' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Overview · ' + b.range.label), h('h1', {}, v.head), h('p', { class: 'lede' }, v.sub))),
        kpis(b),
        h('div', { class: 'grid2' }, trendCard(b), h('div', { class: 'stackcol' }, fixNext(b))),
        h('div', { class: 'grid2' }, reasonsCard(b), topicsCard(b)),
        checks() || document.createComment('')));
  }

  A.overview = { render: render };
})();
