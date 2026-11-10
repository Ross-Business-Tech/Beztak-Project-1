/*
 * Shared bits for the Strategist screens: icons, small components and the shared view state.
 * Anything that came from the questions file is added as text, never as HTML.
 */
(function () {
  'use strict';
  const Q = window.QAD;
  const U = Q.ui;
  const h = U.h;
  const S = U.s;

  const ICONS = {
    overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
    fixes: 'M9 6h12M9 12h12M9 18h12M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17',
    results: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    manual: 'M4 5a2 2 0 012-2h13v15H6a2 2 0 00-2 2zM4 20a2 2 0 002 2h13',
    reports: 'M3 6h18v12H3zM3 7l9 7 9-7',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
    plus: 'M12 5v14M5 12h14',
    close: 'M6 6l12 12M18 6L6 18',
    copy: 'M9 9h11v11H9zM5 15V5h10',
    chevron: 'M9 6l6 6-6 6',
    up: 'M6 15l6-6 6 6',
    down: 'M6 9l6 6 6-6',
    check: 'M5 12l5 5 9-10',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
    download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14'
  };
  function icon(name) {
    return S('svg', { viewBox: '0 0 24 24', class: 'ic', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, S('path', { d: ICONS[name] }));
  }

  // Shared view state (what is selected, filters). Lives only while the page is open.
  const ui = { view: 'overview', tab: 'todo', cat: '', search: '', panelKey: null, hi: 0, visible: [], sectionFilter: 'all' };

  const round = function (n) { return Math.round(n); };
  const pct = function (n) { return n == null ? '—' : Math.round(n) + '%'; };

  /** A change against last month. upIsGood decides green or red. */
  function delta(now, before, o) {
    if (now == null || before == null) return h('p', { class: 'delta none' }, 'No earlier month to compare');
    const d = now - before;
    if (Math.abs(d) < (o.min || 0.05)) return h('p', { class: 'delta none' }, 'No change from ' + o.prev);
    const good = o.upIsGood ? d > 0 : d < 0;
    return h('p', { class: 'delta ' + (good ? 'good' : 'bad') }, (d > 0 ? '▲ ' : '▼ ') + o.fmt(Math.abs(d)) + ' vs ' + o.prev);
  }

  function chip(text, cls) { return h('span', { class: 'chip ' + (cls || '') }, text); }
  function statusChip(id) { return h('span', { class: 'chip st-' + id }, Q.statusLabel(id)); }

  /** Floating tooltip inside a positioned wrapper. */
  function tooltip(wrap) {
    const tip = h('div', { class: 'tip', role: 'status', hidden: true });
    wrap.append(tip);
    return {
      show: function (x, y, nodes) {
        tip.replaceChildren.apply(tip, [].concat(nodes));
        tip.hidden = false;
        const w = wrap.clientWidth;
        const tw = tip.offsetWidth;
        tip.style.left = Math.max(4, Math.min(w - tw - 4, x - tw / 2)) + 'px';
        tip.style.top = Math.max(0, y - tip.offsetHeight - 12) + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }

  function empty(title, text, action) {
    return h('div', { class: 'empty' }, h('b', {}, title), text ? h('p', {}, text) : null, action || null);
  }

  function pageHead(title, lede, right) {
    return h('header', { class: 'page-h' }, h('div', {}, h('h1', {}, title), lede ? h('p', { class: 'lede' }, lede) : null), right || null);
  }

  Q.A = { icon: icon, ui: ui, round: round, pct: pct, delta: delta, chip: chip, statusChip: statusChip, tooltip: tooltip, empty: empty, pageHead: pageHead, actions: {} };
})();
