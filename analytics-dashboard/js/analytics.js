/*
 * Analytics: pure functions over stored question records.
 * No DOM access, so every calculation can be tested in Node.
 *
 * Definitions used throughout:
 *  - Total = every record in the period (including Unknown).
 *  - Answered / Ticketed / Unresolved % = count / known-status records x 100.
 *    Unknown records are counted separately and never treated as unresolved.
 *  - Category volume % = category records / all records x 100.
 *  - Category answer rate = answered / known records in that category x 100.
 */
(function (root, factory) {
  let data;
  if (typeof module === 'object' && module.exports) {
    data = require('./data.js');
    module.exports = factory(data);
  } else {
    root.QAD = root.QAD || {};
    root.QAD.analytics = factory(root.QAD.data);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (D) {
  'use strict';

  const STATUS = D.STATUS;
  const UNCATEGORIZED_ID = D.UNCATEGORIZED_ID;
  const UNANSWERED = [STATUS.TICKET, STATUS.UNRESOLVED];
  const DAY = 24 * 60 * 60 * 1000;
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'what', 'how', 'can', 'you', 'your', 'are', 'from',
    'have', 'has', 'does', 'not', 'but', 'all', 'any', 'our', 'its', 'there', 'their', 'when', 'where',
    'which', 'who', 'will', 'would', 'should', 'could', 'about', 'into', 'just', 'help', 'please',
    'thanks', 'sorry', 'question', 'need', 'want', 'get', 'make', 'the', 'some', 'way', 'they', 'them'
  ]);

  // ---------- dates ----------

  function localDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function addMonths(d, n) {
    const x = new Date(d);
    x.setDate(1);
    x.setMonth(x.getMonth() + n);
    return x;
  }
  function dayKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Parses a YYYY-MM-DD string as a local date (new Date() would read it as UTC).
  function parseLocalDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  /**
   * Reporting period. start is inclusive, end is exclusive; null means open-ended.
   * custom = { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } (both inclusive days).
   */
  function rangeFromPreset(preset, now, custom) {
    const today = localDay(now || new Date());
    const days = { '7d': 7, '30d': 30, '90d': 90 };
    if (days[preset]) {
      return { preset: preset, start: addDays(today, -(days[preset] - 1)), end: addDays(today, 1), label: 'Past ' + days[preset] + ' days' };
    }
    if (preset === '12m') {
      return { preset: preset, start: addMonths(today, -12), end: addDays(today, 1), label: 'Past 12 months' };
    }
    if (preset === 'custom') {
      const from = parseLocalDate(custom && custom.from);
      const to = parseLocalDate(custom && custom.to);
      const label = (from || to)
        ? ((custom.from || 'start') + ' to ' + (custom.to || 'today'))
        : 'Custom range (no dates set)';
      return { preset: preset, start: from, end: to ? addDays(to, 1) : null, label: label };
    }
    return { preset: 'all', start: null, end: null, label: 'All time' };
  }

  function inRange(q, range) {
    if (!range) return true;
    const t = Date.parse(q.submitted_at);
    if (range.start && t < range.start.getTime()) return false;
    if (range.end && t >= range.end.getTime()) return false;
    return true;
  }

  function filterRange(questions, range) {
    return questions.filter(function (q) { return inRange(q, range); });
  }

  // ---------- headline numbers ----------

  function summarize(qs) {
    const counts = {};
    counts[STATUS.ANSWER] = 0;
    counts[STATUS.TICKET] = 0;
    counts[STATUS.UNRESOLVED] = 0;
    counts[STATUS.UNKNOWN] = 0;
    let ticketsResolved = 0;
    let ticketsOpen = 0;
    qs.forEach(function (q) {
      const key = Object.prototype.hasOwnProperty.call(counts, q.resolution_status) ? q.resolution_status : STATUS.UNKNOWN;
      counts[key]++;
      if (q.resolution_status === STATUS.TICKET) {
        if (D.CLOSED_TICKET_STATUSES.indexOf(q.ticket_status) !== -1) ticketsResolved++;
        else ticketsOpen++;
      }
    });
    const known = counts[STATUS.ANSWER] + counts[STATUS.TICKET] + counts[STATUS.UNRESOLVED];
    const pct = function (n) { return known ? (n / known) * 100 : null; };
    return {
      total: qs.length,
      known: known,
      counts: counts,
      pct: {
        answered: pct(counts[STATUS.ANSWER]),
        ticketed: pct(counts[STATUS.TICKET]),
        unresolved: pct(counts[STATUS.UNRESOLVED])
      },
      ticketsResolved: ticketsResolved,
      ticketsOpen: ticketsOpen
    };
  }

  // ---------- trends ----------

  // Start of the day / Monday of the week / first of the month, in local time.
  function bucketStart(d, g) {
    const x = localDay(d);
    if (g === 'day') return x;
    if (g === 'week') return addDays(x, -((x.getDay() + 6) % 7));
    return new Date(x.getFullYear(), x.getMonth(), 1);
  }
  function stepBucket(d, g) {
    if (g === 'day') return addDays(d, 1);
    if (g === 'week') return addDays(d, 7);
    return addMonths(d, 1);
  }
  function bucketLabel(d, g) {
    if (g === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    return (g === 'week' ? 'Week of ' : '') + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /**
   * Counts per time bucket (day, week or month). Empty buckets between the first
   * and last question are included with zeros so the chart has no gaps.
   */
  function trend(qs, granularity) {
    const g = granularity || 'week';
    if (!qs.length) return [];
    let min = Infinity;
    let max = -Infinity;
    qs.forEach(function (q) {
      const t = Date.parse(q.submitted_at);
      if (t < min) min = t;
      if (t > max) max = t;
    });
    const rows = [];
    const index = new Map();
    const last = bucketStart(new Date(max), g).getTime();
    let cur = bucketStart(new Date(min), g);
    while (cur.getTime() <= last) {
      const row = { key: dayKey(cur), label: bucketLabel(cur, g), start: cur, total: 0, answered: 0, ticketed: 0, unresolved: 0, unknown: 0 };
      index.set(row.key, row);
      rows.push(row);
      cur = stepBucket(cur, g);
    }
    qs.forEach(function (q) {
      const row = index.get(dayKey(bucketStart(new Date(q.submitted_at), g)));
      if (!row) return;
      row.total++;
      row[statusField(q.resolution_status)]++;
    });
    return rows;
  }

  function statusField(status) {
    if (status === STATUS.ANSWER) return 'answered';
    if (status === STATUS.TICKET) return 'ticketed';
    if (status === STATUS.UNRESOLVED) return 'unresolved';
    return 'unknown';
  }

  // ---------- categories ----------

  /** One row per top-level category, including categories with no questions. */
  function categoryStats(qs, categories) {
    const rows = new Map();
    categories.filter(function (c) { return !c.parentId; }).forEach(function (c) {
      rows.set(c.id, { id: c.id, name: c.name, total: 0, answered: 0, ticketed: 0, unresolved: 0, unknown: 0 });
    });
    if (!rows.has(UNCATEGORIZED_ID)) {
      rows.set(UNCATEGORIZED_ID, { id: UNCATEGORIZED_ID, name: 'Other / Uncategorized', total: 0, answered: 0, ticketed: 0, unresolved: 0, unknown: 0 });
    }
    qs.forEach(function (q) {
      const row = rows.get(q.category_id) || rows.get(UNCATEGORIZED_ID);
      row.total++;
      row[statusField(q.resolution_status)]++;
    });
    return Array.from(rows.values()).map(function (r) {
      const known = r.answered + r.ticketed + r.unresolved;
      const rate = function (n) { return known ? (n / known) * 100 : null; };
      return Object.assign({}, r, {
        known: known,
        unanswered: r.ticketed + r.unresolved,
        volumePct: qs.length ? (r.total / qs.length) * 100 : 0,
        answerRate: rate(r.answered),
        ticketRate: rate(r.ticketed),
        unresolvedRate: rate(r.unresolved)
      });
    });
  }

  // ---------- knowledge gaps ----------

  /** Questions with the same normalized text that were not answered by the chatbot. */
  function groupRepeats(list) {
    const groups = new Map();
    list.forEach(function (q) {
      const key = q.normalized_text;
      if (!key) return;
      let g = groups.get(key);
      if (!g) {
        g = { normalized: key, sampleText: q.question_text, count: 0, ticketed: 0, unresolved: 0, lastSeen: q.submitted_at, catCounts: new Map() };
        groups.set(key, g);
      }
      g.count++;
      if (q.resolution_status === STATUS.TICKET) g.ticketed++; else g.unresolved++;
      if (q.submitted_at > g.lastSeen) g.lastSeen = q.submitted_at;
      g.catCounts.set(q.category_id, (g.catCounts.get(q.category_id) || 0) + 1);
    });
    return Array.from(groups.values())
      .filter(function (g) { return g.count >= 2; })
      .map(function (g) {
        let best = null;
        let bestN = -1;
        g.catCounts.forEach(function (n, cid) { if (n > bestN) { best = cid; bestN = n; } });
        return { normalized: g.normalized, sampleText: g.sampleText, count: g.count, ticketed: g.ticketed, unresolved: g.unresolved, lastSeen: g.lastSeen, categoryId: best };
      })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.lastSeen < b.lastSeen ? 1 : (a.lastSeen > b.lastSeen ? -1 : 0);
      });
  }

  function gaps(qs, categories, opts) {
    const minSample = (opts && opts.minSample) || 5;
    const s = summarize(qs);
    const unanswered = qs.filter(function (q) { return UNANSWERED.indexOf(q.resolution_status) !== -1; });
    const cats = categoryStats(qs, categories);
    const eligible = cats.filter(function (c) { return c.known >= minSample; });
    const byRate = function (key) {
      return eligible.filter(function (c) { return c[key] != null; })
        .sort(function (a, b) { return b[key] - a[key]; })
        .slice(0, 3);
    };
    const repeats = groupRepeats(unanswered);
    return {
      unansweredCount: unanswered.length,
      unansweredPct: s.known ? (unanswered.length / s.known) * 100 : null,
      ticketed: s.counts[STATUS.TICKET],
      unresolved: s.counts[STATUS.UNRESOLVED],
      byCategory: cats.slice().sort(function (a, b) { return b.unanswered - a.unanswered || b.total - a.total; }),
      highestTicketRate: byRate('ticketRate'),
      highestUnresolvedRate: byRate('unresolvedRate'),
      repeats: repeats,
      minSample: minSample
    };
  }

  /** Frequent words in a set of questions, used to suggest new category names. */
  function suggestTerms(qs, n) {
    const counts = new Map();
    qs.forEach(function (q) {
      new Set(String(q.normalized_text || '').split(' ')).forEach(function (w) {
        if (w.length < 4 || STOP_WORDS.has(w) || /^\d+$/.test(w)) return;
        counts.set(w, (counts.get(w) || 0) + 1);
      });
    });
    return Array.from(counts, function (entry) { return { term: entry[0], count: entry[1] }; })
      .sort(function (a, b) { return b.count - a.count || (a.term < b.term ? -1 : 1); })
      .slice(0, n || 12);
  }

  return {
    localDay: localDay,
    parseLocalDate: parseLocalDate,
    rangeFromPreset: rangeFromPreset,
    inRange: inRange,
    filterRange: filterRange,
    summarize: summarize,
    trend: trend,
    categoryStats: categoryStats,
    groupRepeats: groupRepeats,
    gaps: gaps,
    suggestTerms: suggestTerms,
    DAY: DAY
  };
});
