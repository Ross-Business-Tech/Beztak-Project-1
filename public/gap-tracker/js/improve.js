/*
 * The changes to make to the manual, ranked, with every question behind each one.
 * Pure functions, no DOM. Used by the executive deck (top three) and by the
 * Manual Improvement Dashboard (all of them, with the drill-down).
 *
 * Ranking uses the last few months together, so one odd month does not reorder the list.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine/data.js'), require('./engine/analytics.js'));
  } else {
    root.QAD = root.QAD || {};
    root.QAD.improve = factory(root.QAD.data, root.QAD.analytics);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (D, A) {
  'use strict';

  const STATUS = D.STATUS;
  const catName = new Map(D.OPS_CATEGORIES.map(function (c) { return [c.id, c.name]; }));
  const themeKey = function (q) { return q.theme || q.normalized_text; };


  /** Every question on one topic (not answered first, newest first) and how people resolved the tickets. */
  function themeDetail(rows) {
    const qs = rows.slice().sort(function (a, z) {
      const ta = a.resolution_status === STATUS.ANSWERED ? 1 : 0;
      const tz = z.resolution_status === STATUS.ANSWERED ? 1 : 0;
      return ta - tz || (a.submitted_at < z.submitted_at ? 1 : -1);
    });
    const notes = new Map();
    qs.forEach(function (q) {
      if (!q.resolution_note) return;
      const n = notes.get(q.resolution_note) || { text: q.resolution_note, count: 0, last: '' };
      n.count++;
      if (q.submitted_at > n.last) n.last = q.submitted_at;
      notes.set(q.resolution_note, n);
    });
    return {
      notes: Array.from(notes.values()).sort(function (a, z) { return z.count - a.count || (a.last < z.last ? 1 : -1); }),
      questions: qs.map(function (q) {
        return {
          id: q.question_id,
          text: q.question_text,
          at: q.submitted_at,
          answered: q.resolution_status === STATUS.ANSWERED,
          reason: A.classOf(q),
          ticketId: q.ticket_id || '',
          ticketStatus: q.ticket_status || '',
          note: q.resolution_note || '',
          section: q.manual_section || ''
        };
      })
    };
  }

  /** Collapses the same question asked in slightly different words into one line with a count. */
  function groupQuestions(questions) {
    const groups = new Map();
    questions.forEach(function (q) {
      const text = A.tidyQuestion(q.text) || q.text;
      const k = text.toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim();
      const g = groups.get(k) || { text: text, count: 0, answered: 0, last: '' };
      g.count++;
      if (q.answered) g.answered++;
      if (q.at > g.last) g.last = q.at;
      groups.set(k, g);
    });
    return Array.from(groups.values()).sort(function (a, z) { return z.count - a.count || (a.last < z.last ? 1 : -1); });
  }

  /**
   * Did a fix work? Compares tickets a week on one topic in the 4 weeks before it went live
   * with the weeks since. Needs at least a week of data after the go-live date.
   * @param records  every question on file up to the month being reported
   */
  function track(records, theme, liveMs, minutes) {
    const DAY = 24 * 60 * 60 * 1000;
    const rows = records.filter(function (q) { return themeKey(q) === theme; });
    const t = function (q) { return Date.parse(q.submitted_at); };
    const isTicket = function (q) { const c = A.classOf(q); return c === 'no-match' || c === 'unclear'; };
    let latest = 0;
    records.forEach(function (q) { const v = t(q); if (v > latest) latest = v; });
    const weeks = (latest - liveMs) / (7 * DAY);
    const before = rows.filter(function (q) { return t(q) < liveMs && t(q) >= liveMs - 28 * DAY && isTicket(q); }).length / 4;
    if (!(liveMs > 0) || weeks < 1) return { ready: false, beforePerWeek: before, weeks: Math.max(0, weeks) };
    const after = rows.filter(function (q) { return t(q) >= liveMs && isTicket(q); });
    const afterRows = rows.filter(function (q) { return t(q) >= liveMs; });
    const afterPerWeek = after.length / weeks;
    const avoided = Math.max(0, (before - afterPerWeek) * weeks);
    return {
      ready: true,
      beforePerWeek: before,
      afterPerWeek: afterPerWeek,
      weeks: weeks,
      cutPct: before > 0 ? Math.max(0, Math.round((1 - afterPerWeek / before) * 100)) : null,
      avoided: avoided,
      hours: (avoided * (minutes || 0)) / 60,
      answeredShare: afterRows.length ? (afterRows.filter(function (q) { return q.resolution_status === STATUS.ANSWERED; }).length / afterRows.length) * 100 : null
    };
  }

  /**
   * @param win      questions in the ranking window (e.g. the last 3 months)
   * @param prevWin  questions in the window of equal length before it (for "rising")
   * @param o        { months: months of data in win, factor: share of repeat questions a fix answers, minutes }
   */
  function build(win, prevWin, o) {
    const months = Math.max(1, o.months || 1);
    const byTheme = new Map();
    win.forEach(function (q) {
      const k = themeKey(q);
      if (!byTheme.has(k)) byTheme.set(k, []);
      byTheme.get(k).push(q);
    });

    return A.themeStats(win, prevWin)
      .filter(function (t) { return !t.resolved && t.tickets >= 3 && (t.kind === 'add' || t.kind === 'clarify'); })
      .sort(function (a, z) { return z.tickets - a.tickets || (a.theme < z.theme ? -1 : 1); })
      .map(function (t, i) {
        const det = themeDetail(byTheme.get(t.theme) || []);
        const qs = det.questions;
        const notes = det.notes;
        const perMonth = t.tickets / months;
        const more = Math.max(1, Math.round(perMonth * o.factor));
        return {
          rank: i + 1,
          key: t.theme,
          theme: t.theme,
          kind: t.kind,
          categoryId: t.categoryId,
          category: catName.get(t.categoryId) || 'Other',
          tickets: t.tickets,
          asked: t.asked,
          answered: t.answered,
          answeredShare: t.answeredShare,
          perMonth: perMonth,
          more: more,
          hours: (more * (o.minutes || 0)) / 60,
          rising: t.rising,
          section: t.section,
          examples: t.examples,
          example: t.examples[0] || t.theme,
          note: t.note,
          notes: notes,
          questions: qs
        };
      });
  }

  return { build: build, themeKey: themeKey, themeDetail: themeDetail, groupQuestions: groupQuestions, track: track };
});
