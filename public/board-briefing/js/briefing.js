/*
 * Monthly briefing numbers. Pure functions, no DOM, so they can be tested in Node.
 *
 * Takes every question record on file and one calendar month, and works out
 * everything the board slides say. All the heavy lifting (answer rate, why a
 * question went to a person, ranked manual changes, return on updates) is done
 * by the analytics engine in ./engine; this file only frames it by month.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine/data.js'), require('./engine/analytics.js'));
  } else {
    root.QAD = root.QAD || {};
    root.QAD.briefing = factory(root.QAD.data, root.QAD.analytics);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (D, A) {
  'use strict';

  const DAY = 24 * 60 * 60 * 1000;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DEFAULTS = Object.freeze({
    org: 'Operations',
    goal: 65,
    minutesPerTicket: 12,
    brand: '#1E6B52',
    recipients: '',
    preparedBy: '',
    note: ''
  });

  // ---------- months ----------

  function ymOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function parseYm(ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
    return { y: Number(m[1]), m: Number(m[2]) - 1 };
  }
  function shiftYm(ym, n) {
    const p = parseYm(ym);
    return ymOf(new Date(p.y, p.m + n, 1));
  }
  function monthRange(ym) {
    const p = parseYm(ym);
    if (!p) return null;
    return {
      ym: ym,
      start: new Date(p.y, p.m, 1),
      end: new Date(p.y, p.m + 1, 1),
      name: MONTHS[p.m],
      short: MONTHS[p.m].slice(0, 3),
      label: MONTHS[p.m] + ' ' + p.y
    };
  }

  /**
   * Months that appear in the data, oldest first. A month is "complete" when the data
   * reaches the end of it and starts early enough to cover it from the beginning.
   */
  function availableMonths(questions) {
    if (!questions.length) return [];
    const counts = new Map();
    let min = Infinity;
    let max = -Infinity;
    questions.forEach(function (q) {
      const t = Date.parse(q.submitted_at);
      if (t < min) min = t;
      if (t > max) max = t;
      const k = ymOf(new Date(t));
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    const firstYm = ymOf(new Date(min));
    const lastYm = ymOf(new Date(max));
    const out = [];
    for (let k = firstYm; k <= lastYm; k = shiftYm(k, 1)) {
      const r = monthRange(k);
      const startsLate = k === firstYm && min > r.start.getTime() + 6 * DAY;
      const endsEarly = k === lastYm && max < r.end.getTime() - 4 * DAY;
      out.push({ ym: k, label: r.label, count: counts.get(k) || 0, complete: !startsLate && !endsEarly && (counts.get(k) || 0) > 0 });
    }
    return out;
  }

  function defaultMonth(questions) {
    const months = availableMonths(questions).filter(function (m) { return m.complete; });
    return months.length ? months[months.length - 1].ym : null;
  }

  // ---------- helpers ----------

  const inMonth = function (qs, r) {
    return qs.filter(function (q) { const t = Date.parse(q.submitted_at); return t >= r.start.getTime() && t < r.end.getTime(); });
  };
  const round1 = function (n) { return Math.round(n * 10) / 10; };
  const perMonth = function (perWeek) { return (perWeek * 52) / 12; };

  const REASON_INFO = [
    { key: 'no-match', label: 'The manual has nothing on it', help: 'Staff asked about something no section covers.', fixable: true },
    { key: 'unclear', label: 'The section did not settle it', help: 'The bot found a section, but it did not answer the question.', fixable: true },
    { key: 'policy', label: 'Goes to a person by policy', help: 'Personal, confidential and approval questions, on purpose.', fixable: false },
    { key: 'out-of-scope', label: 'Outside the manual', help: 'Not an operating-procedures topic, such as parking or IT.', fixable: false }
  ];

  // ---------- the briefing ----------

  /**
   * @param questions  validated question records (from prepareImport)
   * @param ym         the month to report, 'YYYY-MM'
   * @param settings   { goal, minutesPerTicket, org, ... }
   * @param sections   optional [{ title, category, publishedAt }]
   */
  function build(questions, ym, settings, sections) {
    const cfg = Object.assign({}, DEFAULTS, settings || {});
    const range = monthRange(ym);
    if (!range) throw new Error('Pick a month like 2026-10.');
    const prevRange = monthRange(shiftYm(ym, -1));
    const endMs = range.end.getTime();
    const prevEndMs = prevRange.end.getTime();

    // Nothing after the end of the month is allowed to leak into its numbers.
    const upTo = questions.filter(function (q) { return Date.parse(q.submitted_at) < endMs; });
    const cur = inMonth(upTo, range);
    const prev = inMonth(upTo, prevRange);
    const prevOk = prev.length >= 20;
    const b = A.breakdown(cur);
    const pb = prevOk ? A.breakdown(prev) : null;
    const warnings = [];
    if (cur.length < 20) warnings.push('Only ' + cur.length + ' questions in ' + range.label + '. The numbers may swing a lot.');
    if (!prevOk) warnings.push('There is little or no data for ' + prevRange.label + ', so there is no month-on-month comparison.');

    // Last six months of answer rates, skipping months with no data or a partial first month.
    const monthsInfo = availableMonths(upTo);
    const series = [];
    for (let i = 5; i >= 0; i--) {
      const k = shiftYm(ym, -i);
      const info = monthsInfo.filter(function (m) { return m.ym === k; })[0];
      if (!info || !info.complete) continue;
      const mb = A.breakdown(inMonth(upTo, monthRange(k)));
      series.push({ ym: k, label: monthRange(k).short, total: mb.total, answered: mb.answered, rate: mb.rate });
    }

    // Manual updates published before the end of the month, and what each achieved.
    const metaSections = (sections || []).filter(function (s) { return !s.publishedAt || Date.parse(s.publishedAt) < endMs; });
    const updates = A.publishedUpdates(upTo, metaSections).filter(function (u) { return u.publishedAt < endMs; });
    const minutes = cfg.minutesPerTicket;
    const impacts = updates.map(function (u) {
      const now = A.updateImpact(upTo, u, endMs, minutes);
      let before = 0;
      if (u.publishedAt < prevEndMs) {
        before = A.updateImpact(upTo.filter(function (q) { return Date.parse(q.submitted_at) < prevEndMs; }), u, prevEndMs, minutes).answersSince;
      }
      const thisMonth = Math.max(0, now.answersSince - before);
      const fewerPerWeek = now.ticketsBeforePerWeek != null && now.ticketsAfterPerWeek != null
        ? Math.max(0, now.ticketsBeforePerWeek - now.ticketsAfterPerWeek) : null;
      return Object.assign({}, now, {
        newThisMonth: u.publishedAt >= range.start.getTime(),
        answersThisMonth: thisMonth,
        fewerPerMonth: fewerPerWeek == null ? null : perMonth(fewerPerWeek)
      });
    }).sort(function (a, c) { return c.answersSince - a.answersSince; });

    const roi = {
      count: impacts.length,
      answersSince: impacts.reduce(function (s, i) { return s + i.answersSince; }, 0),
      answersThisMonth: impacts.reduce(function (s, i) { return s + i.answersThisMonth; }, 0),
      fewerPerMonth: impacts.reduce(function (s, i) { return s + (i.fewerPerMonth || 0); }, 0),
      hoursSince: impacts.reduce(function (s, i) { return s + i.hoursSaved; }, 0),
      hoursThisMonth: (impacts.reduce(function (s, i) { return s + i.answersThisMonth; }, 0) * minutes) / 60,
      newThisMonth: impacts.filter(function (i) { return i.newThisMonth; }).length,
      updates: impacts
    };

    // Next changes to the manual, ranked by tickets they would remove.
    const suc = A.typicalFixSuccess(impacts);
    const fixesAll = A.fixList(cur, prev).filter(function (t) { return t.kind === 'add' || t.kind === 'clarify'; });
    const toFix = function (t) {
      const more = Math.max(1, Math.round(t.tickets * suc.factor));
      return {
        theme: t.theme,
        kind: t.kind,
        tickets: t.tickets,
        more: more,
        hours: (more * minutes) / 60,
        example: t.examples[0] || '',
        note: t.note,
        section: t.section,
        rising: t.rising
      };
    };
    const fixes = fixesAll.slice(0, 3).map(toFix);
    const fixesTracker = fixesAll.slice(0, 12).map(toFix);
    const proj = A.projectRate(b, fixesAll.slice(0, 3), suc.factor);

    // Why questions went to a person.
    const reasons = REASON_INFO.map(function (r) {
      const n = b.counts[r.key] || 0;
      return Object.assign({}, r, { count: n, pctOfTickets: b.tickets ? (n / b.tickets) * 100 : 0, pctOfAll: b.total ? (n / b.total) * 100 : 0 });
    });

    // Sections to review: clear-up needed, or never used.
    const sectionRows = A.sectionStats(cur, prev, metaSections);
    const review = sectionRows.filter(function (s) { return s.flag === 'clarify' || s.flag === 'unused'; }).slice(0, 4)
      .map(function (s) { return { title: s.title, flag: s.flag, cited: s.cited, unclearRate: s.unclearRate }; });

    const goal = Number(cfg.goal);
    const need = Math.max(0, Math.ceil((goal / 100) * b.total) - b.answered);
    const delta = pb && b.rate != null && pb.rate != null ? b.rate - pb.rate : null;
    const hoursSavedByBot = (b.answered * minutes) / 60;

    // Categories that need work: where the manual had nothing or did not settle the question,
    // with the questions people asked most in each.
    const catRows = A.categoryStats(cur, D.OPS_CATEGORIES);
    const catIds = new Set(catRows.map(function (c) { return c.id; }));
    const catOf = function (id) { return catIds.has(id) ? id : D.UNCATEGORIZED_ID; };
    const themeRows = A.themeStats(cur, prev).filter(function (t) { return !t.resolved && t.tickets > 0 && (t.kind === 'add' || t.kind === 'clarify'); });
    const openIn = function (id) { return themeRows.filter(function (t) { return catOf(t.categoryId) === id; }); };
    const categories = catRows.map(function (c) { return { row: c, open: openIn(c.id) }; })
      .filter(function (c) { return c.open.reduce(function (a, t) { return a + t.tickets; }, 0) >= 3; })
      .map(function (x) {
        const c = x.row;
        const fixable = x.open.reduce(function (a, t) { return a + t.tickets; }, 0);
        return {
          id: c.id,
          name: c.name,
          total: c.total,
          answered: c.answered,
          rate: c.answerRate,
          fixable: fixable,
          shareOfFixable: b.fixable ? (fixable / b.fixable) * 100 : 0,
          themes: x.open.slice()
            .sort(function (a, z) { return z.tickets - a.tickets || (a.theme < z.theme ? -1 : 1); })
            .slice(0, 5)
            .map(function (t) { return { theme: t.theme, kind: t.kind, tickets: t.tickets, asked: t.asked, examples: t.examples.slice(0, 2), note: t.note, section: t.section }; })
        };
      })
      .sort(function (a, z) { return z.fixable - a.fixable; })
      .slice(0, 6);

    return {
      cfg: cfg,
      range: range,
      prevRange: prevRange,
      b: b,
      pb: prevOk ? pb : null,
      delta: delta,
      goal: goal,
      vsGoal: b.rate == null ? null : b.rate - goal,
      needForGoal: need,
      series: series,
      reasons: reasons,
      fixableTickets: b.fixable,
      fixablePct: b.tickets ? (b.fixable / b.tickets) * 100 : 0,
      fixes: fixes,
      fixesTracker: fixesTracker,
      categories: categories,
      moreFromFixes: proj.more,
      projectedRate: proj.rate,
      fixFactor: suc,
      roi: roi,
      review: review,
      hoursSavedByBot: hoursSavedByBot,
      warnings: warnings
    };
  }

  return {
    DEFAULTS: DEFAULTS,
    REASON_INFO: REASON_INFO,
    monthRange: monthRange,
    shiftYm: shiftYm,
    availableMonths: availableMonths,
    defaultMonth: defaultMonth,
    build: build,
    round1: round1
  };
});
