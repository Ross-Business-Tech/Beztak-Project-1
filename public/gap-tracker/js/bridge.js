/*
 * Bridge to the HR desk (the page that embeds this tracker in an iframe).
 *
 *   desk -> tracker   { type: 'gap-tracker:rows', rows: [...export-style records], label, sections: [...] }
 *   tracker -> desk   { type: 'gap-tracker:ready' }       sent once the page is listening
 *                     { type: 'gap-tracker:loaded', count } sent after each load
 *
 * Only messages from the same site are accepted. Standalone use (no desk) is unchanged.
 */
(function () {
  'use strict';
  if (!window.GAP_EMBEDDED || window.parent === window) return;
  const svc = window.QAD.svc;
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const m = e.data;
    if (!m || m.type !== 'gap-tracker:rows' || !Array.isArray(m.rows)) return;
    const ok = svc.loadRows(m.rows, m.label, Array.isArray(m.sections) ? m.sections : []);
    window.parent.postMessage({ type: 'gap-tracker:loaded', count: ok ? svc.state.records.length : 0 }, location.origin);
  });
  window.parent.postMessage({ type: 'gap-tracker:ready' }, location.origin);
})();
