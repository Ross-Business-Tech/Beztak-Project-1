/*
 * Settings for running inside the HR desk (index.html?embed=1).
 * Loaded before everything else: it swaps the manual categories for HR topics
 * and switches off "keep the last file in this browser", because the desk supplies live data.
 */
(function () {
  'use strict';
  if (!/[?&]embed=1\b/.test(location.search)) return;
  window.GAP_EMBEDDED = true;
  // The desk shows the tabs itself, so the tracker hides its own menu (no page inside a page).
  document.documentElement.classList.add('embedded');
  window.GAP_CATEGORIES = [
    { id: 'benefits', name: 'Benefits', parentId: null },
    { id: 'payroll', name: 'Payroll', parentId: null },
    { id: 'timeoff', name: 'Time off', parentId: null },
    { id: 'onboarding', name: 'Onboarding', parentId: null },
    { id: 'relations', name: 'Employee relations', parentId: null },
    { id: 'general', name: 'General', parentId: null },
    { id: 'uncategorized', name: 'Other / Uncategorized', parentId: null }
  ];
})();
