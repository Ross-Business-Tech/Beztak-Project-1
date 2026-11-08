/*
 * The Manual Improvement Dashboard: two pages.
 *   Page 1  The changes to make, ranked, with a status and an owner for each.
 *   Page 2  One change in detail: every question behind it, how staff resolved them,
 *           and a place to decide (action item, in progress, done, dismissed) and assign an owner.
 * Decisions are saved on this computer and carry over from month to month. They can be
 * downloaded as a spreadsheet, or saved to a team file and loaded on another computer.
 * Everything shown comes from the questions file; it is always added to the page as plain text.
 */
(function () {
  'use strict';
  const Q = window.QAD;
  const D = Q.data;
  const KEY = 'manual-improvement-assignments-v1';
  const STATUS = [
    { id: 'new', label: 'Not reviewed' },
    { id: 'action', label: 'Action item' },
    { id: 'doing', label: 'In progress' },
    { id: 'done', label: 'Done' },
    { id: 'dismissed', label: 'Dismissed' }
  ];
  const labelOf = function (id) { return (STATUS.filter(function (s) { return s.id === id; })[0] || STATUS[0]).label; };
  const norm = function (k) { return String(k || '').trim().toLowerCase(); };
  const n0 = function (n) { return Math.round(n || 0).toLocaleString('en-US'); };
  const fmtDay = function (iso) { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* storage full or blocked */ } }

  // A tiny element builder. Strings become text, never HTML.
  function h(tag, attrs) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }

  function create(root, api) {
    let assigns = load();
    let brief = null;
    const ui = { view: 'list', key: null, status: 'active', category: '', search: '', qFilter: 'open', qSearch: '', page: 0 };

    const fresh = function () { return { status: 'new', owner: '', due: '', notes: '' }; };
    const get = function (c) { return Object.assign(fresh(), assigns[norm(c.key)] || {}); };
    function put(c, patch) {
      const k = norm(c.key);
      const next = Object.assign(fresh(), assigns[k] || {}, patch);
      if (patch.owner && next.status === 'new') next.status = 'action'; // naming an owner makes it an action item
      next.at = new Date().toISOString();
      next.theme = c.theme;
      assigns[k] = next;
      save(assigns);
      return next;
    }
    const kindLabel = function (c) { return c.kind === 'add' ? 'Add a section' : 'Improve a section'; };

    // ---------- shared bits ----------

    function pill(status) { return h('span', { class: 'pill s-' + status }, labelOf(status)); }

    function download(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    function exportCsv() {
      const rows = brief.changes.map(function (c) {
        const a = get(c);
        return { rank: c.rank, change: c.theme, type: kindLabel(c), category: c.category, tickets: c.tickets, per_month: Math.round(c.perMonth * 10) / 10, more_answered_per_month: c.more,
          staff_hours_per_month: Math.round(c.hours * 10) / 10, status: labelOf(a.status), owner: a.owner, due: a.due, notes: a.notes };
      });
      const cols = ['rank', 'change', 'type', 'category', 'tickets', 'per_month', 'more_answered_per_month', 'staff_hours_per_month', 'status', 'owner', 'due', 'notes'];
      download(new Blob([D.toCSV(rows, cols)], { type: 'text/csv' }), 'Manual-Improvement-' + brief.range.ym + '.csv');
    }
    function exportTeamFile() {
      download(new Blob([JSON.stringify({ version: 1, savedAt: new Date().toISOString(), assignments: assigns }, null, 2)], { type: 'application/json' }), 'Manual-Improvement-team-file.json');
    }
    function importTeamFile(file) {
      file.text().then(function (text) {
        const data = JSON.parse(text);
        if (!data || typeof data.assignments !== 'object') throw new Error('not a team file');
        let n = 0;
        Object.keys(data.assignments).forEach(function (k) {
          const inc = data.assignments[k];
          if (!inc || typeof inc !== 'object') return;
          const mine = assigns[k];
          if (!mine || String(inc.at || '') > String(mine.at || '')) { // the newer decision wins
            assigns[k] = { status: STATUS.some(function (s) { return s.id === inc.status; }) ? inc.status : 'new', owner: String(inc.owner || '').slice(0, 80), due: String(inc.due || '').slice(0, 10), notes: String(inc.notes || '').slice(0, 2000), at: String(inc.at || ''), theme: String(inc.theme || '').slice(0, 200) };
            n++;
          }
        });
        save(assigns); toast('Loaded ' + n + ' decision' + (n === 1 ? '' : 's') + ' from the team file.'); render();
      }).catch(function () { toast('That is not a team file saved from this dashboard.', true); });
    }
    let toastEl = null; let toastTimer = null;
    function toast(text, bad) {
      if (!toastEl) { toastEl = h('div', { class: 'd-toast', role: 'status' }); document.body.appendChild(toastEl); } // outside root, which is redrawn
      toastEl.textContent = text; toastEl.className = 'd-toast' + (bad ? ' bad' : ''); toastEl.hidden = false;
      clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 4500);
    }
    function owners() {
      const set = new Set((api.team() || []));
      Object.keys(assigns).forEach(function (k) { if (assigns[k].owner) set.add(assigns[k].owner); });
      return Array.from(set).sort();
    }

    // ---------- page 1: the list ----------

    function matchStatus(c) {
      const s = get(c).status;
      if (ui.status === 'active') return s !== 'dismissed' && s !== 'done';
      return ui.status === 'all' || s === ui.status;
    }

    function renderList() {
      const changes = brief.changes;
      root.replaceChildren();
      if (!changes.length) {
        root.append(h('div', { class: 'd-empty' }, h('h2', {}, 'Nothing needs changing right now'), h('p', {}, 'No topic reached three tickets over ' + brief.window.label + '. New gaps appear here as soon as they do.')));
        return;
      }
      const counts = { all: changes.length, active: 0 };
      STATUS.forEach(function (s) { counts[s.id] = 0; });
      changes.forEach(function (c) { const s = get(c).status; counts[s] += 1; if (s !== 'dismissed' && s !== 'done') counts.active += 1; });
      const gain = changes.filter(function (c) { const s = get(c).status; return s !== 'dismissed' && s !== 'done'; }).reduce(function (a, c) { return a + c.more; }, 0);

      root.append(h('div', { class: 'd-head' },
        h('div', {}, h('h2', {}, 'Changes to make to the manual'),
          h('p', { class: 'hint' }, 'Ranked by tickets over ' + brief.window.label + ' (' + brief.window.months + ' month' + (brief.window.months === 1 ? '' : 's') + '), so one odd month does not reorder the list. Open a change to see every question behind it and to assign an owner.')),
        h('div', { class: 'd-kpi' }, h('b', {}, '+' + n0(gain)), h('span', {}, 'more answered a month if the open changes are made'))));

      const chips = [['active', 'Open (' + counts.active + ')']].concat(STATUS.map(function (s) { return [s.id, s.label + ' (' + counts[s.id] + ')']; })).concat([['all', 'Everything (' + counts.all + ')']]);
      root.append(h('div', { class: 'd-chips', role: 'group', 'aria-label': 'Filter by status' }, chips.map(function (c) {
        return h('button', { type: 'button', class: 'chip' + (ui.status === c[0] ? ' on' : ''), 'aria-pressed': String(ui.status === c[0]), onclick: function () { ui.status = c[0]; renderList(); } }, c[1]);
      })));

      const cats = Array.from(new Set(changes.map(function (c) { return c.category; }))).sort();
      const search = h('input', { type: 'search', placeholder: 'Search changes or questions', 'aria-label': 'Search changes', value: ui.search });
      search.addEventListener('input', function () { ui.search = search.value; paintRows(); });
      const catSel = h('select', { 'aria-label': 'Filter by category', onchange: function () { ui.category = catSel.value; paintRows(); } },
        h('option', { value: '' }, 'All categories'), cats.map(function (c) { return h('option', { value: c, selected: ui.category === c }, c); }));
      const load = h('input', { type: 'file', accept: '.json,application/json', class: 'sr', id: 'd-load', onchange: function (e) { if (e.target.files[0]) importTeamFile(e.target.files[0]); e.target.value = ''; } });
      root.append(h('div', { class: 'd-tools' }, search, catSel,
        h('div', { class: 'd-tools-r' },
          h('button', { type: 'button', onclick: exportCsv }, 'Download spreadsheet'),
          h('button', { type: 'button', onclick: exportTeamFile }, 'Save team file'),
          h('label', { class: 'btn', for: 'd-load' }, 'Load team file'), load)));

      const list = h('ol', { class: 'd-list' });
      root.append(list);
      const max = Math.max.apply(null, changes.map(function (c) { return c.tickets; }).concat([1]));

      function paintRows() {
        list.replaceChildren();
        const q = norm(ui.search);
        const shown = changes.filter(function (c) {
          if (!matchStatus(c)) return false;
          if (ui.category && c.category !== ui.category) return false;
          if (!q) return true;
          return norm(c.theme).indexOf(q) >= 0 || norm(c.category).indexOf(q) >= 0 || c.questions.some(function (x) { return norm(x.text).indexOf(q) >= 0; });
        });
        if (!shown.length) list.append(h('li', { class: 'd-none' }, 'No changes match. Try a different filter.'));
        shown.forEach(function (c) {
          const a = get(c);
          list.append(h('li', {}, h('button', { type: 'button', class: 'd-row', onclick: function () { ui.view = 'detail'; ui.key = c.key; ui.qFilter = 'open'; ui.qSearch = ''; ui.page = 0; render(); window.scrollTo(0, 0); } },
            h('span', { class: 'rk' }, c.rank),
            h('span', { class: 'main' }, h('b', {}, c.theme),
              h('span', { class: 'sub' }, kindLabel(c) + '  ·  ' + c.category + (c.rising ? '  ·  Rising' : ''))),
            h('span', { class: 'tk' }, h('b', {}, n0(c.tickets)), h('span', { class: 'sub' }, 'tickets'), h('i', { class: 'bar' }, h('u', { style: 'width:' + Math.max(4, (c.tickets / max) * 100) + '%' }))),
            h('span', { class: 'gn' }, h('b', {}, '+' + n0(c.more)), h('span', { class: 'sub' }, 'a month')),
            h('span', { class: 'st' }, pill(a.status), h('span', { class: 'sub' }, a.owner ? a.owner : 'Unassigned')),
            h('span', { class: 'go', 'aria-hidden': 'true' }, '›'))));
        });
      }
      paintRows();
    }

    // ---------- page 2: one change ----------

    function copyText(text) {
      const done = function () { toast('Copied.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast('Select the text and copy it.', true); });
      else toast('Select the text and copy it.', true);
    }

    function renderDetail() {
      const changes = brief.changes;
      const idx = changes.findIndex(function (c) { return norm(c.key) === norm(ui.key); });
      if (idx < 0) { ui.view = 'list'; renderList(); return; }
      const c = changes[idx];
      const a = get(c);
      root.replaceChildren();

      root.append(h('div', { class: 'd-nav' },
        h('button', { type: 'button', class: 'back', onclick: function () { ui.view = 'list'; render(); } }, '‹  All changes'),
        h('span', { class: 'nav-r' },
          h('button', { type: 'button', disabled: idx === 0, onclick: function () { ui.key = changes[idx - 1].key; ui.page = 0; render(); window.scrollTo(0, 0); } }, '‹ Previous'),
          h('span', { class: 'sub' }, (idx + 1) + ' of ' + changes.length),
          h('button', { type: 'button', disabled: idx === changes.length - 1, onclick: function () { ui.key = changes[idx + 1].key; ui.page = 0; render(); window.scrollTo(0, 0); } }, 'Next ›'))));

      root.append(h('div', { class: 'd-title' },
        h('span', { class: 'rk big' }, c.rank),
        h('div', {}, h('h2', {}, c.theme),
          h('p', { class: 'sub' }, kindLabel(c) + '  ·  ' + c.category + (c.section ? '  ·  Section involved: ' + c.section : '') + (c.rising ? '  ·  Rising' : '')))));

      root.append(h('div', { class: 'd-stats' },
        stat(n0(c.tickets), 'tickets over ' + brief.window.label),
        stat(n0(c.asked), 'times asked'),
        stat(Math.round(c.answeredShare) + '%', 'of those answered now'),
        stat('+' + n0(c.more), 'more answered a month if fixed'),
        stat('≈ ' + (c.hours < 10 ? (Math.round(c.hours * 10) / 10) : Math.round(c.hours)), 'staff hours a month')));

      // Left column: decide + wording. Right column: the questions.
      const left = h('div', { class: 'd-left' });
      const right = h('div', { class: 'd-right' });
      root.append(h('div', { class: 'd-cols' }, left, right));

      // Decision
      const savedNote = h('span', { class: 'saved', role: 'status' }, a.at ? 'Saved ' + fmtDay(a.at) : '');
      const flash = function () { savedNote.textContent = 'Saved'; };
      const statusBtns = h('div', { class: 'seg-s', role: 'radiogroup', 'aria-label': 'Decision' }, STATUS.filter(function (s) { return s.id !== 'new'; }).map(function (s) {
        return h('button', { type: 'button', role: 'radio', class: 's-' + s.id + (get(c).status === s.id ? ' on' : ''), 'aria-checked': String(get(c).status === s.id), onclick: function () { put(c, { status: s.id }); flash(); renderDetail(); } }, s.label);
      }));
      const ownerIn = h('input', { type: 'text', id: 'd-owner', list: 'd-owners', maxlength: '80', placeholder: 'Type a name', value: a.owner, autocomplete: 'off' });
      ownerIn.addEventListener('change', function () { put(c, { owner: ownerIn.value.trim() }); flash(); renderDetail(); });
      const team = owners();
      const dueIn = h('input', { type: 'date', id: 'd-due', value: a.due });
      dueIn.addEventListener('change', function () { put(c, { due: dueIn.value }); flash(); });
      const notesIn = h('textarea', { id: 'd-notes', rows: '3', maxlength: '2000', placeholder: 'Anything the owner should know' });
      notesIn.value = a.notes;
      notesIn.addEventListener('input', function () { put(c, { notes: notesIn.value }); flash(); });
      left.append(h('section', { class: 'd-panel' },
        h('h3', {}, 'Your decision'),
        statusBtns,
        a.status === 'new' ? h('p', { class: 'hint' }, 'Not reviewed yet. Pick a decision, or just assign an owner.') : null,
        h('label', { class: 'field', for: 'd-owner' }, h('span', {}, 'Owner')), ownerIn,
        h('datalist', { id: 'd-owners' }, team.map(function (t) { return h('option', { value: t }); })),
        team.length ? h('div', { class: 'team' }, team.map(function (t) { return h('button', { type: 'button', class: 'chip' + (a.owner === t ? ' on' : ''), onclick: function () { put(c, { owner: t }); flash(); renderDetail(); } }, t); })) : h('p', { class: 'hint' }, 'Add team member names in Setup and they appear here as one-click buttons.'),
        h('label', { class: 'field', for: 'd-due' }, h('span', {}, 'Due date')), dueIn,
        h('label', { class: 'field', for: 'd-notes' }, h('span', {}, 'Notes')), notesIn,
        savedNote));

      // Wording
      const wording = h('section', { class: 'd-panel' }, h('h3', {}, 'A starting point for the wording'));
      if (c.notes.length) {
        wording.append(h('p', { class: 'hint' }, 'How a person resolved these tickets. Use it to draft the ' + (c.kind === 'add' ? 'new section' : 'clearer wording') + '.'));
        c.notes.slice(0, 3).forEach(function (n) {
          wording.append(h('div', { class: 'note' }, h('p', {}, n.text),
            h('div', { class: 'note-f' }, h('span', { class: 'sub' }, 'Said ' + n.count + (n.count === 1 ? ' time' : ' times') + ', last ' + fmtDay(n.last)), h('button', { type: 'button', class: 'mini', onclick: function () { copyText(n.text); } }, 'Copy'))));
        });
      } else wording.append(h('p', { class: 'hint' }, 'No resolution notes in the file for this topic yet.'));
      left.append(wording);

      // Questions
      const shownBase = c.questions;
      const nOpen = shownBase.filter(function (x) { return !x.answered; }).length;
      const nAns = shownBase.length - nOpen;
      const f = [['open', 'Not answered (' + nOpen + ')'], ['answered', 'Answered (' + nAns + ')'], ['all', 'All (' + shownBase.length + ')']];
      const qSearch = h('input', { type: 'search', placeholder: 'Search these questions', 'aria-label': 'Search these questions', value: ui.qSearch });
      right.append(h('section', { class: 'd-panel' }, h('h3', {}, 'Every question behind this change'),
        h('div', { class: 'd-chips', role: 'group', 'aria-label': 'Filter questions' }, f.map(function (x) {
          return h('button', { type: 'button', class: 'chip' + (ui.qFilter === x[0] ? ' on' : ''), 'aria-pressed': String(ui.qFilter === x[0]), onclick: function () { ui.qFilter = x[0]; ui.page = 0; renderDetail(); } }, x[1]);
        })), qSearch));
      const box = h('div', { class: 'qs' });
      const pager = h('div', { class: 'pager' });
      right.append(box, pager);
      qSearch.addEventListener('input', function () { ui.qSearch = qSearch.value; ui.page = 0; paintQs(); });

      function paintQs() {
        box.replaceChildren(); pager.replaceChildren();
        const q = norm(ui.qSearch);
        const list = shownBase.filter(function (x) {
          if (ui.qFilter === 'open' && x.answered) return false;
          if (ui.qFilter === 'answered' && !x.answered) return false;
          return !q || norm(x.text).indexOf(q) >= 0 || norm(x.note).indexOf(q) >= 0;
        });
        const per = 12;
        const pages = Math.max(1, Math.ceil(list.length / per));
        ui.page = Math.min(ui.page, pages - 1);
        if (!list.length) box.append(h('p', { class: 'd-none' }, 'No questions match.'));
        list.slice(ui.page * per, ui.page * per + per).forEach(function (x) {
          box.append(h('article', { class: 'qrow' },
            h('p', { class: 'qt' }, '“' + x.text + '”'),
            h('p', { class: 'qm' }, h('span', { class: 'out ' + (x.answered ? 'ok' : 'gap') }, x.answered ? 'Answered' : 'Sent to a person'),
              [fmtDay(x.at), x.answered ? '' : (D.ESCALATION_LABELS[x.reason] || ''), x.ticketId, x.section ? 'Section: ' + x.section : ''].filter(Boolean).map(function (t) { return h('span', {}, t); })),
            x.note ? h('p', { class: 'qn' }, h('b', {}, 'How it was resolved: '), x.note) : null));
        });
        if (pages > 1) {
          pager.append(h('button', { type: 'button', disabled: ui.page === 0, onclick: function () { ui.page--; paintQs(); } }, '‹ Previous'),
            h('span', { class: 'sub' }, 'Page ' + (ui.page + 1) + ' of ' + pages + ' · ' + list.length + ' questions'),
            h('button', { type: 'button', disabled: ui.page >= pages - 1, onclick: function () { ui.page++; paintQs(); } }, 'Next ›'));
        } else pager.append(h('span', { class: 'sub' }, list.length + ' question' + (list.length === 1 ? '' : 's')));
      }
      paintQs();
    }

    function stat(big, small) { return h('div', { class: 'stat' }, h('b', {}, big), h('span', {}, small)); }

    function render() {
      if (!brief) { root.replaceChildren(h('div', { class: 'd-empty' }, h('h2', {}, 'Add a questions file first'), h('p', {}, 'The dashboard is built from the same file as the executive deck.'))); return; }
      if (ui.view === 'detail') renderDetail(); else renderList();
    }

    return { update: function (b) { brief = b; render(); }, render: render };
  }

  Q.dashboard = { create: create };
})();
