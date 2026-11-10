/*
 * Shared bits for the screens: a tiny element builder, number and date words, a toast,
 * file download, and the team's decisions (status, owner, due date, notes) for each gap.
 * Decisions live on this computer and carry over from month to month.
 * Anything that came from the questions file is added to the page as plain text, never as HTML.
 */
(function () {
  'use strict';
  const Q = window.QAD = window.QAD || {};

  // ---------- element builder ----------

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
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    Array.prototype.slice.call(arguments, 2).forEach(function (c) { if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }

  // ---------- words ----------

  const n0 = function (n) { return Math.round(n || 0).toLocaleString('en-US'); };
  const n1 = function (n) { const r = Math.round((n || 0) * 10) / 10; return r.toLocaleString('en-US'); };
  const hours = function (n) { return n < 10 ? n1(n) : n0(n); };
  const norm = function (k) { return String(k || '').trim().toLowerCase(); };
  const fmtDay = function (iso) { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  const fmtShort = function (ms) { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  const todayIso = function () { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const isoToMs = function (iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : 0; };

  // ---------- toast and download ----------

  let toastEl = null;
  let toastTimer = null;
  function toast(text, bad) {
    if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status' }); document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.className = 'toast' + (bad ? ' bad' : '');
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 4500);
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function copyText(text) {
    const done = function () { toast('Copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast('Select the text and copy it.', true); });
    else toast('Select the text and copy it.', true);
  }

  // ---------- decisions ----------

  const KEY = 'manual-improvement-assignments-v1';
  // Four statuses. "new" (not reviewed) and "action" (action item) from earlier versions both read as "To do".
  const STATUS = [
    { id: 'todo', label: 'To do' },
    { id: 'doing', label: 'In progress' },
    { id: 'done', label: 'Done' },
    { id: 'dismissed', label: 'Dismissed' }
  ];
  const canon = function (id) { return id === 'new' || id === 'action' || !id ? 'todo' : id; };
  const statusLabel = function (id) { return (STATUS.filter(function (x) { return x.id === canon(id); })[0] || STATUS[0]).label; };

  let all = {};
  try { all = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { all = {}; }
  const persist = function () { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* storage full or blocked */ } };

  const blank = function () { return { status: 'todo', owner: '', due: '', notes: '', liveOn: '' }; };
  const decision = {
    get: function (key) {
      const a = Object.assign(blank(), all[norm(key)] || {});
      a.status = canon(a.status);
      return a;
    },
    // c is the gap (or a saved snapshot of it). Fields in `patch` are changed; the rest are kept.
    put: function (c, patch) {
      const k = norm(c.key);
      const next = Object.assign(blank(), all[k] || {}, patch);
      next.status = canon(next.status);
      next.at = new Date().toISOString();
      next.theme = c.theme;
      next.snap = { kind: c.kind, category: c.category, tickets: c.tickets, more: c.more, section: c.section || '' };
      if (next.status === 'done' && !next.liveOn) next.liveOn = todayIso(); // "went live on" starts as today
      all[k] = next;
      persist();
      return next;
    },
    // Every gap that has a decision of this status, including ones the questions file no longer lists.
    withStatus: function (status) {
      return Object.keys(all).filter(function (k) { return canon(all[k].status) === status; }).map(function (k) { return { key: k, a: decision.get(k) }; });
    },
    everything: function () { return all; },
    exportFile: function () { return JSON.stringify({ version: 1, savedAt: new Date().toISOString(), assignments: all }, null, 2); },
    // Merge a team file. The newer decision wins. Returns how many were taken.
    importFile: function (text) {
      const data = JSON.parse(text);
      if (!data || typeof data.assignments !== 'object') throw new Error('not a team file');
      let n = 0;
      Object.keys(data.assignments).forEach(function (k) {
        const inc = data.assignments[k];
        if (!inc || typeof inc !== 'object') return;
        const mine = all[k];
        if (mine && String(inc.at || '') <= String(mine.at || '')) return;
        const snap = inc.snap && typeof inc.snap === 'object' ? inc.snap : {};
        all[k] = {
          status: STATUS.some(function (x) { return x.id === canon(inc.status); }) ? canon(inc.status) : 'todo',
          owner: String(inc.owner || '').slice(0, 80), due: String(inc.due || '').slice(0, 10), notes: String(inc.notes || '').slice(0, 2000),
          liveOn: String(inc.liveOn || '').slice(0, 10), at: String(inc.at || ''), theme: String(inc.theme || '').slice(0, 200),
          snap: { kind: snap.kind === 'clarify' ? 'clarify' : 'add', category: String(snap.category || '').slice(0, 80), tickets: Number(snap.tickets) || 0, more: Number(snap.more) || 0, section: String(snap.section || '').slice(0, 120) }
        };
        n++;
      });
      persist();
      return n;
    }
  };

  Q.ui = { h: h, s: s, n0: n0, n1: n1, hours: hours, norm: norm, fmtDay: fmtDay, fmtShort: fmtShort, plural: plural, todayIso: todayIso, isoToMs: isoToMs, toast: toast, download: download, copyText: copyText };
  Q.decision = decision;
  Q.STATUS = STATUS;
  Q.statusLabel = statusLabel;
})();
