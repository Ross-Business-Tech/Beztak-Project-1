/*
 * App shell: sidebar / tab bar, the month picker and file controls, simple routing, keyboard shortcuts.
 */
(function () {
  'use strict';
  const Q = window.QAD;
  const U = Q.ui;
  const h = U.h;
  const A = Q.A;
  const svc = Q.svc;
  const ui = A.ui;
  const $ = function (id) { return document.getElementById(id); };

  const VIEWS = [
    { id: 'overview', label: 'Overview', icon: 'overview' },
    { id: 'fixes', label: 'Fix list', icon: 'fixes' },
    { id: 'results', label: 'Results', icon: 'results' },
    { id: 'manual', label: 'Manual health', short: 'Manual', icon: 'manual' },
    { id: 'reports', label: 'Reports', icon: 'reports' }
  ];
  let ready = false; // set once the saved file has been looked for
  let navButtons = {};
  let monthSelects = [];
  let statusLines = [];
  let lastSent = null;

  // ---------- chrome ----------

  function buildNav() {
    const nav = $('nav');
    VIEWS.forEach(function (v) {
      const badge = v.id === 'fixes' ? h('span', { class: 'badge', id: 'fix-badge', hidden: true }) : null;
      const dot = v.id === 'reports' ? h('span', { class: 'dot', id: 'rep-dot', hidden: true, title: 'An update is due' }) : null;
      const b = h('button', { type: 'button', class: 'nav-i', 'data-view': v.id, onclick: function () { go(v.id); } },
        A.icon(v.icon), h('span', { class: 'lbl' }, v.short ? h('span', { class: 'long' }, v.label) : v.label, v.short ? h('span', { class: 'short' }, v.short) : null), badge, dot);
      nav.append(b);
      navButtons[v.id] = b;
    });
  }

  function controls(where) {
    const sel = h('select', { class: 'month', 'aria-label': 'Month to report', hidden: true });
    sel.addEventListener('change', function () { svc.setMonth(sel.value); });
    monthSelects.push(sel);
    const add = h('button', { type: 'button', class: 'btn ghost', onclick: function () { $('file').click(); } }, A.icon('plus'), h('span', { class: 'txt' }, 'Add file'));
    const set = h('button', { type: 'button', class: 'btn ghost', 'aria-haspopup': 'dialog', onclick: openSettings }, A.icon('settings'), h('span', { class: 'txt' }, 'Settings'));
    const status = h('p', { class: 'datastatus' });
    statusLines.push(status);
    where.append(sel, h('div', { class: 'ctl-row' }, add, set), status);
  }

  function openSettings() {
    const d = $('settings');
    A.settings(d);
    if (!d.open) d.showModal();
  }

  function syncChrome() {
    const st = svc.state;
    const has = !!st.brief;
    monthSelects.forEach(function (sel) {
      sel.hidden = !has;
      if (!has) return;
      sel.replaceChildren();
      st.months.slice().reverse().forEach(function (m) { sel.append(h('option', { value: m.ym, selected: m.ym === st.ym }, m.label + (m.complete ? '' : ' (incomplete)'))); });
      sel.value = st.ym;
    });
    statusLines.forEach(function (p) { p.textContent = has ? U.n0(st.records.length) + ' questions · ' + st.source + (st.kept ? ' · kept in this browser' : '') : 'No file loaded yet'; });
    document.body.classList.toggle('has-data', has);
    Object.keys(navButtons).forEach(function (k) { navButtons[k].disabled = !has; });
    syncBadges();
  }

  function syncBadges() {
    const has = !!svc.state.brief;
    const badge = $('fix-badge');
    if (badge) { const n = has ? svc.counts().open : 0; badge.textContent = n; badge.hidden = !n; }
    const due = svc.updates.due();
    const dot = $('rep-dot');
    if (dot) dot.hidden = !due.length;
    const banner = $('banner');
    banner.replaceChildren();
    if (has && due.length) {
      banner.append(h('div', { class: 'banner due', role: 'status' }, h('span', {}, due.map(svc.updates.titleOf).join(' and ') + (due.length > 1 ? ' are' : ' is') + ' due to be sent.'),
        h('button', { type: 'button', class: 'btn sm', onclick: function () { go('reports'); } }, 'Review and send')));
    }
    const m = svc.state;
    if (has && m.message && m.messageKind !== 'ok') {
      banner.append(h('div', { class: 'banner ' + (m.messageKind === 'err' ? 'err' : 'warn'), role: 'status' }, h('span', {}, m.message), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Dismiss', onclick: function (e) { e.currentTarget.parentNode.remove(); } }, A.icon('close'))));
    }
  }

  // ---------- routing ----------

  function go(view, noHash) {
    ui.view = view;
    if (!noHash && location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
    A.fixes.closePanel();
    render();
    window.scrollTo(0, 0);
  }

  function openGap(key, keepFocus) {
    if (ui.view !== 'fixes') {
      ui.tab = Q.decision.get(key).status;
      ui.search = ''; ui.cat = '';
      ui.view = 'fixes';
      if (location.hash !== '#fixes') history.replaceState(null, '', '#fixes');
      render();
    }
    A.fixes.openPanel(key, keepFocus);
  }

  function render() {
    const b = svc.state.brief;
    const view = $('view');
    document.body.dataset.view = b ? ui.view : 'hero';
    if (!b) { if (ready) A.hero(view); syncChrome(); return; }
    Object.keys(navButtons).forEach(function (k) { if (k === ui.view) navButtons[k].setAttribute('aria-current', 'page'); else navButtons[k].removeAttribute('aria-current'); });
    if (ui.view !== 'fixes') A.fixes.closePanel();
    // Tell the desk which tab is showing (for jumps like "open this gap" from the overview).
    if (window.GAP_EMBEDDED && window.parent !== window && lastSent !== ui.view) { lastSent = ui.view; window.parent.postMessage({ type: 'gap-tracker:view', view: ui.view }, location.origin); }
    ({ overview: A.overview.render, fixes: function (el) { A.fixes.render(el); }, results: A.results, manual: A.manual, reports: A.reports }[ui.view] || A.overview.render)(view, b);
    syncChrome();
  }

  // ---------- events ----------

  function init() {
    buildNav();
    controls($('side-f'));
    const top = $('topbar');
    top.append(h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }), h('b', {}, 'Manual Gap Tracker')));
    const tc = h('div', { class: 'top-ctl' });
    controls(tc);
    top.append(tc);

    svc.on('brief', function () {
      if (svc.state.brief && ui.panelKey && !svc.find(ui.panelKey)) A.fixes.closePanel();
      render();
      if (ui.panelKey) A.fixes.renderPanel();
    });
    svc.on('message', function (m) {
      const el = $('status');
      if (el && m) { el.textContent = m.text; el.className = 'status ' + m.kind; }
      if (m && m.kind === 'err' && svc.state.brief) U.toast(m.text, true);
    });
    svc.on('decisions', function () { A.fixes.refresh(); syncBadges(); });
    svc.on('updates', function () { if (svc.state.brief) syncBadges(); });

    $('file').addEventListener('change', function (e) { svc.loadFile(e.target.files[0]); e.target.value = ''; });
    $('restore').addEventListener('change', function (e) { if (e.target.files[0]) svc.restore(e.target.files[0]); e.target.value = ''; });
    // Drop a file anywhere on the page.
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { if (e.target.closest && e.target.closest('#drop')) return; e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files[0]) svc.loadFile(e.dataTransfer.files[0]); });

    window.addEventListener('hashchange', function () { const v = location.hash.slice(1); if (VIEWS.some(function (x) { return x.id === v; }) && v !== ui.view && svc.state.brief) go(v, true); });

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ($('settings').open) return;
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (e.key === 'Escape') {
        if (typing && tag !== 'select') { e.target.blur(); return; }
        if (ui.panelKey) { A.fixes.closePanel(); }
        return;
      }
      if (typing || ui.view !== 'fixes' || !svc.state.brief) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); A.fixes.moveHi(1); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); A.fixes.moveHi(-1); }
      else if (e.key === '/') { e.preventDefault(); const s = $('fix-search'); if (s) s.focus(); }
      else if (e.key === 'Enter' && tag !== 'button' && tag !== 'summary' && ui.visible[ui.hi]) { e.preventDefault(); A.fixes.openPanel(ui.visible[ui.hi]); }
    });

    A.actions.go = go;
    A.actions.openGap = openGap;

    const wanted = location.hash.slice(1);
    if (VIEWS.some(function (x) { return x.id === wanted; })) ui.view = wanted;
    render();
    svc.init().then(function () { ready = true; if (!svc.state.brief) render(); }, function () { ready = true; render(); });
  }

  init();
})();
