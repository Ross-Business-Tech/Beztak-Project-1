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
    module.exports = factory(require('./engine/data.js'), require('./engine/analytics.js'), require('./improve.js'));
  } else {
    root.QAD = root.QAD || {};
    root.QAD.briefing = factory(root.QAD.data, root.QAD.analytics, root.QAD.improve);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (D, A, IM) {
  'use strict';

  const DAY = 24 * 60 * 60 * 1000;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DEFAULTS = Object.freeze({
    org: 'Operations',
    goal: 65,
    minutesPerTicket: 12,
    brand: '#1473E6',
    recipients: '',
    team: '',
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
   *
   * The answer rate is the fair one: answered / (all questions minus the ones that go to a person
   * on purpose, such as personal or approval questions and topics outside the manual).
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
    const eligible = b.total - b.byDesign;
    const rate = b.fixableRate; // the fair rate
    const warnings = [];
    if (cur.length < 20) warnings.push('Only ' + cur.length + ' questions in ' + range.label + '. The numbers may swing a lot.');
    if (!prevOk) warnings.push('There is little or no data for ' + prevRange.label + ', so there is no month-on-month comparison.');
    // The importer fills a missing theme with the question wording and a missing reason with "no match",
    // so these checks look for exactly that: nothing was ever grouped, and every ticket looks like a gap.
    if (cur.length >= 20 && !cur.some(function (q) { return q.theme && q.theme !== String(q.normalized_text || '').slice(0, 120); })) {
      warnings.push('The file has no "theme" column, so similar questions are grouped by their exact wording. Topics will look more scattered than they are.');
    }
    if (b.tickets >= 10 && b.counts['no-match'] === b.tickets) {
      warnings.push('Every question sent to a person is marked "manual has nothing on this". If the file has no "escalation_reason" column, add it, so personal or approval questions are not counted as gaps.');
    }

    // Last six months of answer rates, skipping months with no data or a partial first month.
    const monthsInfo = availableMonths(upTo);
    const series = [];
    for (let i = 5; i >= 0; i--) {
      const k = shiftYm(ym, -i);
      const info = monthsInfo.filter(function (m) { return m.ym === k; })[0];
      if (!info || !info.complete) continue;
      const mb = A.breakdown(inMonth(upTo, monthRange(k)));
      series.push({ ym: k, label: monthRange(k).short, total: mb.total, answered: mb.answered, eligible: mb.total - mb.byDesign, rate: mb.fixableRate, tickets: mb.tickets });
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

    // The ranking window: this month and the two before it, so one odd month does not reorder the list.
    const completeBefore = [0, 1, 2].map(function (i) { return shiftYm(ym, -i); }).filter(function (k) {
      const info = monthsInfo.filter(function (m) { return m.ym === k; })[0];
      return info && info.complete;
    });
    const winMonths = Math.max(1, completeBefore.length);
    const winStart = monthRange(shiftYm(ym, -2)).start.getTime();
    const prevWinStart = monthRange(shiftYm(ym, -5)).start.getTime();
    const inWin = function (q) { const t = Date.parse(q.submitted_at); return t >= winStart && t < endMs; };
    const inPrevWin = function (q) { const t = Date.parse(q.submitted_at); return t >= prevWinStart && t < winStart; };
    const win = upTo.filter(inWin);
    const prevWin = upTo.filter(inPrevWin);
    const windowInfo = { months: winMonths, label: winMonths === 1 ? range.label : monthRange(shiftYm(ym, -(winMonths - 1))).short + ' to ' + range.short + ' ' + range.start.getFullYear() };

    // Changes to the manual, ranked by tickets over the window.
    const suc = A.typicalFixSuccess(impacts);
    const changes = IM.build(win, prevWin, { months: winMonths, factor: suc.factor, minutes: minutes });
    const fixes = changes.slice(0, 3);
    const moreFromFixes = fixes.reduce(function (a, f) { return a + f.more; }, 0);
    const projectedRate = eligible ? ((b.answered + moreFromFixes) / eligible) * 100 : null;

    // Why questions went to a person.
    const reasons = REASON_INFO.map(function (r) {
      const n = b.counts[r.key] || 0;
      return Object.assign({}, r, { count: n, pctOfTickets: b.tickets ? (n / b.tickets) * 100 : 0, pctOfAll: b.total ? (n / b.total) * 100 : 0 });
    });

    // Sections to review: clear-up needed, or never used.
    const sectionRows = A.sectionStats(cur, prev, metaSections);
    const review = sectionRows.filter(function (s) { return s.flag === 'clarify' || s.flag === 'unused'; }).slice(0, 4)
      .map(function (s) { return { title: s.title, flag: s.flag, cited: s.cited, unclearRate: s.unclearRate }; });

    // The topics people ask about most over the window. "By design" = sent to a person on purpose.
    const designN = function (t) { return (t.reasons.policy || 0) + (t.reasons['out-of-scope'] || 0); };
    const topN = A.themeStats(win, prevWin).slice().sort(function (a, z) { return z.asked - a.asked || (a.theme < z.theme ? -1 : 1); }).slice(0, 6);
    const topQuestions = {
      months: winMonths,
      label: windowInfo.label,
      rows: topN.map(function (t) {
        const design = designN(t);
        const scope = t.asked - design;
        return { theme: t.theme, example: t.examples[0] || t.theme, asked: t.asked, answered: t.answered, byDesign: design, gaps: t.tickets - design, tickets: t.tickets,
          answeredShare: scope ? (t.answered / scope) * 100 : null, kind: t.kind };
      }),
      share: win.length ? (topN.reduce(function (a, t) { return a + t.asked; }, 0) / win.length) * 100 : 0
    };

    const goal = Number(cfg.goal);
    const need = Math.max(0, Math.ceil((goal / 100) * eligible) - b.answered);
    const prevRate = pb ? pb.fixableRate : null;
    const delta = pb && rate != null && prevRate != null ? rate - prevRate : null;

    return {
      cfg: cfg,
      range: range,
      prevRange: prevRange,
      b: b,
      pb: prevOk ? pb : null,
      rate: rate,
      strictRate: b.rate,
      eligible: eligible,
      byDesign: b.byDesign,
      byDesignPolicy: b.counts.policy || 0,
      byDesignScope: b.counts['out-of-scope'] || 0,
      prevRate: prevRate,
      delta: delta,
      goal: goal,
      vsGoal: rate == null ? null : rate - goal,
      needForGoal: need,
      series: series,
      reasons: reasons,
      fixableTickets: b.fixable,
      fixablePct: b.tickets ? (b.fixable / b.tickets) * 100 : 0,
      window: windowInfo,
      changes: changes,
      fixes: fixes,
      topQuestions: topQuestions,
      moreFromFixes: moreFromFixes,
      projectedRate: projectedRate,
      fixFactor: suc,
      roi: roi,
      review: review,
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
