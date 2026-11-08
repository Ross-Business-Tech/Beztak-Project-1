/*
 * Analytics: pure functions over stored question records.
 * No DOM access, so every calculation can be tested in Node.
 *
 * Definitions used throughout:
 *  - Every question has one current status: Answered, Ticket Open or Ticket Closed.
 *  - Total = every record in the period.
 *  - Answered / Ticket Open / Ticket Closed % = count / total x 100.
 *  - Ticketed = Ticket Open + Ticket Closed (questions the chatbot could not answer).
 *  - Category volume % = category records / total x 100.
 *  - Category answer rate = answered / total in that category x 100.
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
  const UNCAT = D.UNCATEGORIZED_ID;
  const DAY = 24 * 60 * 60 * 1000;
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'what', 'how', 'can', 'you', 'your', 'are', 'from',
    'have', 'has', 'does', 'not', 'but', 'all', 'any', 'our', 'its', 'there', 'their', 'when', 'where',
    'which', 'who', 'will', 'would', 'should', 'could', 'about', 'into', 'just', 'help', 'please',
    'thanks', 'sorry', 'question', 'need', 'want', 'get', 'make', 'some', 'way', 'they', 'them'
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

  function isTicket(status) {
    return status === STATUS.OPEN || status === STATUS.CLOSED;
  }

  function statusField(status) {
    if (status === STATUS.ANSWERED) return 'answered';
    if (status === STATUS.OPEN) return 'open';
    return 'closed';
  }

  // ---------- headline numbers ----------

  function summarize(qs) {
    const counts = {};
    counts[STATUS.ANSWERED] = 0;
    counts[STATUS.OPEN] = 0;
    counts[STATUS.CLOSED] = 0;
    qs.forEach(function (q) {
      if (Object.prototype.hasOwnProperty.call(counts, q.resolution_status)) counts[q.resolution_status]++;
    });
    const total = qs.length;
    const ticketed = counts[STATUS.OPEN] + counts[STATUS.CLOSED];
    const pct = function (n) { return total ? (n / total) * 100 : null; };
    return {
      total: total,
      counts: counts,
      ticketed: ticketed,
      pct: {
        answered: pct(counts[STATUS.ANSWERED]),
        open: pct(counts[STATUS.OPEN]),
        closed: pct(counts[STATUS.CLOSED]),
        ticketed: pct(ticketed)
      }
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
      const row = { key: dayKey(cur), label: bucketLabel(cur, g), start: cur, total: 0, answered: 0, open: 0, closed: 0 };
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

  // ---------- categories ----------

  /** One row per top-level category, including categories with no questions. */
  function categoryStats(qs, categories) {
    const rows = new Map();
    categories.filter(function (c) { return !c.parentId; }).forEach(function (c) {
      rows.set(c.id, { id: c.id, name: c.name, total: 0, answered: 0, open: 0, closed: 0 });
    });
    if (!rows.has(UNCAT)) {
      rows.set(UNCAT, { id: UNCAT, name: 'Other / Uncategorized', total: 0, answered: 0, open: 0, closed: 0 });
    }
    qs.forEach(function (q) {
      const row = rows.get(q.category_id) || rows.get(UNCAT);
      row.total++;
      row[statusField(q.resolution_status)]++;
    });
    return Array.from(rows.values()).map(function (r) {
      const ticketed = r.open + r.closed;
      const rate = function (n) { return r.total ? (n / r.total) * 100 : null; };
      return Object.assign({}, r, {
        ticketed: ticketed,
        volumePct: qs.length ? (r.total / qs.length) * 100 : 0,
        answerRate: rate(r.answered),
        ticketRate: rate(ticketed)
      });
    });
  }

  // ---------- knowledge gaps ----------

  /** Ticketed questions with the same normalized text (the same question asked more than once). */
  function groupRepeats(list) {
    const groups = new Map();
    list.forEach(function (q) {
      const key = q.normalized_text;
      if (!key) return;
      let g = groups.get(key);
      if (!g) {
        g = { normalized: key, sampleText: q.question_text, count: 0, open: 0, closed: 0, lastSeen: q.submitted_at, catCounts: new Map() };
        groups.set(key, g);
      }
      g.count++;
      if (q.resolution_status === STATUS.OPEN) g.open++; else g.closed++;
      if (q.submitted_at > g.lastSeen) g.lastSeen = q.submitted_at;
      g.catCounts.set(q.category_id, (g.catCounts.get(q.category_id) || 0) + 1);
    });
    return Array.from(groups.values())
      .filter(function (g) { return g.count >= 2; })
      .map(function (g) {
        let best = null;
        let bestN = -1;
        g.catCounts.forEach(function (n, cid) { if (n > bestN) { best = cid; bestN = n; } });
        return { normalized: g.normalized, sampleText: g.sampleText, count: g.count, open: g.open, closed: g.closed, lastSeen: g.lastSeen, categoryId: best };
      })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.lastSeen < b.lastSeen ? 1 : (a.lastSeen > b.lastSeen ? -1 : 0);
      });
  }

  function gaps(qs, categories, opts) {
    const minSample = (opts && opts.minSample) || 5;
    const s = summarize(qs);
    const ticketed = qs.filter(function (q) { return isTicket(q.resolution_status); });
    const cats = categoryStats(qs, categories);
    const eligible = cats.filter(function (c) { return c.total >= minSample; });
    return {
      ticketedCount: ticketed.length,
      ticketedPct: s.pct.ticketed,
      open: s.counts[STATUS.OPEN],
      closed: s.counts[STATUS.CLOSED],
      byCategory: cats.slice().sort(function (a, b) { return b.ticketed - a.ticketed || b.total - a.total; }),
      highestTicketRate: eligible.filter(function (c) { return c.ticketRate != null; })
        .sort(function (a, b) { return b.ticketRate - a.ticketRate; })
        .slice(0, 3),
      repeats: groupRepeats(ticketed),
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

  /**
   * Manual suggestions, built from closed tickets (questions a person resolved).
   *  - standardize: topics where agents flagged a question, or wrote different resolution notes.
   *  - addToManual: topics with several closed tickets where the chatbot rarely answers.
   *  - improveAnswers: answers that were followed by a ticket in the same conversation.
   * Topic = subcategory if set, otherwise category.
   */
  function manualSuggestions(qs, categories, opts) {
    const minTickets = (opts && opts.minTickets) || 3;
    const minFollowUps = (opts && opts.minFollowUps) || 2;
    const names = new Map(categories.map(function (c) { return [c.id, c.name]; }));
    const topics = new Map();

    qs.forEach(function (q) {
      const key = q.subcategory_id || q.category_id;
      let t = topics.get(key);
      if (!t) {
        t = { topicId: key, total: 0, answered: 0, closed: 0, open: 0, flagged: 0, flagCounts: new Map(), notes: new Set(), byQuestion: new Map(), examples: [], lastSeen: '' };
        topics.set(key, t);
      }
      t.total++;
      if (q.resolution_status === STATUS.ANSWERED) t.answered++;
      else if (q.resolution_status === STATUS.OPEN) t.open++;
      else {
        t.closed++;
        if (q.resolution_note) {
          t.notes.add(q.resolution_note);
          // Same question, different notes = inconsistent answers.
          if (!t.byQuestion.has(q.normalized_text)) t.byQuestion.set(q.normalized_text, new Set());
          t.byQuestion.get(q.normalized_text).add(q.resolution_note);
        }
        if (t.examples.length < 3 && t.examples.indexOf(q.question_text) === -1) t.examples.push(q.question_text);
      }
      if (q.flag) {
        t.flagged++;
        t.flagCounts.set(q.flag, (t.flagCounts.get(q.flag) || 0) + 1);
      }
      if (q.submitted_at > t.lastSeen) t.lastSeen = q.submitted_at;
    });

    const addToManual = [];
    const standardize = [];
    topics.forEach(function (t) {
      if (t.closed === 0 && t.flagged === 0) return;
      const answerShare = t.total ? t.answered / t.total : 0;
      let topFlag = '';
      let topN = 0;
      t.flagCounts.forEach(function (n, f) { if (n > topN) { topN = n; topFlag = f; } });
      // Questions whose closed tickets were resolved in more than one way.
      let conflicts = 0;
      t.byQuestion.forEach(function (set) { if (set.size >= 2) conflicts++; });
      const row = {
        key: t.topicId,
        topic: names.get(t.topicId) || t.topicId,
        closed: t.closed,
        open: t.open,
        total: t.total,
        answerShare: answerShare,
        examples: t.examples,
        notes: Array.from(t.notes).slice(0, 3),
        conflicts: conflicts,
        flagged: t.flagged,
        flag: topFlag,
        lastSeen: t.lastSeen
      };
      if (t.flagged > 0 || conflicts > 0) {
        standardize.push(Object.assign({}, row, {
          reason: t.flagged > 0
            ? 'Agents flagged ' + t.flagged + ' question' + (t.flagged === 1 ? '' : 's') + (topFlag ? ' as "' + topFlag + '"' : '')
            : conflicts + ' repeated question' + (conflicts === 1 ? ' was' : 's were') + ' resolved with different notes'
        }));
      }
      if (t.closed >= minTickets && answerShare < 0.3) {
        addToManual.push(Object.assign({}, row, {
          reason: 'Chatbot answered only ' + Math.round(answerShare * 100) + '% of questions here'
        }));
      }
    });

    // Conversations where an answer was given and a ticket followed later.
    const byConv = new Map();
    qs.forEach(function (q) {
      if (!q.conversation_id) return;
      if (!byConv.has(q.conversation_id)) byConv.set(q.conversation_id, []);
      byConv.get(q.conversation_id).push(q);
    });
    const followUps = new Map();
    byConv.forEach(function (list) {
      list.sort(function (a, b) { return a.submitted_at < b.submitted_at ? -1 : 1; });
      list.forEach(function (q, i) {
        if (q.resolution_status !== STATUS.ANSWERED) return;
        const later = list.slice(i + 1).some(function (x) { return isTicket(x.resolution_status); });
        if (!later) return;
        const key = q.answer_source || '(no source recorded)';
        const f = followUps.get(key) || { source: key, count: 0, example: q.question_text, topicId: q.subcategory_id || q.category_id };
        f.count++;
        followUps.set(key, f);
      });
    });
    const improveAnswers = Array.from(followUps.values())
      .filter(function (f) { return f.count >= minFollowUps; })
      .map(function (f) { return Object.assign({}, f, { topic: names.get(f.topicId) || f.topicId }); })
      .sort(function (a, b) { return b.count - a.count; });

    const byClosed = function (a, b) { return b.closed - a.closed || b.flagged - a.flagged; };
    standardize.sort(byClosed);
    addToManual.sort(byClosed);
    return { standardize: standardize, addToManual: addToManual, improveAnswers: improveAnswers, minTickets: minTickets };
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
    manualSuggestions: manualSuggestions,
    DAY: DAY
  };
});
