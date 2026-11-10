/*
 * Results, Manual health, Reports, Settings and the first-run screen.
 */
(function () {
  'use strict';
  const Q = window.QAD;
  const U = Q.ui;
  const h = U.h;
  const A = Q.A;
  const svc = Q.svc;
  const ui = A.ui;

  // ---------- Results ----------

  function results(root, b) {
    const r = svc.results();
    const ready = r.rows.filter(function (x) { return x.ready && x.before != null && x.before > 0; });
    const avg = ready.length ? ready.reduce(function (a, x) { return a + Math.max(0, 1 - x.after / x.before); }, 0) / ready.length : null;
    const lede = r.rows.length
      ? 'About ' + U.hours(r.hours) + ' staff hours saved so far' + (avg != null ? ', with ' + A.round(avg * 100) + '% fewer tickets a week on average where we can measure it' : '') + '. Estimate: tickets that no longer happen × ' + b.cfg.minutesPerTicket + ' minutes.'
      : 'Once a manual update goes live, or you mark a gap Done with the date it went live, the before-and-after ticket count shows up here.';
    const page = h('div', { class: 'page' }, A.pageHead('Results', 'Did the fixes work?'),
      h('section', { class: 'tile wide' }, h('h2', {}, 'Staff time saved'), h('p', { class: 'big' }, r.rows.length ? '≈ ' + U.hours(r.hours) : '—', h('small', {}, ' hours')), h('p', { class: 'sub' }, lede)));
    if (!r.rows.length) {
      page.append(A.empty('No fixes tracked yet', 'Open a gap in the Fix list, mark it Done and say when it went live.', h('button', { type: 'button', class: 'btn primary', onclick: function () { A.actions.go('fixes'); } }, 'Go to the Fix list')));
    } else {
      const tb = h('tbody', {});
      r.rows.forEach(function (x) {
        let change;
        if (!x.ready || x.before == null) change = h('span', { class: 'muted' }, x.live > Date.now() - 7 * 864e5 ? 'Too soon to tell' : 'Waiting for more data');
        else if (x.before <= 0) change = h('span', { class: 'muted' }, 'No tickets before');
        else change = h('span', { class: 'cut' }, '▼ ' + (x.cutPct == null ? 0 : x.cutPct) + '% fewer');
        const title = x.key ? h('button', { type: 'button', class: 'linkbtn strong', onclick: function () { A.actions.openGap(x.key); } }, x.title) : h('b', {}, x.title);
        tb.append(h('tr', {},
          h('td', {}, title, h('span', { class: 'sub block' }, x.src + (x.answered != null ? ' · ' + U.n0(x.answered) + ' questions answered since' : ''))),
          h('td', {}, x.live ? U.fmtShort(x.live) : '—'),
          h('td', {}, x.before == null ? '—' : [h('span', { class: 'was' }, U.n1(x.before)), ' → ', h('b', {}, x.ready && x.after != null ? U.n1(x.after) : '?')]),
          h('td', {}, change),
          h('td', { class: 'hide-sm' }, x.hours ? '≈ ' + U.hours(x.hours) + ' h' : '—')));
      });
      page.append(h('div', { class: 'card flush' }, h('div', { class: 'scroll' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Fix'), h('th', {}, 'Live since'), h('th', {}, 'Tickets a week'), h('th', {}, 'Change'), h('th', { class: 'hide-sm' }, 'Time saved'))), tb))));
    }
    root.replaceChildren(page);
  }

  // ---------- Manual health ----------

  function manual(root, b) {
    const rows = svc.sections();
    const nClar = rows.filter(function (s) { return s.flag === 'clarify'; }).length;
    const nUnused = rows.filter(function (s) { return s.flag === 'unused'; }).length;
    const FILTERS = [{ id: 'all', label: 'All', n: rows.length }, { id: 'clarify', label: 'Needs clearer wording', n: nClar }, { id: 'unused', label: 'Never used', n: nUnused }];
    const tb = h('tbody', {});
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Filter sections' });
    function paint() {
      tabs.replaceChildren();
      FILTERS.forEach(function (f) { tabs.append(h('button', { type: 'button', role: 'tab', class: 'tab' + (ui.sectionFilter === f.id ? ' on' : ''), 'aria-selected': String(ui.sectionFilter === f.id), onclick: function () { ui.sectionFilter = f.id; paint(); } }, f.label, h('span', { class: 'ct' }, f.n))); });
      tb.replaceChildren();
      const shown = rows.filter(function (s) { return ui.sectionFilter === 'all' || s.flag === ui.sectionFilter; });
      shown.forEach(function (s) {
        const flag = s.flag === 'clarify' ? A.chip('Clarify', 'warn') : s.flag === 'unused' ? A.chip('Never cited', 'design') : A.chip('Healthy', 'ok');
        const d = s.cited - s.prevCited;
        tb.append(h('tr', {},
          h('td', {}, h('b', {}, s.title)),
          h('td', {}, flag),
          h('td', {}, U.n0(s.cited), s.prevCited || s.cited ? h('span', { class: 'sub' }, '  ' + (d === 0 ? 'no change' : (d > 0 ? '▲ ' : '▼ ') + Math.abs(d))) : null),
          h('td', { class: 'hide-sm' }, s.unclearRate == null ? '—' : h('span', { class: 'rate' }, h('i', { class: 'mini wide', 'aria-hidden': 'true' }, h('u', { class: s.flag === 'clarify' ? 'warn' : '', style: 'width:' + Math.min(100, s.unclearRate) + '%' })), A.round(s.unclearRate) + '%'))));
      });
      if (!shown.length) tb.append(h('tr', {}, h('td', { colspan: '4', class: 'none' }, 'Nothing here.')));
    }
    paint();
    const lede = rows.length ? (nClar || nUnused ? [nClar ? U.plural(nClar, 'section') + ' ' + (nClar === 1 ? 'is' : 'are') + ' cited often but did not settle the question' : '', nUnused ? U.plural(nUnused, 'section') + ' never cited' : ''].filter(Boolean).join(', ') + ' in ' + b.range.name + '.' : 'Every cited section is settling questions in ' + b.range.name + '.') : 'No manual sections were cited in ' + b.range.name + '.';
    const page = h('div', { class: 'page' }, A.pageHead('Manual health', lede),
      h('div', { class: 'toolbar' }, tabs),
      rows.length ? h('div', { class: 'card flush' }, h('div', { class: 'scroll' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Section'), h('th', {}, 'Health'), h('th', {}, 'Times cited'), h('th', { class: 'hide-sm' }, 'Did not settle it'))), tb))) : A.empty('No section data', 'The chatbot has not reported which manual section was cited.'),
      h('p', { class: 'foot' }, '“Did not settle it” is the share of questions where the bot cited the section but still sent the question to a person. A section is flagged when it is cited 5+ times and at least 25% did not settle it.'));
    root.replaceChildren(page);
  }

  // ---------- Reports ----------

  function scheduleCard(kind) {
    const c0 = svc.updates.get(kind);
    const on = h('input', { type: 'checkbox', id: 'u-on-' + kind, checked: c0.on });
    on.addEventListener('change', function () { svc.updates.set(kind, { on: on.checked }); refresh(); });
    const sel = h('select', { id: 'u-freq-' + kind, 'aria-label': 'How often' }, svc.updates.FREQ.map(function (f) { return h('option', { value: f.v, selected: c0.freq === f.v }, f.label); }));
    const monthsIn = h('input', { type: 'number', min: '1', max: '24', step: '1', value: String(c0.custom), 'aria-label': 'Number of months' });
    const custom = h('div', { class: 'unit custom' }, h('span', {}, 'Every'), monthsIn, h('span', {}, 'months'));
    sel.addEventListener('change', function () { svc.updates.set(kind, { freq: sel.value }); refresh(); });
    monthsIn.addEventListener('change', function () { svc.updates.set(kind, { custom: monthsIn.value }); monthsIn.value = String(svc.updates.get(kind).custom); refresh(); });
    const emails = h('textarea', { id: 'u-emails-' + kind, rows: '3', placeholder: 'name@company.com, name2@company.com', 'aria-label': 'Email addresses' });
    emails.value = c0.emails;
    emails.addEventListener('input', function () { svc.updates.set(kind, { emails: emails.value }); refresh(); });
    const info = h('p', { class: 'sub', role: 'status' });
    const next = h('p', { class: 'next' });
    const swLabel = h('span', {}, '');
    const last = h('span', { class: 'sub' });
    const send = h('button', { type: 'button', class: 'btn' + (kind === 'deck' ? ' primary' : ''), onclick: function () { svc.updates.send(kind).then(refresh); } }, A.icon('download'), 'Send now');
    function refresh() {
      const c = svc.updates.get(kind);
      swLabel.textContent = c.on ? 'On' : 'Off';
      custom.hidden = c.freq !== 'custom';
      info.textContent = c.bad.length ? 'These do not look like email addresses: ' + c.bad.slice(0, 3).join(', ') : (c.valid.length ? U.plural(c.valid.length, 'address', 'addresses') + ' added.' : '');
      info.className = 'sub' + (c.bad.length ? ' bad' : '');
      next.className = 'next' + (c.on && c.valid.length && c.due ? ' due' : '');
      next.textContent = !c.on ? '' : !c.valid.length ? 'Add an email address to start the schedule.' : c.due ? '● Due now. It was due ' + c.nextDue + '.' : 'Next one is due ' + c.nextDue + '.';
      last.textContent = c.file + (c.lastSent ? '  ·  last sent ' + U.fmtDay(c.lastSent + 'T12:00:00') : '');
    }
    refresh();
    return h('section', { class: 'card sched' },
      h('div', { class: 'card-h' }, h('div', {}, h('h2', {}, c0.title), h('p', { class: 'sub' }, c0.blurb)), h('label', { class: 'switch' }, on, swLabel)),
      h('div', { class: 'pad-x' },
        h('label', { class: 'field', for: 'u-freq-' + kind }, 'Send it'), sel, custom,
        h('label', { class: 'field', for: 'u-emails-' + kind }, 'Send to (separate addresses with commas)'), emails, info, next,
        h('div', { class: 'upd-f' }, send, last)));
  }

  function reports(root, b) {
    const rowBtn = function (title, text, label, ic, fn, id) {
      return h('div', { class: 'action' }, h('div', {}, h('b', {}, title), h('p', { class: 'sub' }, text)), h('button', { type: 'button', class: 'btn', id: id, onclick: fn }, A.icon(ic), label));
    };
    root.replaceChildren(h('div', { class: 'page' },
      A.pageHead('Reports', 'Share progress with leadership and keep owners on track.'),
      h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Download now')),
        rowBtn('Progress deck', 'Leadership slides for ' + b.range.label + ' (PowerPoint).', 'Download deck', 'download', function () { svc.downloadDeck(); }, 'dl-deck'),
        rowBtn('Fix list', 'Every gap with status, owner and due date (spreadsheet).', 'Download CSV', 'download', function () { svc.downloadCsv(); }, 'dl-csv')),
      h('div', { class: 'grid2 even' }, scheduleCard('deck'), scheduleCard('list')),
      ''));
  }

  // ---------- Settings sheet ----------

  function settings(dlg) {
    const s = svc.settings.get();
    let t = null;
    const field = function (id, label, input, help) { return h('div', { class: 'fld' }, h('label', { class: 'field', for: id }, label), input, help ? h('p', { class: 'sub' }, help) : null); };
    const push = function (key, conv) {
      return function (e) { const v = conv ? conv(e.target.value) : e.target.value; clearTimeout(t); t = setTimeout(function () { svc.settings.set((function () { const o = {}; o[key] = v; return o; })()); }, 200); };
    };
    const num = function (id, key, min, max, val) { const i = h('input', { id: id, type: 'number', min: String(min), max: String(max), step: '1', value: String(val) }); i.addEventListener('input', push(key, function (v) { return Number(v) || 0; })); return i; };
    const txt = function (id, key, val, ph) { const i = h('input', { id: id, type: 'text', maxlength: '400', value: val, placeholder: ph || '', autocomplete: 'off' }); i.addEventListener('input', push(key)); return i; };
    const color = h('input', { id: 'brand', type: 'color', value: s.brand }); color.addEventListener('input', push('brand'));
    dlg.replaceChildren(h('form', { method: 'dialog', class: 'sheet-in' },
      h('div', { class: 'sheet-h' }, h('h2', { id: 'settings-h' }, 'Settings'), h('button', { type: 'submit', class: 'icon-btn', 'aria-label': 'Close settings' }, A.icon('close'))),
      field('goal', 'Goal: share of questions the bot answers', h('div', { class: 'unit' }, num('goal', 'goal', 1, 100, s.goal), h('b', {}, '%'))),
      field('minutesPerTicket', 'Minutes a person spends on a ticket', h('div', { class: 'unit' }, num('minutesPerTicket', 'minutesPerTicket', 1, 600, s.minutesPerTicket), h('b', {}, 'min'))),
      field('team', 'Team members', txt('team', 'team', s.team, 'Priya, Marcus, Dana'), 'Separate names with commas. They appear as owner shortcuts.'),
      h('details', { class: 'more', open: true }, h('summary', {}, 'Leadership deck'),
        field('org', 'Company or team name', txt('org', 'org', s.org)),
        field('preparedBy', 'Prepared by', txt('preparedBy', 'preparedBy', s.preparedBy, 'e.g. Operations Excellence team')),
        field('brand', 'Accent colour', color, 'Used for the deck and as this app’s accent.')),
      h('div', { class: 'sheet-f' }, h('button', { type: 'submit', class: 'btn primary' }, 'Done'))));
  }

  // ---------- first-run ----------

  // Shown only for a moment while the chatbot's log loads.
  function hero(root) {
    root.replaceChildren(h('div', { class: 'hero' }, h('p', { class: 'eyebrow' }, 'Manual Gap Tracker'), h('h1', {}, 'Loading your latest questions…')));
  }

  A.results = results; A.manual = manual; A.reports = reports; A.settings = settings; A.hero = hero;
})();
