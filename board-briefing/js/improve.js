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
        const qs = (byTheme.get(t.theme) || []).slice().sort(function (a, z) {
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
      });
  }

  return { build: build, themeKey: themeKey };
});
