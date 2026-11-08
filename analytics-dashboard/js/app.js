/*
 * App shell: storage, routing, the five pages and all user actions.
 * Calculations live in analytics.js; parsing and validation live in data.js.
 */
(function () {
  'use strict';

  const D = QAD.data;
  const A = QAD.analytics;
  const STATUS = D.STATUS;
  const UNCAT = D.UNCATEGORIZED_ID;
  const STORE_KEY = 'qad.store.v2';
  const PAGE_SIZE = 25;
  const COLORS = { answered: '#2e7d5b', open: '#d98a1b', closed: '#2f5d8c', total: '#1d2433' };
  const STATUS_CLASS = { 'Answered': 'answer', 'Ticket Open': 'ticket', 'Ticket Closed': 'closed' };

  const state = {
    range: { preset: '90d', from: '', to: '' },
    granularity: 'week',
    ex: { q: '', status: '', category: '', from: '', to: '', sort: 'newest', page: 1, selected: null },
    pendingImport: null
  };
  const charts = {};
  let store = null;

  // ---------- small helpers ----------

  const $ = function (sel) { return document.querySelector(sel); };
  const view = function () { return document.getElementById('view'); };
  const all = function () { return Object.values(store.questions); };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString(); }
  function fmtPct(p) { return p == null ? '—' : p.toFixed(1) + '%'; }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  function badge(status) {
    return '<span class="badge ' + (STATUS_CLASS[status] || 'plain') + '">' + esc(status) + '</span>';
  }
  function nowIso() { return new Date().toISOString(); }

  let toastTimer = null;
  function toast(msg, isError) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4500);
  }

  // ---------- storage ----------

  function newStore() {
    return {
      version: 2,
      questions: {},
      categories: JSON.parse(JSON.stringify(D.DEFAULT_CATEGORIES)),
      settings: { retentionMonths: 12 },
      manual: {},
      activity: []
    };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s === 'object' && s.questions) {
          if (!Array.isArray(s.categories)) s.categories = JSON.parse(JSON.stringify(D.DEFAULT_CATEGORIES));
          if (!s.settings) s.settings = { retentionMonths: 12 };
          if (!s.manual) s.manual = {};
          if (!Array.isArray(s.activity)) s.activity = [];
          return s;
        }
      }
    } catch (e) {
      toast('Saved data could not be read. Starting with an empty dashboard.', true);
    }
    return newStore();
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      toast('Could not save: browser storage is full. Download a backup, then delete old records.', true);
      return false;
    }
  }

  function logActivity(type, text) {
    store.activity.unshift({ at: nowIso(), type: type, text: text });
    store.activity = store.activity.slice(0, 200);
  }

  // ---------- categories ----------

  function catMap() { return new Map(store.categories.map(function (c) { return [c.id, c]; })); }

  function catLabel(catId, subId) {
    const m = catMap();
    const top = m.get(catId);
    const sub = subId ? m.get(subId) : null;
    if (!top) return '—';
    return sub ? top.name + ' › ' + sub.name : top.name;
  }

  // One select with top-level categories and their subcategories ("Parent › Sub").
  function categoryOptions(selected, excludeId) {
    let html = '';
    store.categories.filter(function (c) { return !c.parentId && c.id !== excludeId; }).forEach(function (t) {
      html += '<option value="' + esc(t.id) + '"' + (t.id === selected ? ' selected' : '') + '>' + esc(t.name) + '</option>';
      store.categories.filter(function (s) { return s.parentId === t.id; }).forEach(function (s) {
        html += '<option value="' + esc(s.id) + '"' + (s.id === selected ? ' selected' : '') + '>&nbsp;&nbsp;› ' + esc(s.name) + '</option>';
      });
    });
    return html;
  }

  // Applies a category (top-level or sub) to a record, clears any pending suggestion, keeps history.
  function setRecordCategory(r, value) {
    const c = catMap().get(value);
    if (!c) return false;
    const before = catLabel(r.category_id, r.subcategory_id);
    if (c.parentId) { r.category_id = c.parentId; r.subcategory_id = c.id; }
    else { r.category_id = c.id; r.subcategory_id = null; }
    r.suggested_category_id = '';
    r.suggestion_source = '';
    const after = catLabel(r.category_id, r.subcategory_id);
    if (before !== after) {
      r.category_history = (r.category_history || []).concat([{ from: before, to: after, at: nowIso() }]);
    }
    return true;
  }

  // Name of a suggested category, or '' when there is none.
  function suggestionLabel(r) {
    if (!r.suggested_category_id) return '';
    const c = catMap().get(r.suggested_category_id);
    if (!c) return '';
    const parent = c.parentId ? catMap().get(c.parentId) : null;
    return (parent ? parent.name + ' › ' : '') + c.name;
  }

  // ---------- reporting period ----------

  function currentRange() {
    return A.rangeFromPreset(state.range.preset, new Date(), state.range);
  }

  // ---------- charts ----------

  function destroyCharts() {
    Object.keys(charts).forEach(function (k) { charts[k].destroy(); delete charts[k]; });
  }

  function drawChart(key, canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(canvas, config);
  }

  function chartsAvailable() {
    return typeof Chart !== 'undefined';
  }

  const chartsMissingNotice =
    '<div class="notice warn">The chart library did not load (vendor/chart.umd.js is missing). Tables below still work.</div>';

  // ---------- Overview ----------

  function kpi(label, value, sub, help, cls) {
    return '<div class="kpi ' + (cls || '') + '" title="' + esc(help) + '">' +
      '<div class="kpi-label">' + esc(label) + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      '<div class="kpi-sub">' + sub + '</div></div>';
  }

  function renderOverview() {
    destroyCharts();
    const range = currentRange();
    const qs = A.filterRange(all(), range);
    const s = A.summarize(qs);
    const trendRows = A.trend(qs, state.granularity);
    const cats = A.categoryStats(qs, store.categories).sort(function (a, b) { return b.total - a.total; });
    const share = function (n) { return s.total ? fmtPct((n / s.total) * 100) + ' of questions' : 'No questions yet'; };
    const uncatCount = qs.filter(function (q) { return q.category_id === UNCAT; }).length;

    view().innerHTML =
      '<div class="page-head"><h1>Overview</h1>' +
      '<p class="muted">' + esc(range.label) + ' · ' + fmtNum(s.total) + ' questions</p></div>' +
      (qs.length === 0 ? '<div class="notice">No questions in this period. Try a longer period, or load sample data in Data Management.</div>' : '') +
      (chartsAvailable() ? '' : chartsMissingNotice) +
      '<section class="kpis">' +
        kpi('Total questions', fmtNum(s.total), 'Received in this period', 'Every question received in this period.', '') +
        kpi('Answered', fmtNum(s.counts[STATUS.ANSWERED]), share(s.counts[STATUS.ANSWERED]), 'The chatbot answered the question.', 'answer') +
        kpi('Ticket Open', fmtNum(s.counts[STATUS.OPEN]), share(s.counts[STATUS.OPEN]), 'The chatbot could not answer and the ticket is still open.', 'ticket') +
        kpi('Ticket Closed', fmtNum(s.counts[STATUS.CLOSED]), share(s.counts[STATUS.CLOSED]), 'The chatbot could not answer and the ticket has been resolved or closed.', 'closed') +
        kpi('Needs a category', fmtNum(uncatCount), 'Uncategorized or suggested only', 'Questions without a confirmed category. Accept or choose one in Data Management.', '') +
      '</section>' +
      '<div class="grid-2">' +
        '<section class="card"><h2>Current status mix</h2>' +
          '<div class="chart-box donut"><canvas id="c-donut" aria-label="Status mix chart"></canvas></div>' +
          '<ul class="legend">' +
            legendItem(COLORS.answered, STATUS.ANSWERED, s.counts[STATUS.ANSWERED], s.pct.answered) +
            legendItem(COLORS.open, STATUS.OPEN, s.counts[STATUS.OPEN], s.pct.open) +
            legendItem(COLORS.closed, STATUS.CLOSED, s.counts[STATUS.CLOSED], s.pct.closed) +
          '</ul>' +
          '<p class="muted small">Percentages use all questions in the period (' + fmtNum(s.total) + ').</p>' +
        '</section>' +
        '<section class="card"><div class="card-head"><h2>Trend</h2>' +
          '<div class="seg" role="group" aria-label="Trend grouping">' +
            granButton('day', 'Day') + granButton('week', 'Week') + granButton('month', 'Month') +
          '</div></div>' +
          '<div class="chart-box"><canvas id="c-trend" aria-label="Trend chart"></canvas></div>' +
        '</section>' +
      '</div>' +
      '<section class="card"><h2>Category performance</h2>' +
        '<div class="chart-box tall"><canvas id="c-cat" aria-label="Category performance chart"></canvas></div>' +
        '<div class="table-wrap" style="margin-top:12px"><table>' +
          '<thead><tr><th>Category</th><th class="num">Questions</th><th class="num">Volume</th><th class="num">Answered</th>' +
          '<th class="num">Ticket Open</th><th class="num">Ticket Closed</th><th class="num">Answer rate</th></tr></thead><tbody>' +
          cats.map(function (c) {
            return '<tr><td>' + esc(c.name) + '</td><td class="num">' + fmtNum(c.total) + '</td><td class="num">' + fmtPct(c.volumePct) +
              '</td><td class="num">' + fmtNum(c.answered) + '</td><td class="num">' + fmtNum(c.open) + '</td><td class="num">' + fmtNum(c.closed) +
              '</td><td class="num">' + fmtPct(c.answerRate) + '</td></tr>';
          }).join('') +
        '</tbody></table></div></section>' +
      '<section class="card definitions"><h2>How these numbers are calculated</h2><dl>' +
        '<dt>Status</dt><dd>Every question is Answered, Ticket Open or Ticket Closed. A ticket moves from Open to Closed when its ticket status is Resolved or Closed.</dd>' +
        '<dt>Percentages</dt><dd>Each count divided by all questions in the period.</dd>' +
        '<dt>Volume</dt><dd>Questions in a category divided by all questions in the period.</dd>' +
        '<dt>Answer rate</dt><dd>Answered questions divided by all questions in that category.</dd>' +
        '<dt>Reporting period</dt><dd>Based on the date the question was submitted. Change it in the top bar.</dd>' +
      '</dl></section>';

    if (!chartsAvailable()) return;

    drawChart('donut', 'c-donut', {
      type: 'doughnut',
      data: {
        labels: [STATUS.ANSWERED, STATUS.OPEN, STATUS.CLOSED],
        datasets: [{ data: [s.counts[STATUS.ANSWERED], s.counts[STATUS.OPEN], s.counts[STATUS.CLOSED]], backgroundColor: [COLORS.answered, COLORS.open, COLORS.closed], borderWidth: 0 }]
      },
      options: {
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) {
            const pct = s.total ? ((ctx.raw / s.total) * 100).toFixed(1) : '0.0';
            return ctx.label + ': ' + fmtNum(ctx.raw) + ' (' + pct + '%)';
          } } }
        }
      }
    });

    const line = function (label, key, color) {
      return { label: label, data: trendRows.map(function (r) { return r[key]; }), borderColor: color, backgroundColor: color, tension: 0.25, pointRadius: 2, borderWidth: 2 };
    };
    drawChart('trend', 'c-trend', {
      type: 'line',
      data: {
        labels: trendRows.map(function (r) { return r.label; }),
        datasets: [line('Total', 'total', COLORS.total), line(STATUS.ANSWERED, 'answered', COLORS.answered), line(STATUS.OPEN, 'open', COLORS.open), line(STATUS.CLOSED, 'closed', COLORS.closed)]
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });

    const bar = function (label, key, color) {
      return { label: label, data: cats.map(function (c) { return c[key]; }), backgroundColor: color };
    };
    drawChart('cat', 'c-cat', {
      type: 'bar',
      data: {
        labels: cats.map(function (c) { return c.name; }),
        datasets: [bar(STATUS.ANSWERED, 'answered', COLORS.answered), bar(STATUS.OPEN, 'open', COLORS.open), bar(STATUS.CLOSED, 'closed', COLORS.closed)]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true } },
        plugins: { tooltip: { mode: 'index', intersect: false } }
      }
    });
  }

  function legendItem(color, label, n, pct) {
    return '<li><span class="dot" style="background:' + color + '"></span>' + esc(label) +
      '<span class="num">' + fmtNum(n) + ' · ' + fmtPct(pct) + '</span></li>';
  }

  function granButton(value, label) {
    const on = state.granularity === value;
    return '<button data-action="granularity" data-value="' + value + '" aria-pressed="' + on + '">' + label + '</button>';
  }

  // ---------- Question Explorer ----------

  function statusOptions(selected) {
    const opts = [['', 'All statuses']].concat(D.ALL_STATUSES.map(function (s) { return [s, s]; }));
    return opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (o[0] === selected ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('');
  }

  function filterCategoryOptions(selected) {
    let html = '<option value="">All categories</option>';
    store.categories.filter(function (c) { return !c.parentId; }).forEach(function (c) {
      html += '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    });
    return html;
  }

  function ticketStatusOptions(selected) {
    return D.TICKET_STATUSES.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === selected ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('');
  }

  function renderExplorer() {
    destroyCharts();
    const ex = state.ex;
    view().innerHTML =
      '<div class="page-head"><h1>Question Explorer</h1>' +
      '<p class="muted">Search every stored question. These filters are separate from the reporting period in the top bar.</p></div>' +
      '<section class="card filters" role="search">' +
        '<div class="field" style="flex:1 1 260px"><span>Search</span>' +
          '<input type="search" id="ex-q" placeholder="Words from a question, response or ID" value="' + esc(ex.q) + '"></div>' +
        '<div class="field"><span>Status</span><select data-change="ex-filter" data-field="status">' + statusOptions(ex.status) + '</select></div>' +
        '<div class="field"><span>Category</span><select data-change="ex-filter" data-field="category">' + filterCategoryOptions(ex.category) + '</select></div>' +
        '<div class="field"><span>Submitted from</span><input type="date" data-change="ex-filter" data-field="from" value="' + esc(ex.from) + '"></div>' +
        '<div class="field"><span>to</span><input type="date" data-change="ex-filter" data-field="to" value="' + esc(ex.to) + '"></div>' +
        '<div class="field"><span>Sort</span><select data-change="ex-filter" data-field="sort">' +
          '<option value="newest"' + (ex.sort === 'newest' ? ' selected' : '') + '>Newest first</option>' +
          '<option value="oldest"' + (ex.sort === 'oldest' ? ' selected' : '') + '>Oldest first</option></select></div>' +
        '<div class="field"><span>&nbsp;</span><button data-action="ex-clear">Clear filters</button></div>' +
      '</section>' +
      '<div id="ex-results"></div>' +
      '<section class="card detail" id="ex-detail"></section>';
    renderExResults();
    renderDetail();
  }

  function filteredExplorer() {
    const ex = state.ex;
    const q = ex.q.trim().toLowerCase();
    const from = A.parseLocalDate(ex.from);
    const to = A.parseLocalDate(ex.to);
    const toEnd = to ? A.localDay(to) : null;
    if (toEnd) toEnd.setDate(toEnd.getDate() + 1);
    const list = all().filter(function (r) {
      if (ex.status && r.resolution_status !== ex.status) return false;
      if (ex.category && r.category_id !== ex.category) return false;
      if (q) {
        const hay = (r.question_id + ' ' + r.question_text + ' ' + (r.response_text || '') + ' ' + (r.resolution_note || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      const t = Date.parse(r.submitted_at);
      if (from && t < from.getTime()) return false;
      if (toEnd && t >= toEnd.getTime()) return false;
      return true;
    });
    list.sort(function (a, b) {
      return ex.sort === 'oldest' ? (a.submitted_at < b.submitted_at ? -1 : 1) : (a.submitted_at < b.submitted_at ? 1 : -1);
    });
    return list;
  }

  function renderExResults() {
    const el = document.getElementById('ex-results');
    if (!el) return;
    const ex = state.ex;
    const list = filteredExplorer();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    ex.page = Math.min(Math.max(1, ex.page), pages);
    const start = (ex.page - 1) * PAGE_SIZE;
    const rows = list.slice(start, start + PAGE_SIZE);
    const m = catMap();

    el.innerHTML = '<section class="card">' +
      '<div class="card-head"><h2>' + fmtNum(list.length) + ' matching question' + (list.length === 1 ? '' : 's') + '</h2>' +
      '<span class="muted small">Select a row to see its full record.</span></div>' +
      (list.length === 0 ? '<div class="empty">No questions match these filters.</div> ' :
        '<div class="table-wrap"><table><thead><tr><th>Submitted</th><th>Question</th><th>Status</th><th>Category</th><th>Ticket</th></tr></thead><tbody>' +
        rows.map(function (r) {
          const top = m.get(r.category_id);
          const sub = r.subcategory_id ? m.get(r.subcategory_id) : null;
          const sug = suggestionLabel(r);
          return '<tr class="clickable' + (r.question_id === ex.selected ? ' selected' : '') + '" data-action="ex-select" data-id="' + esc(r.question_id) + '">' +
            '<td style="white-space:nowrap">' + esc(fmtDate(r.submitted_at)) + '</td>' +
            '<td class="q-cell"><div class="clamp">' + esc(r.question_text) + '</div>' + (r.flag ? '<span class="badge plain">Flag: ' + esc(r.flag) + '</span>' : '') + '</td>' +
            '<td>' + badge(r.resolution_status) + '</td>' +
            '<td>' + esc(top && top.id !== UNCAT ? top.name : 'Uncategorized') + (sub ? '<div class="muted small">' + esc(sub.name) + '</div>' : '') +
              (sug ? '<div class="muted small">Suggested: ' + esc(sug) + '</div>' : '') + '</td>' +
            '<td>' + (r.ticket_id ? esc(r.ticket_id) + '<div class="muted small">' + esc(r.ticket_status) + '</div>' : '<span class="muted">—</span>') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>' +
        '<div class="pager"><span class="muted">Showing ' + fmtNum(start + 1) + '–' + fmtNum(start + rows.length) + ' of ' + fmtNum(list.length) + '</span>' +
        '<div class="btn-row"><button data-action="ex-page" data-value="prev"' + (ex.page <= 1 ? ' disabled' : '') + '>Previous</button>' +
        '<span>Page ' + ex.page + ' of ' + pages + '</span>' +
        '<button data-action="ex-page" data-value="next"' + (ex.page >= pages ? ' disabled' : '') + '>Next</button></div></div>') +
      '</section>';
  }

  function renderDetail() {
    const box = document.getElementById('ex-detail');
    if (!box) return;
    const r = store.questions[state.ex.selected];
    if (!r) {
      box.innerHTML = '<h2>Question details</h2><p class="muted">Select a question in the list to see its full record here.</p>';
      return;
    }
    const events = (r.ticket_events || []).map(function (e) {
      return '<li>' + esc(e.status) + ' · ' + esc(fmtDate(e.at)) + '</li>';
    }).join('');
    const catHist = (r.category_history || []).map(function (h) {
      return '<li>' + esc(h.from) + ' → ' + esc(h.to) + ' · ' + esc(fmtDate(h.at)) + '</li>';
    }).join('');
    const sug = suggestionLabel(r);
    const sugSource = r.suggestion_source === 'chatbot' ? 'from the chatbot' : 'from keyword rules';
    const isUncat = r.category_id === UNCAT;

    box.innerHTML =
      '<div class="card-head"><h2>Question ' + esc(r.question_id) + '</h2></div>' +
      '<dl>' +
        '<dt>Original question</dt><dd><div class="pre">' + esc(r.question_text) + '</div></dd>' +
        '<dt>Chatbot response</dt><dd>' + (r.response_text ? '<div class="pre">' + esc(r.response_text) + '</div>' : '<span class="muted">No response was returned.</span>') + '</dd>' +
        '<dt>Submitted</dt><dd>' + esc(fmtDate(r.submitted_at)) + '</dd>' +
        '<dt>Conversation</dt><dd>' + esc(r.conversation_id || '—') + '</dd>' +
        '<dt>Source system</dt><dd>' + esc(r.source_system) + '</dd>' +
        '<dt>Current status</dt><dd>' + badge(r.resolution_status) + '</dd>' +
        '<dt>Answer source</dt><dd>' + esc(r.answer_source || '—') + '</dd>' +
        '<dt>Ticket</dt><dd>' + (r.ticket_id
          ? esc(r.ticket_id) + '<div class="btn-row" style="margin-top:6px"><label class="small muted">Ticket status ' +
            '<select data-change="ticket-status" data-id="' + esc(r.question_id) + '">' + ticketStatusOptions(r.ticket_status) + '</select></label></div>' +
            (events ? '<ul class="history">' + events + '</ul>' : '')
          : '<span class="muted">No ticket</span>') + '</dd>' +
        '<dt>Resolved on</dt><dd>' + esc(r.resolution_timestamp ? fmtDate(r.resolution_timestamp) : '—') + '</dd>' +
        '<dt>Resolution note</dt><dd>' +
          '<textarea id="d-note" rows="3" style="width:100%;max-width:520px" placeholder="What the agent did to resolve it">' + esc(r.resolution_note || '') + '</textarea>' +
          '<div class="btn-row" style="margin-top:6px"><label class="small muted">Flag <input type="text" id="d-flag" value="' + esc(r.flag || '') + '" placeholder="e.g. Standardize" style="width:220px"></label>' +
          '<button data-action="save-notes" data-id="' + esc(r.question_id) + '">Save note and flag</button></div>' +
        '</dd>' +
        '<dt>Category</dt><dd>' + esc(isUncat ? 'Not confirmed yet' : catLabel(r.category_id, r.subcategory_id)) +
          (sug ? '<div class="notice" style="margin-top:8px"><strong>Suggested ' + esc(sugSource) + ':</strong> ' + esc(sug) +
            '<div class="btn-row" style="margin-top:6px"><button class="primary" data-action="accept-suggestion" data-id="' + esc(r.question_id) + '">Accept suggestion</button></div></div>' : '') +
          '<div class="btn-row" style="margin-top:6px">' +
            '<select id="d-cat" aria-label="Category">' + categoryOptions(r.subcategory_id || r.category_id) + '</select>' +
            '<button data-action="save-category" data-id="' + esc(r.question_id) + '">Save category</button></div>' +
          (catHist ? '<ul class="history">' + catHist + '</ul>' : '') +
        '</dd>' +
      '</dl>' +
      '<div class="btn-row" style="margin-top:16px"><button class="danger" data-action="delete-q" data-id="' + esc(r.question_id) + '">Delete this record</button></div>';
  }

  // ---------- Knowledge Gaps ----------

  function decisionKey(type, key) { return type + ':' + key; }

  function decisionBadge(type, key) {
    const d = store.manual[decisionKey(type, key)];
    if (!d) return '<span class="badge plain">Open</span>';
    return d.state === 'accepted' ? '<span class="badge answer">Accepted</span>' : '<span class="badge plain">Dismissed</span>';
  }

  function decisionButtons(type, key) {
    const k = esc(key);
    return '<div class="btn-row">' +
      '<button data-action="decide" data-type="' + type + '" data-key="' + k + '" data-value="accepted">Accept</button>' +
      '<button data-action="decide" data-type="' + type + '" data-key="' + k + '" data-value="dismissed">Dismiss</button></div>';
  }

  function renderGaps() {
    destroyCharts();
    const range = currentRange();
    const qs = A.filterRange(all(), range);
    const g = A.gaps(qs, store.categories, { minSample: 5 });
    const ms = A.manualSuggestions(qs, store.categories, { minTickets: 3, minFollowUps: 2 });
    const uncat = qs.filter(function (q) { return q.category_id === UNCAT; });
    const terms = A.suggestTerms(uncat, 14);

    const rankList = function (list, key) {
      if (!list.length) return '<p class="muted">Not enough questions yet. A category needs at least ' + g.minSample + ' questions.</p>';
      return '<ol>' + list.map(function (c) {
        return '<li style="margin-bottom:8px"><strong>' + esc(c.name) + '</strong> · ' + fmtPct(c[key]) +
          ' <span class="muted small">(' + fmtNum(c.total) + ' questions)</span></li>';
      }).join('') + '</ol>';
    };

    const suggestionTable = function (type, rows, columns, emptyText) {
      if (!rows.length) return '<div class="empty">' + esc(emptyText) + '</div>';
      return '<div class="table-wrap"><table><thead><tr><th>Topic</th><th>Why</th><th class="num">Closed tickets</th>' +
        '<th>Examples and notes</th><th>Decision</th></tr></thead><tbody>' +
        rows.map(function (r) {
          const detail = (columns === 'manual')
            ? r.examples.map(function (x) { return '<div>“' + esc(x) + '”</div>'; }).join('')
            : (r.notes && r.notes.length ? r.notes.map(function (n) { return '<div>Note: ' + esc(n) + '</div>'; }).join('') : '') +
              (r.examples && r.examples.length ? r.examples.slice(0, 2).map(function (x) { return '<div class="muted">“' + esc(x) + '”</div>'; }).join('') : '');
          return '<tr><td><strong>' + esc(r.topic) + '</strong></td><td>' + esc(r.reason) + '</td>' +
            '<td class="num">' + fmtNum(r.closed) + '</td><td class="small">' + detail + '</td>' +
            '<td>' + decisionBadge(type, r.key) + '<div style="margin-top:6px">' + decisionButtons(type, r.key) + '</div></td></tr>';
        }).join('') + '</tbody></table></div>';
    };

    const improveRows = ms.improveAnswers;
    const improveHtml = improveRows.length === 0
      ? '<div class="empty">No answer has been followed by a ticket in the same conversation more than once.</div>'
      : '<div class="table-wrap"><table><thead><tr><th>Answer source</th><th>Topic</th><th class="num">Follow-up tickets</th><th>Example question</th><th>Decision</th></tr></thead><tbody>' +
        improveRows.map(function (f) {
          return '<tr><td><strong>' + esc(f.source) + '</strong></td><td>' + esc(f.topic) + '</td><td class="num">' + fmtNum(f.count) +
            '</td><td class="small">“' + esc(f.example) + '”</td><td>' + decisionBadge('improve', f.source) + '<div style="margin-top:6px">' +
            decisionButtons('improve', f.source) + '</div></td></tr>';
        }).join('') + '</tbody></table></div>';

    const acceptedCount = Object.keys(store.manual).filter(function (k) { return store.manual[k].state === 'accepted'; }).length;

    view().innerHTML =
      '<div class="page-head"><h1>Knowledge Gaps</h1>' +
      '<p class="muted">' + esc(range.label) + ' · Questions the chatbot could not answer, and what to add or standardize.</p></div>' +
      '<section class="kpis">' +
        kpi('Ticketed questions', fmtNum(g.ticketedCount), fmtPct(g.ticketedPct) + ' of questions', 'Ticket Open plus Ticket Closed.', 'ticket') +
        kpi('Ticket Open', fmtNum(g.open), 'Still waiting on a person', 'Tickets that are not yet resolved.', 'ticket') +
        kpi('Ticket Closed', fmtNum(g.closed), 'Resolved by a person', 'Tickets that were resolved or closed. These drive manual suggestions.', 'closed') +
        kpi('Repeated questions', fmtNum(g.repeats.length), 'Same wording, asked 2+ times', 'Groups of ticketed questions with the same wording.', '') +
      '</section>' +
      '<section class="card"><h2>Ticketed questions by category</h2>' +
        '<div class="table-wrap"><table><thead><tr><th>Category</th><th class="num">Questions</th><th class="num">Ticketed</th>' +
        '<th class="num">Ticket Open</th><th class="num">Ticket Closed</th><th class="num">Ticket rate</th></tr></thead><tbody>' +
        g.byCategory.map(function (c) {
          const small = c.total < g.minSample ? ' <span class="muted small">(small sample)</span>' : '';
          return '<tr><td>' + esc(c.name) + '</td><td class="num">' + fmtNum(c.total) + '</td><td class="num">' + fmtNum(c.ticketed) +
            '</td><td class="num">' + fmtNum(c.open) + '</td><td class="num">' + fmtNum(c.closed) + '</td><td class="num">' + fmtPct(c.ticketRate) + small + '</td></tr>';
        }).join('') +
        '</tbody></table></div></section>' +
      '<div class="grid-2">' +
        '<section class="card"><h2>Highest ticket rates</h2>' + rankList(g.highestTicketRate, 'ticketRate') + '</section>' +
        '<section class="card"><h2>Possible new categories</h2>' +
          '<p class="muted small">Frequent words in questions that are still uncategorized (' + fmtNum(uncat.length) + ').</p>' +
          (terms.length ? '<div class="btn-row">' + terms.map(function (t) {
            return '<span class="badge plain">' + esc(t.term) + ' · ' + fmtNum(t.count) + '</span>';
          }).join('') + '</div>' : '<p class="muted">Nothing to suggest yet.</p>') +
        '</section>' +
      '</div>' +

      '<section class="card"><div class="card-head"><h2>Manual suggestions</h2>' +
        '<button data-action="export-decisions">Download accepted suggestions (CSV)</button></div>' +
        '<p class="muted">Built from closed tickets: questions a person resolved. Accept what you want to add to the manual, then download the list for whoever maintains it. ' +
        fmtNum(acceptedCount) + ' accepted so far.</p></section>' +

      '<section class="card"><h2>Add to the manual</h2>' +
        '<p class="muted small">Topics with several closed tickets where the chatbot rarely answers. Threshold: ' + ms.minTickets + ' closed tickets.</p>' +
        suggestionTable('manual', ms.addToManual, 'manual', 'No topic has enough closed tickets with few chatbot answers yet.') +
      '</section>' +

      '<section class="card"><h2>Standardize</h2>' +
        '<p class="muted small">Topics where agents flagged questions, or wrote different resolution notes for the same kind of question.</p>' +
        suggestionTable('standardize', ms.standardize, 'standardize', 'No standardization issues found. Flags and resolution notes appear here once they are imported.') +
      '</section>' +

      '<section class="card"><h2>Improve an answer</h2>' +
        '<p class="muted small">Answers that were followed by a ticket later in the same conversation. The answer may not have resolved the question.</p>' +
        improveHtml +
      '</section>' +

      '<section class="card"><h2>Most repeated ticketed questions</h2>' +
        (g.repeats.length === 0
          ? '<div class="empty">No ticketed question has been asked more than once in this period.</div>'
          : '<div class="table-wrap"><table><thead><tr><th>Question</th><th class="num">Times asked</th><th class="num">Ticket Open</th>' +
            '<th class="num">Ticket Closed</th><th>Category</th><th>Last asked</th><th></th></tr></thead><tbody>' +
            g.repeats.slice(0, 20).map(function (x) {
              return '<tr><td class="q-cell">' + esc(x.sampleText) + '</td><td class="num">' + fmtNum(x.count) + '</td>' +
                '<td class="num">' + fmtNum(x.open) + '</td><td class="num">' + fmtNum(x.closed) + '</td>' +
                '<td>' + esc(catLabel(x.categoryId)) + '</td><td style="white-space:nowrap">' + esc(fmtDate(x.lastSeen)) + '</td>' +
                '<td><button class="link" data-action="gap-search" data-text="' + esc(x.sampleText) + '">Open in explorer</button></td></tr>';
            }).join('') +
            '</tbody></table></div>') +
        '<p class="muted small">"Repeated" means the same wording after ignoring capitals, punctuation and a leading greeting.</p>' +
      '</section>';
  }

  // ---------- Data Management ----------

  function issueTable(title, headers, rows, extra) {
    return '<h3>' + esc(title) + '</h3><div class="table-wrap"><table><thead><tr>' +
      headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>' + (extra ? '<p class="muted small">' + esc(extra) + '</p>' : '');
  }

  function importPreview(p) {
    const r = p.result;
    const more = function (arr) { return arr.length > 25 ? 'Showing the first 25 of ' + fmtNum(arr.length) + '.' : ''; };
    return '<div class="notice' + (r.rejected.length ? ' warn' : '') + '">' +
      '<strong>Preview of ' + esc(p.filename) + '</strong> (' + fmtNum(p.total) + ' rows)' +
      '<ul><li><strong>' + fmtNum(r.accepted.length) + '</strong> ready to add</li>' +
      '<li>' + fmtNum(r.duplicates.length) + ' skipped as duplicates</li>' +
      '<li>' + fmtNum(r.rejected.length) + ' rejected (missing or invalid fields, including a missing status)</li>' +
      '<li>' + fmtNum(r.warnings.length) + ' added with warnings</li></ul>' +
      '<div class="btn-row" style="margin-top:10px">' +
        (r.accepted.length ? '<button class="primary" data-action="import-commit">Add ' + fmtNum(r.accepted.length) + ' records</button>' : '') +
        '<button data-action="import-cancel">Cancel</button></div></div>' +
      (r.rejected.length ? issueTable('Rejected rows', ['Row', 'question_id', 'Problems'],
        r.rejected.slice(0, 25).map(function (x) { return [x.row, x.id || '—', x.errors.join('; ')]; }), more(r.rejected)) : '') +
      (r.duplicates.length ? issueTable('Skipped duplicates', ['Row', 'question_id', 'Matches'],
        r.duplicates.slice(0, 25).map(function (x) { return [x.row, x.id, x.where]; }), more(r.duplicates)) : '') +
      (r.warnings.length ? issueTable('Added with warnings', ['Row', 'question_id', 'Notes'],
        r.warnings.slice(0, 25).map(function (x) { return [x.row, x.id, x.messages.join('; ')]; }), more(r.warnings)) : '');
  }

  function renderData() {
    destroyCharts();
    const count = Object.keys(store.questions).length;
    const sampleCount = all().filter(function (q) { return q.source_system === D.SAMPLE_SOURCE; }).length;
    const uncat = all().filter(function (q) { return q.category_id === UNCAT; })
      .sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; });
    const withSuggestion = uncat.filter(function (q) { return q.suggested_category_id; }).length;
    const counts = {};
    all().forEach(function (q) { counts[q.category_id] = (counts[q.category_id] || 0) + 1; });
    const tops = store.categories.filter(function (c) { return !c.parentId; });

    const catRows = tops.map(function (t) {
      const subs = store.categories.filter(function (s) { return s.parentId === t.id; });
      const topRow = '<tr><td><strong>' + esc(t.name) + '</strong></td><td class="num">' + fmtNum(counts[t.id] || 0) + '</td><td class="num">' +
        (t.id === UNCAT ? '' :
          '<button data-action="cat-rename" data-id="' + esc(t.id) + '">Rename</button> ' +
          '<button class="danger" data-action="cat-delete" data-id="' + esc(t.id) + '">Delete</button>') + '</td></tr>';
      const subRows = subs.map(function (s) {
        const n = all().filter(function (q) { return q.subcategory_id === s.id; }).length;
        return '<tr><td style="padding-left:28px">› ' + esc(s.name) + '</td><td class="num">' + fmtNum(n) + '</td><td class="num">' +
          '<button data-action="cat-rename" data-id="' + esc(s.id) + '">Rename</button> ' +
          '<button class="danger" data-action="cat-delete" data-id="' + esc(s.id) + '">Delete</button></td></tr>';
      }).join('');
      return topRow + subRows;
    }).join('');

    const activity = store.activity.slice(0, 50);

    view().innerHTML =
      '<div class="page-head"><h1>Data Management</h1>' +
      '<p class="muted">' + fmtNum(count) + ' questions are stored in this browser.</p></div>' +

      '<section class="card"><h2>Sample data</h2>' +
        '<p class="muted">Made-up questions for trying the dashboard. Currently stored: ' + fmtNum(sampleCount) + '.</p>' +
        '<div class="btn-row">' +
          '<button class="primary" data-action="load-sample">Load sample data</button>' +
          '<button data-action="remove-sample"' + (sampleCount ? '' : ' disabled') + '>Remove sample data</button>' +
        '</div></section>' +

      '<section class="card"><h2>Import questions</h2>' +
        '<p class="muted">Choose a CSV or JSON file. Every row is checked first, and nothing is added until you confirm. ' +
        'Records whose question_id is already stored are skipped. <a href="#/integrations">See the expected columns</a>.</p>' +
        '<input type="file" id="import-file" accept=".csv,.json,text/csv,application/json" data-change="import-file">' +
        '<div id="import-preview">' + (state.pendingImport ? importPreview(state.pendingImport) : '') + '</div>' +
      '</section>' +

      '<section class="card"><h2>Export</h2>' +
        '<div class="btn-row">' +
          '<button data-action="export-csv">Download questions (CSV)</button>' +
          '<button data-action="export-json">Download questions (JSON)</button>' +
          '<button data-action="export-backup">Download full backup (JSON)</button>' +
        '</div>' +
        '<p class="muted small">Backups include categories, settings and manual decisions. They contain question text, so store them securely.</p>' +
      '</section>' +

      '<section class="card"><h2>Retention</h2>' +
        '<p class="muted">Questions submitted before the cut-off can be deleted. The default is 12 months.</p>' +
        '<div class="btn-row">' +
          '<label>Keep questions for <input type="number" id="retention-months" min="1" max="120" value="' + esc(store.settings.retentionMonths) + '" style="width:80px"> months</label>' +
          '<button data-action="retention-save">Save setting</button>' +
          '<button class="danger" data-action="retention-apply">Delete questions older than this</button>' +
        '</div></section>' +

      '<section class="card"><h2>Categories</h2>' +
        '<p class="muted">Changes apply to every question. Deleting a category moves its questions to Other / Uncategorized.</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Category</th><th class="num">Questions</th><th></th></tr></thead><tbody>' + catRows + '</tbody></table></div>' +
        '<h3>Add a category</h3>' +
        '<div class="btn-row"><input type="text" id="new-cat" placeholder="Category name"><button data-action="cat-add">Add category</button></div>' +
        '<h3>Add a subcategory</h3>' +
        '<div class="btn-row"><select id="new-sub-parent" aria-label="Parent category">' +
          tops.filter(function (t) { return t.id !== UNCAT; }).map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('') +
        '</select><input type="text" id="new-sub" placeholder="Subcategory name"><button data-action="cat-add-sub">Add subcategory</button></div>' +
      '</section>' +

      '<section class="card"><h2>Questions needing a category</h2>' +
        '<p class="muted">' + fmtNum(uncat.length) + ' questions have no confirmed category. ' + fmtNum(withSuggestion) + ' have a suggestion ready to accept.' +
        (uncat.length > 50 ? ' Showing the newest 50.' : '') + '</p>' +
        (withSuggestion ? '<div class="btn-row" style="margin-bottom:10px"><button class="primary" data-action="accept-all-suggestions">Accept all suggestions</button></div>' : '') +
        (uncat.length === 0 ? '<div class="empty">Everything is categorized.</div>' :
          '<div class="table-wrap"><table><thead><tr><th>Question</th><th>Submitted</th><th>Suggested</th><th>Choose category</th></tr></thead><tbody>' +
          uncat.slice(0, 50).map(function (q) {
            const sug = suggestionLabel(q);
            return '<tr><td class="q-cell">' + esc(q.question_text) + '</td><td style="white-space:nowrap">' + esc(fmtDate(q.submitted_at)) + '</td>' +
              '<td>' + (sug ? esc(sug) + '<div><button class="link" data-action="accept-suggestion" data-id="' + esc(q.question_id) + '">Accept</button></div>' : '<span class="muted">—</span>') + '</td>' +
              '<td><select data-change="uncat-assign" data-id="' + esc(q.question_id) + '"><option value="">Choose…</option>' +
              categoryOptions(null, UNCAT) + '</select></td></tr>';
          }).join('') + '</tbody></table></div>') +
      '</section>' +

      '<section class="card"><h2>Activity</h2>' +
        (activity.length === 0 ? '<p class="muted">No imports, deletions or sample loads yet.</p>' :
          '<div class="table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>Details</th></tr></thead><tbody>' +
          activity.map(function (a) {
            return '<tr><td style="white-space:nowrap">' + esc(fmtDate(a.at)) + '</td><td>' + esc(a.type) + '</td><td>' + esc(a.text) + '</td></tr>';
          }).join('') + '</tbody></table></div>') +
      '</section>' +

      '<section class="card"><h2>Erase all data</h2>' +
        '<p class="muted">Removes every stored question, category change, setting and manual decision in this browser. Download a backup first.</p>' +
        '<button class="danger" data-action="clear-all">Erase all data</button></section>';
  }

  // ---------- Integrations (simulated) ----------

  function renderIntegrations() {
    destroyCharts();
    const last = store.activity.find(function (a) { return a.type === 'import' || a.type === 'sample'; });
    const row = function (name, type, status, detail) {
      return '<tr><td>' + esc(name) + '</td><td>' + esc(type) + '</td><td>' + status + '</td><td>' + esc(detail) + '</td></tr>';
    };
    const active = '<span class="badge answer">Active</span>';
    const avail = '<span class="badge plain">Available</span>';
    const planned = '<span class="badge plain">Not connected</span>';
    view().innerHTML =
      '<div class="page-head"><h1>Integrations</h1>' +
      '<p class="muted">Simulated for now. This app does not connect to the chatbot, and no credentials are needed.</p></div>' +
      '<section class="card"><h2>Data sources</h2><div class="table-wrap"><table>' +
        '<thead><tr><th>Source</th><th>Type</th><th>Status</th><th>Last activity</th></tr></thead><tbody>' +
        row('Sample data generator', 'Built in', active, 'Creates made-up questions') +
        row('CSV and JSON file import', 'Manual', avail, last ? fmtDate(last.at) : 'No imports yet') +
        row('Chatbot live connection', 'API or database', planned, 'Planned. Will replace file import as the source.') +
        row('Webhook from chatbot', 'Push', planned, 'Planned') +
      '</tbody></table></div></section>' +
      '<section class="card"><h2>Expected record format</h2>' +
        '<p class="muted">Every source sends one row per question. Column names are case-insensitive and may use spaces or underscores.</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Field</th><th>Required</th><th>What it holds</th></tr></thead><tbody>' +
        [
          ['question_id', 'Yes', 'Unique ID for the question. Duplicates are skipped.'],
          ['question_text', 'Yes', 'The question as the user typed it (up to 2,000 characters).'],
          ['submitted_at', 'Yes', 'Date and time the question was submitted (ISO format, such as 2026-06-01T14:22:00Z).'],
          ['resolution_status', 'Yes', 'Exactly one of: Answered, Ticket Open, Ticket Closed. Anything else is rejected.'],
          ['source_system', 'No', 'Which chatbot or channel sent the question.'],
          ['conversation_id', 'No', 'Groups questions asked in the same conversation.'],
          ['response_text', 'No', 'The chatbot answer, when one was returned.'],
          ['answer_source', 'No', 'Where the answer came from, such as a document name.'],
          ['ticket_id', 'If a ticket', 'Support ticket ID.'],
          ['ticket_status', 'No', 'Open, In Progress, Resolved or Closed. Resolved or Closed means Ticket Closed.'],
          ['resolution_timestamp', 'No', 'When the ticket was resolved.'],
          ['resolution_note', 'No', 'What the agent did to resolve the ticket. Used for standardization.'],
          ['flag', 'No', 'Free-text flag from the agent, such as Standardize.'],
          ['category', 'No', 'Confirmed category name. Leave blank to have it suggested.'],
          ['subcategory', 'No', 'Confirmed subcategory name under the category.'],
          ['suggested_category', 'No', 'Category the chatbot suggests. An admin accepts or changes it.']
        ].map(function (f) {
          return '<tr><td><code>' + esc(f[0]) + '</code></td><td>' + esc(f[1]) + '</td><td>' + esc(f[2]) + '</td></tr>';
        }).join('') +
        '</tbody></table></div></section>';
  }

  // ---------- routing ----------

  const PAGES = {
    overview: renderOverview,
    explorer: renderExplorer,
    gaps: renderGaps,
    data: renderData,
    integrations: renderIntegrations
  };

  function route() {
    const name = (location.hash.replace(/^#\/?/, '') || 'overview');
    const page = PAGES[name] ? name : 'overview';
    if (page !== 'data') state.pendingImport = null;
    // The reporting period applies only to pages that report on trends and totals.
    const usesPeriod = page === 'overview' || page === 'gaps';
    document.querySelector('.range').hidden = !usesPeriod;
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.dataset.nav === page);
      if (a.dataset.nav === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    PAGES[page]();
    window.scrollTo(0, 0);
  }

  function go(page) {
    if (location.hash === '#/' + page) route();
    else location.hash = '#/' + page;
  }

  // ---------- downloads ----------

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function stamp() { return new Date().toISOString().slice(0, 10); }

  function sortedRecords() {
    return all().sort(function (a, b) { return a.submitted_at < b.submitted_at ? -1 : 1; });
  }

  // ---------- import and sample data ----------

  function addRecords(result, filename, type) {
    result.accepted.forEach(function (r) { store.questions[r.question_id] = r; });
    logActivity(type, 'Added ' + fmtNum(result.accepted.length) + ' from ' + filename +
      (result.duplicates.length ? ', skipped ' + fmtNum(result.duplicates.length) + ' duplicates' : '') +
      (result.rejected.length ? ', rejected ' + fmtNum(result.rejected.length) : ''));
    return saveStore();
  }

  function loadSample(silent) {
    const rows = D.generateSampleRows(1500, new Date());
    const result = D.prepareImport(rows, { categories: store.categories, now: new Date(), existingIds: new Set(Object.keys(store.questions)) });
    addRecords(result, 'sample data', 'sample');
    if (!silent) {
      toast('Sample data added: ' + fmtNum(result.accepted.length) + ' questions' +
        (result.duplicates.length ? ' (' + fmtNum(result.duplicates.length) + ' already stored)' : '') + '.');
    }
  }

  function handleImportFile(file) {
    file.text().then(function (text) {
      const isJson = /\.json$/i.test(file.name);
      const parsed = isJson ? D.parseJSONImport(text) : D.parseCSV(text);
      if (parsed.error) { toast(parsed.error, true); return; }
      if (!parsed.records.length) { toast('No records were found in that file.', true); return; }
      const result = D.prepareImport(parsed.records, {
        categories: store.categories,
        now: new Date(),
        existingIds: new Set(Object.keys(store.questions))
      });
      state.pendingImport = { filename: file.name, total: parsed.records.length, result: result };
      renderData();
    }).catch(function () {
      toast('That file could not be read.', true);
    });
  }

  function acceptSuggestionFor(r) {
    if (!r || !r.suggested_category_id) return false;
    return setRecordCategory(r, r.suggested_category_id);
  }

  // ---------- event wiring ----------

  const ACTIONS = {
    granularity: function (el) { state.granularity = el.dataset.value; renderOverview(); },

    'ex-select': function (el) {
      state.ex.selected = el.dataset.id;
      renderExResults();
      renderDetail();
      const box = document.getElementById('ex-detail');
      if (box) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    'ex-page': function (el) {
      state.ex.page += el.dataset.value === 'next' ? 1 : -1;
      renderExResults();
    },
    'ex-clear': function () {
      state.ex = { q: '', status: '', category: '', from: '', to: '', sort: 'newest', page: 1, selected: null };
      renderExplorer();
    },
    'save-category': function (el) {
      const r = store.questions[el.dataset.id];
      if (!r) return;
      const value = $('#d-cat').value;
      if (value === (r.subcategory_id || r.category_id) && !r.suggested_category_id) { toast('The category is already set to that.'); return; }
      setRecordCategory(r, value);
      if (saveStore()) toast('Category saved.');
      renderExResults();
      renderDetail();
    },
    'accept-suggestion': function (el) {
      const r = store.questions[el.dataset.id];
      if (!acceptSuggestionFor(r)) return;
      if (saveStore()) toast('Suggested category accepted.');
      if (location.hash === '#/data') renderData(); else { renderExResults(); renderDetail(); }
    },
    'accept-all-suggestions': function () {
      const pending = all().filter(function (q) { return q.category_id === UNCAT && q.suggested_category_id; });
      if (!pending.length) return;
      if (!confirm('Accept ' + fmtNum(pending.length) + ' suggested categories?')) return;
      pending.forEach(acceptSuggestionFor);
      logActivity('category', 'Accepted ' + fmtNum(pending.length) + ' suggested categories');
      saveStore();
      toast('Accepted ' + fmtNum(pending.length) + ' suggestions.');
      renderData();
    },
    'save-notes': function (el) {
      const r = store.questions[el.dataset.id];
      if (!r) return;
      const note = $('#d-note').value.trim().slice(0, 2000);
      const flag = $('#d-flag').value.trim().slice(0, 100);
      r.resolution_note = note;
      r.flag = flag;
      if (saveStore()) toast('Note and flag saved.');
      renderExResults();
      renderDetail();
    },
    'delete-q': function (el) {
      const r = store.questions[el.dataset.id];
      if (!r) return;
      if (!confirm('Delete question ' + r.question_id + '? This cannot be undone.')) return;
      delete store.questions[r.question_id];
      state.ex.selected = null;
      logActivity('delete', 'Deleted question ' + r.question_id);
      saveStore();
      renderExplorer();
      toast('Record deleted.');
    },
    'gap-search': function (el) {
      state.ex = { q: el.dataset.text, status: '', category: '', from: '', to: '', sort: 'newest', page: 1, selected: null };
      go('explorer');
    },

    decide: function (el) {
      const id = el.dataset.type + ':' + el.dataset.key;
      store.manual[id] = { state: el.dataset.value, at: nowIso(), type: el.dataset.type, key: el.dataset.key };
      saveStore();
      renderGaps();
    },
    'export-decisions': function () {
      const rows = Object.keys(store.manual).map(function (k) { return store.manual[k]; })
        .filter(function (d) { return d.state === 'accepted'; })
        .map(function (d) {
          return { type: d.type, topic_or_source: d.key, decided_at: d.at };
        });
      if (!rows.length) { toast('Accept at least one suggestion first.', true); return; }
      download('manual-suggestions-' + stamp() + '.csv', D.toCSV(rows, ['type', 'topic_or_source', 'decided_at']), 'text/csv;charset=utf-8');
    },

    'load-sample': function () { loadSample(false); renderData(); },
    'remove-sample': function () {
      const ids = all().filter(function (q) { return q.source_system === D.SAMPLE_SOURCE; }).map(function (q) { return q.question_id; });
      if (!ids.length) return;
      if (!confirm('Remove ' + fmtNum(ids.length) + ' sample questions? Your own records are not affected.')) return;
      ids.forEach(function (id) { delete store.questions[id]; });
      logActivity('delete', 'Removed ' + fmtNum(ids.length) + ' sample questions');
      saveStore();
      toast('Sample data removed.');
      renderData();
    },
    'import-commit': function () {
      const p = state.pendingImport;
      if (!p) return;
      const n = p.result.accepted.length;
      if (addRecords(p.result, p.filename, 'import')) toast('Added ' + fmtNum(n) + ' records.');
      state.pendingImport = null;
      renderData();
    },
    'import-cancel': function () { state.pendingImport = null; renderData(); },

    'export-csv': function () {
      const rows = sortedRecords().map(function (q) { return D.toExportRow(q, store.categories); });
      download('questions-' + stamp() + '.csv', D.toCSV(rows, D.EXPORT_COLUMNS), 'text/csv;charset=utf-8');
    },
    'export-json': function () {
      const rows = sortedRecords().map(function (q) { return D.toExportRow(q, store.categories); });
      download('questions-' + stamp() + '.json', JSON.stringify(rows, null, 2), 'application/json');
    },
    'export-backup': function () {
      const backup = {
        app: 'question-analytics',
        format_version: 2,
        exported_at: nowIso(),
        settings: store.settings,
        categories: store.categories,
        manual: store.manual,
        questions: sortedRecords()
      };
      download('question-analytics-backup-' + stamp() + '.json', JSON.stringify(backup, null, 2), 'application/json');
    },

    'retention-save': function () {
      const months = Number(document.getElementById('retention-months').value);
      if (!(months >= 1 && months <= 120)) { toast('Enter a number of months from 1 to 120.', true); return; }
      store.settings.retentionMonths = Math.round(months);
      if (saveStore()) toast('Retention set to ' + store.settings.retentionMonths + ' months.');
      renderData();
    },
    'retention-apply': function () {
      const months = store.settings.retentionMonths;
      const ids = D.recordsPastRetention(all(), months, new Date());
      if (!ids.length) { toast('No questions are older than ' + months + ' months.'); return; }
      if (!confirm('Delete ' + fmtNum(ids.length) + ' questions submitted more than ' + months + ' months ago? This cannot be undone.')) return;
      ids.forEach(function (id) { delete store.questions[id]; });
      logActivity('retention', 'Deleted ' + fmtNum(ids.length) + ' questions older than ' + months + ' months');
      saveStore();
      toast('Deleted ' + fmtNum(ids.length) + ' questions.');
      renderData();
    },

    'cat-add': function () {
      const name = document.getElementById('new-cat').value.trim();
      if (!name) { toast('Type a category name first.', true); return; }
      if (store.categories.some(function (c) { return !c.parentId && D.normalizeKey(c.name) === D.normalizeKey(name); })) {
        toast('That category already exists.', true); return;
      }
      store.categories.push({ id: 'c-' + Date.now().toString(36), name: name, parentId: null });
      logActivity('category', 'Added category "' + name + '"');
      saveStore();
      renderData();
    },
    'cat-add-sub': function () {
      const name = document.getElementById('new-sub').value.trim();
      const parent = document.getElementById('new-sub-parent').value;
      if (!name) { toast('Type a subcategory name first.', true); return; }
      if (store.categories.some(function (c) { return c.parentId === parent && D.normalizeKey(c.name) === D.normalizeKey(name); })) {
        toast('That subcategory already exists here.', true); return;
      }
      store.categories.push({ id: 's-' + Date.now().toString(36), name: name, parentId: parent });
      logActivity('category', 'Added subcategory "' + name + '"');
      saveStore();
      renderData();
    },
    'cat-rename': function (el) {
      const cat = catMap().get(el.dataset.id);
      if (!cat) return;
      const name = (window.prompt('New name for "' + cat.name + '"', cat.name) || '').trim();
      if (!name || name === cat.name) return;
      logActivity('category', 'Renamed "' + cat.name + '" to "' + name + '"');
      cat.name = name;
      saveStore();
      renderData();
    },
    'cat-delete': function (el) {
      const cat = catMap().get(el.dataset.id);
      if (!cat || cat.id === UNCAT) return;
      const ids = new Set([cat.id]);
      if (!cat.parentId) store.categories.filter(function (c) { return c.parentId === cat.id; }).forEach(function (c) { ids.add(c.id); });
      const affected = all().filter(function (q) { return ids.has(q.category_id) || ids.has(q.subcategory_id); });
      if (!confirm('Delete "' + cat.name + '"? ' + fmtNum(affected.length) + ' questions will move to Other / Uncategorized where needed.')) return;
      const at = nowIso();
      affected.forEach(function (q) {
        const before = catLabel(q.category_id, q.subcategory_id);
        if (ids.has(q.category_id)) { q.category_id = UNCAT; q.subcategory_id = null; }
        else if (ids.has(q.subcategory_id)) { q.subcategory_id = null; }
        const after = catLabel(q.category_id, q.subcategory_id);
        q.category_history = (q.category_history || []).concat([{ from: before, to: after, at: at }]);
      });
      store.categories = store.categories.filter(function (c) { return !ids.has(c.id); });
      logActivity('category', 'Deleted "' + cat.name + '"');
      saveStore();
      renderData();
    },

    'clear-all': function () {
      if (!confirm('Erase ALL stored questions and settings in this browser? Download a backup first. This cannot be undone.')) return;
      store = newStore();
      state.pendingImport = null;
      saveStore();
      toast('All data erased.');
      renderData();
    }
  };

  const CHANGES = {
    'ex-filter': function (el) {
      state.ex[el.dataset.field] = el.value;
      state.ex.page = 1;
      renderExResults();
    },
    'ticket-status': function (el) {
      const r = store.questions[el.dataset.id];
      if (!r || el.value === r.ticket_status) return;
      const at = nowIso();
      const closed = D.CLOSED_TICKET_STATUSES.indexOf(el.value) !== -1;
      r.ticket_status = el.value;
      r.resolution_status = closed ? STATUS.CLOSED : STATUS.OPEN;
      r.ticket_events = (r.ticket_events || []).concat([{ status: el.value, at: at }]);
      if (closed) {
        if (!r.resolution_timestamp) r.resolution_timestamp = at;
      } else {
        r.resolution_timestamp = '';
      }
      if (saveStore()) toast('Status is now ' + r.resolution_status + '.');
      renderExResults();
      renderDetail();
    },
    'uncat-assign': function (el) {
      const r = store.questions[el.dataset.id];
      if (!r || !el.value) return;
      if (setRecordCategory(r, el.value) && saveStore()) toast('Category assigned.');
      renderData();
    },
    'import-file': function (el) {
      const f = el.files && el.files[0];
      if (f) handleImportFile(f);
    }
  };

  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.addEventListener('change', function (e) {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = CHANGES[el.dataset.change];
    if (fn) fn(el, e);
  });
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'ex-q') {
      state.ex.q = e.target.value;
      state.ex.page = 1;
      renderExResults();
    }
  });

  function syncCustomInputs() {
    const custom = state.range.preset === 'custom';
    $('#custom-range').hidden = !custom;
    $('#range-from').value = state.range.from;
    $('#range-to').value = state.range.to;
  }

  $('#range-preset').addEventListener('change', function (e) {
    state.range.preset = e.target.value;
    syncCustomInputs();
    route();
  });
  $('#range-from').addEventListener('change', function (e) { state.range.from = e.target.value; route(); });
  $('#range-to').addEventListener('change', function (e) { state.range.to = e.target.value; route(); });
  window.addEventListener('hashchange', route);

  // ---------- start ----------

  const firstVisit = localStorage.getItem(STORE_KEY) === null;
  store = loadStore();
  if (firstVisit) {
    loadSample(true);
    toast('Sample data loaded so you can try the dashboard. Remove it in Data Management when you are ready.');
  }
  $('#range-preset').value = state.range.preset;
  syncCustomInputs();
  if (!location.hash) location.hash = '#/overview';
  route();
})();
