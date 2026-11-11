/*
 * Bridge to the HR desk (the page that embeds this tracker in an iframe).
 *
 *   desk -> tracker   { type: 'gap-tracker:rows', rows: [...export-style records], label, sections: [...] }
 *   desk -> tracker   { type: 'gap-tracker:theme', vars: {'--bg': ...}, scheme } and { type: 'gap-tracker:view', view }
 *   tracker -> desk   { type: 'gap-tracker:state', view, has, fixes, due }  (the desk draws the tabs)
 *   tracker -> desk   { type: 'gap-tracker:ready' }       sent once the page is listening
 *                     { type: 'gap-tracker:loaded', count } sent after each load
 *
 * Only messages from the same site are accepted. Standalone use (no desk) is unchanged.
 */
(function () {
  'use strict';
  if (!window.GAP_EMBEDDED || window.parent === window) return;
  const Q = window.QAD;
  const svc = Q.svc;
  const post = function (m) { window.parent.postMessage(m, location.origin); };
  // desk -> tracker: colours and which view to show. tracker -> desk: current state for the tabs.
  Q.hostState = function (s) { post({ type: 'gap-tracker:state', view: s.view, has: s.has, fixes: s.fixes, due: s.due }); };
  function theme(t) {
    const r = document.documentElement;
    Object.keys(t.vars || {}).forEach(function (k) { if (/^--[a-z0-9-]+$/.test(k)) r.style.setProperty(k, String(t.vars[k])); });
    r.dataset.theme = t.scheme === 'dark' ? 'dark' : 'light';
    r.style.colorScheme = t.scheme === 'dark' ? 'dark' : 'light';
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const m = e.data;
    if (m && m.type === 'gap-tracker:theme') { theme(m); return; }
    if (m && m.type === 'gap-tracker:view') { if (Q.goView) Q.goView(m.view); return; }
    if (!m || m.type !== 'gap-tracker:rows' || !Array.isArray(m.rows)) return;
    const ok = svc.loadRows(m.rows, m.label, Array.isArray(m.sections) ? m.sections : []);
    post({ type: 'gap-tracker:loaded', count: ok ? svc.state.records.length : 0 });
  });
  post({ type: 'gap-tracker:ready' });
})();
