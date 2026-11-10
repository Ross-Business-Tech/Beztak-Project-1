/*
 * Fix list: a dense table you can drive from the keyboard, and a detail panel on the right
 * with the wording to start from and the controls to decide, assign and track each fix.
 */
(function () {
  'use strict';
  const Q = window.QAD;
  const U = Q.ui;
  const h = U.h;
  const A = Q.A;
  const svc = Q.svc;
  const IM = Q.improve;
  const D = Q.data;
  const decision = Q.decision;
  const ui = A.ui;

  const TABS = [
    { id: 'todo', label: 'To do' },
    { id: 'doing', label: 'In progress' },
    { id: 'done', label: 'Done' },
    { id: 'dismissed', label: 'Dismissed' }
  ];

  let root = null;
  let tbody = null;
  let tabsEl = null;

  function ownerCell(c) {
    const a = decision.get(c.key);
    return a.owner ? h('span', { class: 'owner' }, h('i', { class: 'av' }, a.owner.trim().charAt(0).toUpperCase()), a.owner) : h('span', { class: 'muted' }, 'Unassigned');
  }

  function matches(c) {
    if (ui.cat && c.category !== ui.cat) return false;
    const q = U.norm(ui.search);
    if (!q) return true;
    return U.norm(c.theme).indexOf(q) >= 0 || U.norm(c.category).indexOf(q) >= 0 || c.questions.some(function (x) { return U.norm(x.text).indexOf(q) >= 0; });
  }

  function paintRows() {
    const b = svc.state.brief;
    const max = Math.max.apply(null, b.changes.map(function (c) { return c.tickets; }).concat([1]));
    const shown = svc.itemsFor(ui.tab).filter(matches).sort(function (a, z) { return (a.rank || 999) - (z.rank || 999) || z.tickets - a.tickets; });
    ui.visible = shown.map(function (c) { return c.key; });
    if (ui.hi >= shown.length) ui.hi = Math.max(0, shown.length - 1);
    tbody.replaceChildren();
    shown.forEach(function (c, i) {
      const a = decision.get(c.key);
      const tr = h('tr', { class: 'r' + (i === ui.hi ? ' hi' : '') + (ui.panelKey && U.norm(ui.panelKey) === U.norm(c.key) ? ' sel' : ''), tabindex: '0', 'data-key': c.key, 'aria-label': svc.verb(c) + ' ' + c.theme + ', ' + c.tickets + ' tickets' });
      tr.addEventListener('click', function () { ui.hi = i; A.actions.openGap(c.key); });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); A.actions.openGap(c.key); } });
      tr.addEventListener('focus', function () { ui.hi = i; });
      tr.append(
        h('td', { class: 'c-rk' }, c.rank || '–'),
        h('td', { class: 'c-fix' }, h('b', {}, A.chip(ui.tab === 'done' ? (c.kind === 'add' ? 'Added' : 'Clarified') : svc.verb(c), 'verb ' + c.kind), ' ', c.theme, c.rising ? A.chip('Rising', 'rising') : null),
          h('span', { class: 'sub block clip' }, c.category + '  ·  “' + c.example + '”')),
        h('td', { class: 'c-tk' }, h('b', {}, U.n0(c.tickets)), h('i', { class: 'mini', 'aria-hidden': 'true' }, h('u', { style: 'width:' + Math.max(4, (c.tickets / max) * 100) + '%' }))),
        h('td', { class: 'c-est hide-sm' }, '≈ ' + U.n0(c.more)),
        h('td', { class: 'c-ow hide-sm' }, ownerCell(c)),
        h('td', { class: 'c-st' }, A.statusChip(a.status)));
      tbody.append(tr);
    });
    if (!shown.length) {
      const msg = ui.search || ui.cat ? 'No gaps match. Try a different search or category.' : {
        todo: 'Nothing to do. Every gap has been picked up.',
        doing: 'Nothing in progress. Open a gap and choose “In progress” when someone starts on it.',
        done: 'No fixes marked done yet. Completed fixes are listed under Results.',
        dismissed: 'Nothing dismissed.'
      }[ui.tab];
      tbody.append(h('tr', {}, h('td', { colspan: '6', class: 'none' }, msg)));
    }
  }

  function paintTabs() {
    const n = svc.counts();
    tabsEl.replaceChildren();
    TABS.forEach(function (t) {
      tabsEl.append(h('button', { type: 'button', role: 'tab', class: 'tab' + (ui.tab === t.id ? ' on' : ''), 'aria-selected': String(ui.tab === t.id), onclick: function () { ui.tab = t.id; ui.hi = 0; paintTabs(); paintRows(); } },
        t.label, h('span', { class: 'ct' }, n[t.id])));
    });
  }

  function render(el) {
    root = el;
    const b = svc.state.brief;
    const n = svc.counts();
    const open = svc.openItems();
    const gain = open.reduce(function (a, c) { return a + c.more; }, 0);
    const lede = open.length ? n.open + ' open. Doing them all could let the bot answer about ' + U.n0(gain) + ' more questions a month. Ranked by tickets over ' + b.window.label + '.' : 'Nothing is waiting right now.';
    tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Filter by status' });
    const search = h('input', { type: 'search', id: 'fix-search', placeholder: 'Search topics or questions  (press /)', 'aria-label': 'Search fixes', value: ui.search });
    search.addEventListener('input', function () { ui.search = search.value; ui.hi = 0; paintRows(); });
    const cats = Array.from(new Set(b.changes.map(function (c) { return c.category; }))).sort();
    const catSel = h('select', { 'aria-label': 'Filter by category', onchange: function () { ui.cat = catSel.value; ui.hi = 0; paintRows(); } },
      h('option', { value: '' }, 'All categories'), cats.map(function (c) { return h('option', { value: c, selected: ui.cat === c }, c); }));
    tbody = h('tbody', {});
    const table = h('table', { class: 'tbl fixes' },
      h('thead', {}, h('tr', {}, h('th', { class: 'c-rk' }, '#'), h('th', {}, 'Fix'), h('th', { class: 'c-tk' }, 'Tickets'), h('th', { class: 'c-est hide-sm' }, 'Fewer / month'), h('th', { class: 'c-ow hide-sm' }, 'Owner'), h('th', {}, 'Status'))), tbody);
    root.replaceChildren(h('div', { class: 'page' },
      A.pageHead('Fix list', lede),
      h('div', { class: 'toolbar' }, tabsEl, h('div', { class: 'filters' }, h('label', { class: 'searchbox' }, A.icon('search'), search), catSel)),
      h('div', { class: 'card flush' }, h('div', { class: 'scroll' }, table)),
      h('p', { class: 'hint hide-sm' }, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' move  ', h('kbd', {}, 'Enter'), ' open  ', h('kbd', {}, 'Esc'), ' close  ', h('kbd', {}, '/'), ' search')));
    paintTabs();
    paintRows();
  }

  /** Refresh counts and rows after a decision, without disturbing the panel. */
  function refresh() {
    if (ui.view === 'fixes' && tbody) { paintTabs(); paintRows(); }
  }

  function moveHi(d) {
    if (!ui.visible.length) return;
    ui.hi = Math.max(0, Math.min(ui.visible.length - 1, ui.hi + d));
    const rows = tbody.querySelectorAll('tr.r');
    rows.forEach(function (r, i) { r.classList.toggle('hi', i === ui.hi); });
    const row = rows[ui.hi];
    if (row) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'nearest' }); }
    if (ui.panelKey) A.actions.openGap(ui.visible[ui.hi], true);
  }

  // ---------- the detail panel ----------

  function resultLine(tr, liveMs) {
    if (!tr.ready) return h('p', { class: 'result wait' }, 'Waiting for data. A week of questions after ' + (liveMs ? U.fmtShort(liveMs) : 'the go-live date') + ' is needed before we can say if it worked. Add newer questions to update this.');
    return h('div', { class: 'result' },
      h('p', { class: 'ba' }, h('span', { class: 'was' }, U.n1(tr.beforePerWeek)), ' → ', h('b', {}, U.n1(tr.afterPerWeek)), h('span', { class: 'sub' }, ' tickets a week, before and after')),
      tr.cutPct != null ? h('p', { class: 'cut' }, '▼ ' + tr.cutPct + '% fewer tickets on this topic') : h('p', { class: 'sub' }, 'There were no tickets on this topic before.'),
      h('p', { class: 'sub' }, '≈ ' + U.n0(tr.avoided) + ' tickets avoided, ≈ ' + U.hours(tr.hours) + ' staff hours saved'));
  }

  function panelEl() { return document.getElementById('panel'); }

  function renderPanel() {
    const p = panelEl();
    const c = ui.panelKey ? svc.find(ui.panelKey) : null;
    if (!c) { closePanel(); return; }
    const a = decision.get(c.key);
    const keys = ui.visible;
    const idx = keys.findIndex(function (k) { return U.norm(k) === U.norm(c.key); });
    const bar = h('div', { class: 'panel-bar' },
      h('div', { class: 'steps' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous fix', disabled: idx <= 0, onclick: function () { A.actions.openGap(keys[idx - 1], true); } }, A.icon('up')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next fix', disabled: idx < 0 || idx >= keys.length - 1, onclick: function () { A.actions.openGap(keys[idx + 1], true); } }, A.icon('down')),
        idx >= 0 ? h('span', { class: 'muted' }, (idx + 1) + ' of ' + keys.length) : null),
      h('button', { type: 'button', class: 'icon-btn', id: 'panel-close', 'aria-label': 'Close details', onclick: closePanel }, A.icon('close')));

    const head = h('header', { class: 'panel-h' },
      h('div', { class: 'tags' }, A.chip(svc.typeWords(c), 'verb ' + c.kind), A.statusChip(a.status), c.rising ? A.chip('Rising', 'rising') : null),
      h('h2', { id: 'panel-title' }, c.theme),
      h('p', { class: 'sub' }, c.category + (c.section ? '  ·  Related section: ' + c.section : '')));

    const facts = c.synthetic ? null : h('div', { class: 'facts' },
      h('div', {}, h('b', {}, U.n0(c.tickets)), h('span', {}, 'tickets, ' + svc.state.brief.window.label)),
      h('div', {}, h('b', {}, A.round(c.answeredShare) + '%'), h('span', {}, 'answered today')),
      h('div', {}, h('b', {}, '≈ ' + U.n0(c.more)), h('span', {}, 'fewer a month if fixed')));

    // Wording
    const wording = h('section', { class: 'blk' }, h('h3', {}, 'Wording to start from'));
    if (c.notes.length) {
      const top = c.notes[0];
      wording.append(h('blockquote', { class: 'quote' }, h('p', {}, top.text), h('div', { class: 'quote-f' },
        h('span', { class: 'sub' }, 'Staff said this ' + U.plural(top.count, 'time') + ', last ' + U.fmtDay(top.last)),
        h('button', { type: 'button', class: 'btn sm', onclick: function () { U.copyText(top.text); } }, A.icon('copy'), 'Copy'))));
      if (c.notes.length > 1) wording.append(h('details', { class: 'more' }, h('summary', {}, 'Other answers staff gave (' + (c.notes.length - 1) + ')'),
        c.notes.slice(1, 6).map(function (n) { return h('blockquote', { class: 'quote alt' }, h('p', {}, n.text), h('div', { class: 'quote-f' }, h('span', { class: 'sub' }, U.plural(n.count, 'time') + ', last ' + U.fmtDay(n.last)), h('button', { type: 'button', class: 'btn sm', onclick: function () { U.copyText(n.text); } }, A.icon('copy'), 'Copy'))); })));
    } else wording.append(h('p', { class: 'muted' }, 'No resolution notes for this topic yet. Ask whoever handled the tickets how they answered.'));

    // How employees ask
    const groups = IM.groupQuestions(c.questions);
    const asking = h('section', { class: 'blk' }, h('h3', {}, 'How employees ask it'),
      h('p', { class: 'sub' }, U.plural(c.questions.length, 'question') + ' in ' + U.plural(groups.length, 'different wording') + '. Use these words in the new text.'));
    const gl = h('ul', { class: 'asked' });
    const paint = function (all) {
      gl.replaceChildren();
      (all ? groups : groups.slice(0, 5)).forEach(function (g) { gl.append(h('li', {}, h('span', { class: 'q' }, '“' + g.text + '”'), h('span', { class: 'x' }, '× ' + g.count))); });
    };
    paint(false);
    asking.append(gl);
    if (groups.length > 5) {
      let all = false;
      const btn = h('button', { type: 'button', class: 'linkbtn', onclick: function () { all = !all; paint(all); btn.textContent = all ? 'Show fewer' : 'Show all ' + groups.length + ' wordings'; } }, 'Show all ' + groups.length + ' wordings');
      asking.append(btn);
    }

    // Decision controls
    const saved = h('span', { class: 'saved', role: 'status' }, a.at ? 'Saved ' + U.fmtDay(a.at) : '');
    const flash = function () { saved.textContent = 'Saved'; };
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Status' }, Q.STATUS.map(function (st) {
      const on = a.status === st.id;
      return h('button', { type: 'button', role: 'radio', class: 's-' + st.id + (on ? ' on' : ''), 'aria-checked': String(on), onclick: function () { svc.decide(c, { status: st.id }); renderPanel(); } }, st.label);
    }));
    const ownerIn = h('input', { type: 'text', id: 'f-owner', list: 'f-owners', maxlength: '80', placeholder: 'Type a name', value: a.owner, autocomplete: 'off' });
    ownerIn.addEventListener('change', function () { svc.decide(c, { owner: ownerIn.value.trim() }); renderPanel(); });
    const team = svc.settings.people();
    const chips = team.length ? h('div', { class: 'team' }, team.map(function (t) {
      return h('button', { type: 'button', class: 'chipbtn' + (a.owner === t ? ' on' : ''), 'aria-pressed': String(a.owner === t), onclick: function () { svc.decide(c, { owner: a.owner === t ? '' : t }); renderPanel(); } }, t);
    })) : null;
    const dueIn = h('input', { type: 'date', id: 'f-due', value: a.due });
    dueIn.addEventListener('change', function () { svc.decide(c, { due: dueIn.value }); flash(); });
    const notesIn = h('textarea', { id: 'f-notes', rows: '3', maxlength: '2000', placeholder: 'Anything the owner should know' });
    notesIn.value = a.notes;
    let t = null;
    notesIn.addEventListener('input', function () { saved.textContent = 'Saving…'; clearTimeout(t); t = setTimeout(function () { svc.decide(c, { notes: notesIn.value }); flash(); }, 350); });
    notesIn.addEventListener('blur', function () { clearTimeout(t); if (notesIn.value !== decision.get(c.key).notes) { svc.decide(c, { notes: notesIn.value }); flash(); } });

    const ctl = h('section', { class: 'blk ctl' }, h('h3', {}, 'Progress'), seg,
      h('div', { class: 'two-f' },
        h('div', {}, h('label', { class: 'field', for: 'f-owner' }, 'Owner'), ownerIn, h('datalist', { id: 'f-owners' }, team.map(function (n) { return h('option', { value: n }); }))),
        h('div', {}, h('label', { class: 'field', for: 'f-due' }, 'Due date'), dueIn)),
      chips);
    if (a.status === 'done') {
      const liveIn = h('input', { type: 'date', id: 'f-live', value: a.liveOn });
      liveIn.addEventListener('change', function () { svc.decide(c, { liveOn: liveIn.value }); renderPanel(); });
      ctl.append(h('div', { class: 'live' }, h('label', { class: 'field', for: 'f-live' }, 'Went live in the manual on'), liveIn,
        h('h4', {}, 'Did it work?'), resultLine(svc.trackFor(c), U.isoToMs(a.liveOn))));
    }
    ctl.append(h('label', { class: 'field', for: 'f-notes' }, 'Notes'), notesIn, saved);

    // Every ticket
    const cap = 300;
    const tb = h('tbody', {});
    c.questions.slice(0, cap).forEach(function (x) {
      tb.append(h('tr', {}, h('td', {}, U.fmtDay(x.at)), h('td', {}, x.ticketId || '—'),
        h('td', {}, h('span', { class: 'qt' }, '“' + x.text + '”'), x.note ? h('span', { class: 'sub block' }, 'Resolved: ' + x.note) : null),
        h('td', {}, h('span', { class: 'out ' + (x.answered ? 'ok' : 'gap') }, x.answered ? 'Answered' : (D.ESCALATION_LABELS[x.reason] || 'Sent to a person')))));
    });
    const every = h('details', { class: 'more blk' }, h('summary', {}, 'Every question (' + c.questions.length + ')'),
      h('div', { class: 'scroll' }, h('table', { class: 'tbl tight' }, h('thead', {}, h('tr', {}, ['Date', 'Ticket', 'Question', 'Outcome'].map(function (x) { return h('th', {}, x); }))), tb)),
      c.questions.length > cap ? h('p', { class: 'sub' }, 'Showing the newest ' + cap + ' of ' + c.questions.length + '.') : null);

    p.setAttribute('aria-labelledby', 'panel-title');
    p.replaceChildren(bar, h('div', { class: 'panel-body' }, head, facts, wording, ctl, asking, every));
  }

  function openPanel(key, keepFocus) {
    ui.panelKey = key;
    const p = panelEl();
    const wasHidden = p.hidden;
    p.hidden = false;
    document.getElementById('shell').classList.add('has-panel');
    renderPanel();
    if (wasHidden) p.scrollTop = 0;
    if (!keepFocus) { const x = document.getElementById('panel-close'); if (x) x.focus(); }
    if (tbody) {
      tbody.querySelectorAll('tr.r').forEach(function (r) { r.classList.toggle('sel', U.norm(r.getAttribute('data-key')) === U.norm(key)); });
      const i = ui.visible.findIndex(function (k) { return U.norm(k) === U.norm(key); });
      if (i >= 0) { ui.hi = i; tbody.querySelectorAll('tr.r').forEach(function (r, j) { r.classList.toggle('hi', j === i); }); }
    }
  }
  function closePanel() {
    const had = !panelEl().hidden;
    ui.panelKey = null;
    panelEl().hidden = true;
    document.getElementById('shell').classList.remove('has-panel');
    if (tbody) {
      tbody.querySelectorAll('tr.sel').forEach(function (r) { r.classList.remove('sel'); });
      const r = tbody.querySelectorAll('tr.r')[ui.hi];
      if (had && r) r.focus({ preventScroll: true });
    }
  }

  A.fixes = { render: render, refresh: refresh, openPanel: openPanel, closePanel: closePanel, moveHi: moveHi, renderPanel: renderPanel };
})();
