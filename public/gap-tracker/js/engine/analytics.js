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
    const days = { '7d': 7, '28d': 28, '30d': 30, '56d': 56, '90d': 90 };
    if (days[preset]) {
      const label = preset === '28d' ? 'Last 4 weeks' : preset === '56d' ? 'Last 8 weeks' : 'Past ' + days[preset] + ' days';
      return { preset: preset, start: addDays(today, -(days[preset] - 1)), end: addDays(today, 1), label: label };
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
  function groupRepeats(list, minCount) {
    const min = minCount == null ? 2 : minCount;
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
      .filter(function (g) { return g.count >= min; })
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

  // ---------- answer-rate view (what the head of operations steers by) ----------
  //
  // Every question is either answered from the manual or sent to a person (a ticket).
  // A ticket has one reason:
  //   no-match / unclear   fixable by changing the manual
  //   policy / out-of-scope go to a person by design, so they are not held against the bot
  //  - Answer rate = answered / all questions.
  //  - Fixable rate = answered / (all questions - by-design tickets): how well the bot does
  //    on the questions the manual is supposed to cover.
  //  - "Up to +x points" for a fix = that topic's tickets / all questions, assuming the update
  //    lets the bot answer every repeat of it.

  const ESC = D.ESCALATION;
  const ts = function (q) { return Date.parse(q.submitted_at); };

  function classOf(q) {
    return q.resolution_status === STATUS.ANSWERED ? 'answered' : (q.escalation_reason || ESC.NO_MATCH);
  }

  function breakdown(qs) {
    const counts = { answered: 0, 'no-match': 0, unclear: 0, policy: 0, 'out-of-scope': 0 };
    qs.forEach(function (q) { const k = classOf(q); counts[k] = (counts[k] || 0) + 1; });
    const total = qs.length;
    const byDesign = counts.policy + counts['out-of-scope'];
    const fixable = counts['no-match'] + counts.unclear;
    const eligible = total - byDesign;
    return {
      counts: counts,
      total: total,
      answered: counts.answered,
      tickets: total - counts.answered,
      fixable: fixable,
      byDesign: byDesign,
      rate: total ? (counts.answered / total) * 100 : null,
      fixableRate: eligible ? (counts.answered / eligible) * 100 : null
    };
  }

  /** The period of equal length right before this one, or null for open-ended periods. */
  function previousRange(range) {
    if (!range || !range.start || !range.end) return null;
    const len = range.end.getTime() - range.start.getTime();
    return { start: new Date(range.start.getTime() - len), end: new Date(range.start.getTime()), label: 'the period before' };
  }

  /** True when the data reaches back far enough to compare against the previous period fairly. */
  function hasHistoryFor(qs, prev) {
    if (!prev || !qs.length) return false;
    let min = Infinity;
    qs.forEach(function (q) { const t = ts(q); if (t < min) min = t; });
    return min <= prev.start.getTime() + 7 * DAY;
  }

  /** Answer rate for each 7-day bucket ending on the day after the latest question. */
  function weekly(qs, maxWeeks) {
    if (!qs.length) return [];
    let min = Infinity;
    let max = -Infinity;
    qs.forEach(function (q) { const t = ts(q); if (t < min) min = t; if (t > max) max = t; });
    const endDay = addDays(localDay(new Date(max)), 1);
    const W = Math.min(maxWeeks || 18, Math.max(1, Math.ceil((endDay.getTime() - min) / (7 * DAY))));
    const first = addDays(endDay, -7 * W);
    const rows = [];
    for (let i = 0; i < W; i++) rows.push({ start: addDays(first, 7 * i), end: addDays(first, 7 * i + 7), total: 0, answered: 0, tickets: 0 });
    qs.forEach(function (q) {
      const i = Math.floor((ts(q) - first.getTime()) / (7 * DAY));
      if (i < 0 || i >= W) return;
      rows[i].total++;
      if (q.resolution_status === STATUS.ANSWERED) rows[i].answered++; else rows[i].tickets++;
    });
    rows.forEach(function (r) { r.rate = r.total ? (r.answered / r.total) * 100 : null; });
    return rows;
  }

  const GREETING = /^(hi|hello|hey)[,!.\s]+|^quick question[:,]?\s*|^can you help[?:,]?\s*|^sorry to bother you[,]?\s*/i;
  function tidyQuestion(text) {
    const s = String(text || '').replace(GREETING, '').replace(GREETING, '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(text || '');
  }

  /**
   * One row per topic the bot grouped questions under (the "theme"), for a set of questions.
   * kind: add (manual has nothing) | clarify (section cited, did not help) | scope | policy.
   * resolved: true when the topic used to have no manual coverage but is now being answered.
   */
  function themeStats(cur, prev) {
    const total = cur.length;
    const groups = new Map();
    cur.forEach(function (q) {
      const key = q.theme || q.normalized_text;
      let g = groups.get(key);
      if (!g) {
        g = { theme: key, categoryId: q.category_id, asked: 0, answered: 0, reasons: {}, phrases: new Map(), note: '', noteAt: 0,
          sections: new Map(), lastNoMatch: 0, answeredTimes: [] };
        groups.set(key, g);
      }
      g.asked++;
      const t = ts(q);
      if (q.resolution_status === STATUS.ANSWERED) { g.answered++; g.answeredTimes.push(t); }
      else {
        const r = q.escalation_reason || ESC.NO_MATCH;
        g.reasons[r] = (g.reasons[r] || 0) + 1;
        if (r === ESC.NO_MATCH && t > g.lastNoMatch) g.lastNoMatch = t;
        if (q.resolution_note && t >= g.noteAt) { g.note = q.resolution_note; g.noteAt = t; }
      }
      const p = tidyQuestion(q.question_text);
      g.phrases.set(p, (g.phrases.get(p) || 0) + 1);
      if (q.manual_section) g.sections.set(q.manual_section, (g.sections.get(q.manual_section) || 0) + 1);
    });
    const prevTickets = new Map();
    (prev || []).forEach(function (q) {
      if (q.resolution_status === STATUS.ANSWERED) return;
      const key = q.theme || q.normalized_text;
      prevTickets.set(key, (prevTickets.get(key) || 0) + 1);
    });
    const top = function (map) {
      let best = '';
      let n = -1;
      map.forEach(function (v, k) { if (v > n) { n = v; best = k; } });
      return best;
    };
    const kinds = {};
    kinds[ESC.NO_MATCH] = 'add'; kinds[ESC.UNCLEAR] = 'clarify'; kinds[ESC.POLICY] = 'policy'; kinds[ESC.SCOPE] = 'scope';
    return Array.from(groups.values()).map(function (g) {
      const tickets = g.asked - g.answered;
      let topReason = '';
      let n = -1;
      Object.keys(g.reasons).forEach(function (r) { if (g.reasons[r] > n) { n = g.reasons[r]; topReason = r; } });
      const answeredAfter = g.answeredTimes.filter(function (t) { return t > g.lastNoMatch; }).length;
      const resolved = (g.reasons[ESC.NO_MATCH] || 0) > 0 && answeredAfter >= 1;
      const pt = prevTickets.get(g.theme) || 0;
      return {
        theme: g.theme,
        categoryId: g.categoryId,
        asked: g.asked,
        answered: g.answered,
        tickets: tickets,
        answeredShare: g.asked ? (g.answered / g.asked) * 100 : null,
        reasons: g.reasons,
        kind: tickets ? kinds[topReason] || 'add' : null,
        resolved: resolved,
        examples: Array.from(g.phrases).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3).map(function (e) { return e[0]; }),
        note: g.note,
        section: top(g.sections),
        prevTickets: pt,
        rising: tickets >= 5 && tickets >= pt * 1.5 + 2,
        pts: total ? (tickets / total) * 100 : 0
      };
    });
  }

  /**
   * Ranked changes to the manual. Only topics still failing, with at least minTickets tickets.
   * Topics that go to a person by policy are never listed here.
   */
  function fixList(cur, prev, opts) {
    const minTickets = (opts && opts.minTickets) || 3;
    return themeStats(cur, prev)
      .filter(function (t) { return !t.resolved && t.tickets >= minTickets && (t.kind === 'add' || t.kind === 'clarify' || t.kind === 'scope'); })
      .sort(function (a, b) { return b.tickets - a.tickets || (a.theme < b.theme ? -1 : 1); });
  }

  /** How each manual section is used in a period. meta = [{ title, category, publishedAt }] adds sections never cited. */
  function sectionStats(cur, prev, meta) {
    const map = new Map();
    const row = function (title) {
      let r = map.get(title);
      if (!r) { r = { title: title, cited: 0, answered: 0, unclear: 0, prevCited: 0, publishedAt: 0 }; map.set(title, r); }
      return r;
    };
    (meta || []).forEach(function (m) { const r = row(m.title); r.publishedAt = m.publishedAt ? Date.parse(m.publishedAt) : 0; });
    cur.forEach(function (q) {
      if (!q.manual_section) return;
      const r = row(q.manual_section);
      r.cited++;
      if (q.resolution_status === STATUS.ANSWERED) r.answered++; else r.unclear++;
      if (q.section_published_at && !r.publishedAt) r.publishedAt = Date.parse(q.section_published_at);
    });
    (prev || []).forEach(function (q) { if (q.manual_section) row(q.manual_section).prevCited++; });
    return Array.from(map.values()).map(function (r) {
      const unclearRate = r.cited ? (r.unclear / r.cited) * 100 : null;
      let flag = '';
      if (r.cited === 0) flag = 'unused';
      else if (r.cited >= 5 && unclearRate >= 25) flag = 'clarify';
      return Object.assign({}, r, { unclearRate: unclearRate, flag: flag });
    }).sort(function (a, b) {
      const w = function (x) { return x.flag === 'clarify' ? 0 : x.flag === 'unused' ? 1 : 2; };
      return w(a) - w(b) || b.cited - a.cited;
    });
  }

  /** Manual sections added during the data, with the date each was published. */
  function publishedUpdates(all, meta) {
    const map = new Map();
    (meta || []).forEach(function (m) { if (m.publishedAt) map.set(m.title, { title: m.title, publishedAt: Date.parse(m.publishedAt) }); });
    all.forEach(function (q) {
      if (!q.manual_section || !q.section_published_at) return;
      const t = Date.parse(q.section_published_at);
      const cur = map.get(q.manual_section);
      if (!cur || t < cur.publishedAt) map.set(q.manual_section, { title: q.manual_section, publishedAt: t });
    });
    return Array.from(map.values()).sort(function (a, b) { return b.publishedAt - a.publishedAt; });
  }

  /**
   * What a published manual change achieved. upd = { title, publishedAt (ms), themes? (Set) }.
   * The topics it covers are the ones that cite the section. Before = the 4 weeks before publishing.
   * Hours saved = questions it answered since x minutes a person would have spent on each ticket.
   */
  function updateImpact(all, upd, endMs, minutesPerTicket) {
    const pub = upd.publishedAt;
    const themes = upd.themes || new Set(all.filter(function (q) { return q.manual_section === upd.title; }).map(function (q) { return q.theme; }));
    const rows = all.filter(function (q) { return themes.has(q.theme); });
    const before = rows.filter(function (q) { const t = ts(q); return t < pub && t >= pub - 28 * DAY; });
    const after = rows.filter(function (q) { return ts(q) >= pub; });
    const answered = function (q) { return q.resolution_status === STATUS.ANSWERED; };
    const answersSince = after.filter(answered).length;
    const weeksAfter = Math.max((endMs - pub) / (7 * DAY), 1 / 7);
    const rate = function (list) { return list.length ? (list.filter(answered).length / list.length) * 100 : null; };
    const weeks = Math.min(12, Math.max(1, Math.ceil((endMs - pub) / (7 * DAY))));
    const weeklyUse = [];
    for (let i = 0; i < weeks; i++) {
      const a = pub + i * 7 * DAY;
      weeklyUse.push(after.filter(function (q) { const t = ts(q); return answered(q) && t >= a && t < a + 7 * DAY; }).length);
    }
    return {
      title: upd.title,
      publishedAt: pub,
      daysSince: Math.max(0, Math.floor((endMs - pub) / DAY)),
      topics: Array.from(themes),
      answersSince: answersSince,
      ticketsBeforePerWeek: before.length ? before.filter(function (q) { return !answered(q); }).length / 4 : null,
      ticketsAfterPerWeek: after.length ? after.filter(function (q) { return !answered(q); }).length / weeksAfter : null,
      rateBefore: rate(before),
      rateAfter: rate(after),
      hoursSaved: (answersSince * (minutesPerTicket || 0)) / 60,
      weeklyUse: weeklyUse
    };
  }

  /**
   * How well a new manual section typically works, from your own past updates:
   * the average share of repeat questions the bot answered after publishing.
   * With too little history it falls back to a typical figure.
   */
  function typicalFixSuccess(impacts, fallback) {
    const base = fallback == null ? 0.8 : fallback;
    const good = (impacts || []).filter(function (i) { return i.rateAfter != null && i.answersSince >= 5; });
    if (!good.length) return { factor: base, fromHistory: false, n: 0 };
    const avg = good.reduce(function (a, i) { return a + i.rateAfter; }, 0) / good.length / 100;
    return { factor: Math.min(0.95, Math.max(0.5, avg)), fromHistory: true, n: good.length };
  }

  /**
   * If these fixes had been in the manual: how many more questions would have been answered,
   * and what the answer rate would have been. An estimate, not a promise.
   */
  function projectRate(b, fixes, factor) {
    const more = fixes.reduce(function (a, t) { return a + Math.max(1, Math.round(t.tickets * factor)); }, 0);
    return { more: more, rate: b.total ? ((b.answered + more) / b.total) * 100 : null };
  }

  return {
    typicalFixSuccess: typicalFixSuccess,
    projectRate: projectRate,
    classOf: classOf,
    breakdown: breakdown,
    previousRange: previousRange,
    hasHistoryFor: hasHistoryFor,
    weekly: weekly,
    tidyQuestion: tidyQuestion,
    themeStats: themeStats,
    fixList: fixList,
    sectionStats: sectionStats,
    publishedUpdates: publishedUpdates,
    updateImpact: updateImpact,
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
