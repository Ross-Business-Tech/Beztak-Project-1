/*
 * Data layer: record model, validation, file parsing, export formatting,
 * category suggestions, retention rules and made-up sample data.
 * Plain browser JavaScript with no dependencies. It also loads in Node for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.QAD = root.QAD || {}; root.QAD.data = api; }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // Every question has exactly one of these three current statuses.
  const STATUS = Object.freeze({
    ANSWERED: 'Answered',
    OPEN: 'Ticket Open',
    CLOSED: 'Ticket Closed'
  });
  const ALL_STATUSES = [STATUS.ANSWERED, STATUS.OPEN, STATUS.CLOSED];
  const TICKET_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
  const CLOSED_TICKET_STATUSES = ['Resolved', 'Closed'];
  const UNCATEGORIZED_ID = 'uncategorized';
  const SAMPLE_SOURCE = 'Sample generator';
  const MAX_QUESTION = 2000;
  const MAX_RESPONSE = 5000;
  const MAX_NOTE = 2000;
  const MAX_SHORT = 100;
  const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

  const DEFAULT_CATEGORIES = [
    { id: 'product', name: 'Product Information', parentId: null },
    { id: 'prod-features', name: 'Features & specs', parentId: 'product' },
    { id: 'prod-compat', name: 'Compatibility', parentId: 'product' },
    { id: 'tech', name: 'Technical Support', parentId: null },
    { id: 'tech-errors', name: 'Error messages', parentId: 'tech' },
    { id: 'tech-setup', name: 'Setup & installation', parentId: 'tech' },
    { id: 'account', name: 'Account & Access', parentId: null },
    { id: 'acc-login', name: 'Login & password', parentId: 'account' },
    { id: 'acc-roles', name: 'Roles & permissions', parentId: 'account' },
    { id: 'process', name: 'Process & Procedures', parentId: null },
    { id: 'proc-returns', name: 'Returns', parentId: 'process' },
    { id: 'proc-onboarding', name: 'Onboarding', parentId: 'process' },
    { id: 'billing', name: 'Pricing & Billing', parentId: null },
    { id: 'bill-invoice', name: 'Invoices', parentId: 'billing' },
    { id: 'bill-pricing', name: 'Plans & pricing', parentId: 'billing' },
    { id: UNCATEGORIZED_ID, name: 'Other / Uncategorized', parentId: null }
  ];

  // Categories for an operating-procedures manual. The chatbot assigns these itself.
  const OPS_CATEGORIES = [
    { id: 'safety', name: 'Safety & Compliance', parentId: null },
    { id: 'equip', name: 'Equipment & Maintenance', parentId: null },
    { id: 'quality', name: 'Quality & Audits', parentId: null },
    { id: 'shifts', name: 'Shifts & Staffing', parentId: null },
    { id: 'supply', name: 'Procurement & Suppliers', parentId: null },
    { id: 'records', name: 'Reporting & Records', parentId: null },
    { id: UNCATEGORIZED_ID, name: 'Other / Uncategorized', parentId: null }
  ];

  // Why a question went to a person instead of being answered from the manual.
  //  no-match     the manual has nothing on this           (fixable: add a section)
  //  unclear      the bot cited a section, it did not help  (fixable: clarify the section)
  //  policy       must always go to a person by policy      (by design)
  //  out-of-scope not an operating-procedures topic         (by design, unless you widen the manual)
  const ESCALATION = Object.freeze({ NO_MATCH: 'no-match', UNCLEAR: 'unclear', POLICY: 'policy', SCOPE: 'out-of-scope' });
  const ESCALATION_LABELS = Object.freeze({
    'no-match': 'Manual has nothing on this',
    'unclear': 'Section did not settle it',
    'policy': 'Goes to a person by policy',
    'out-of-scope': 'Outside the manual'
  });
  const ESCALATION_ALIASES = new Map([
    ['no match', 'no-match'], ['nomatch', 'no-match'], ['no section', 'no-match'], ['missing', 'no-match'],
    ['unclear', 'unclear'], ['not clear', 'unclear'], ['section unclear', 'unclear'], ['cited', 'unclear'],
    ['policy', 'policy'], ['by policy', 'policy'], ['personal', 'policy'], ['confidential', 'policy'],
    ['needs approval', 'policy'], ['security', 'policy'],
    ['out of scope', 'out-of-scope'], ['outside scope', 'out-of-scope'], ['scope', 'out-of-scope']
  ]);

  // Words that suggest a subcategory when the chatbot did not send one.
  const KEYWORDS = {
    'prod-features': ['offline', 'users', 'export', 'excel', 'dark mode', 'dashboard', 'feature'],
    'prod-compat': ['browser', 'tablet', 'ipad', 'android', 'sheets', 'teams', 'windows', 'integrate'],
    'tech-errors': ['error', 'code', 'expired', 'blank', 'greyed', 'crash', 'won t load'],
    'tech-setup': ['install', 'installer', 'download', 'setup', 'set up', 'extension', 'sso', 'time zone'],
    'acc-login': ['password', 'login', 'log in', 'locked', 'verification', 'two factor', 'reset'],
    'acc-roles': ['admin', 'role', 'viewer', 'editor', 'permission', 'access', 'remove'],
    'proc-returns': ['return', 'refund', 'receipt', 'loan', 'licence', 'license'],
    'proc-onboarding': ['onboarding', 'laptop', 'badge', 'access card', 'benefits', 'training', 'first day'],
    'bill-invoice': ['invoice', 'charged', 'payment', 'billing address', 'purchase order', 'card'],
    'bill-pricing': ['price', 'cost', 'plan', 'discount', 'trial', 'annual', 'monthly']
  };

  // Lookup tables keyed by normalizeKey() output. Maps avoid prototype surprises.
  const STATUS_ALIASES = new Map([
    ['answered', STATUS.ANSWERED], ['answer found', STATUS.ANSWERED], ['answer', STATUS.ANSWERED], ['found', STATUS.ANSWERED],
    ['ticket open', STATUS.OPEN], ['open ticket', STATUS.OPEN], ['ticket', STATUS.OPEN], ['ticket created', STATUS.OPEN],
    ['ticket closed', STATUS.CLOSED], ['closed ticket', STATUS.CLOSED], ['closed', STATUS.CLOSED]
  ]);
  const TICKET_ALIASES = new Map([
    ['open', 'Open'], ['in progress', 'In Progress'], ['resolved', 'Resolved'], ['done', 'Resolved'], ['closed', 'Closed']
  ]);

  const EXPORT_COLUMNS = [
    'question_id', 'conversation_id', 'submitted_at', 'source_system', 'question_text', 'response_text',
    'resolution_status', 'answer_source', 'ticket_id', 'ticket_status', 'resolution_timestamp',
    'resolution_note', 'flag', 'category', 'subcategory', 'suggested_category',
    'escalation_reason', 'manual_section', 'section_published_at', 'theme'
  ];

  // ---------- small helpers ----------

  function clean(v) {
    return v == null ? '' : String(v).trim();
  }

  // Lowercase, trim, unify separators: used for matching labels from files.
  function normalizeKey(v) {
    return clean(v).toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
  }

  // Grouping key for repeated questions: ignores case, accents, punctuation and a leading greeting.
  function normalizeText(v) {
    let s = clean(v).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
    return s.replace(/^(hi|hello|hey|quick question|can you help|sorry to bother you)\s+/, '');
  }

  function parseDate(v) {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') { const d = new Date(v); return isNaN(d) ? null : d; }
    const s = clean(v);
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  // Finds a category by id or name. parentId: null for top level, a string for subcategories,
  // undefined to search every category.
  function findCategory(categories, raw, parentId) {
    const key = normalizeKey(raw);
    if (!key) return null;
    return categories.find(function (c) {
      const parentOk = parentId === undefined || (c.parentId || null) === parentId;
      return parentOk && (normalizeKey(c.id) === key || normalizeKey(c.name) === key);
    }) || null;
  }

  // Suggests a subcategory id from the wording, or null when nothing matches.
  function suggestCategoryFromText(text) {
    const padded = ' ' + normalizeText(text) + ' ';
    let best = null;
    let bestScore = 0;
    Object.keys(KEYWORDS).forEach(function (id) {
      let score = 0;
      KEYWORDS[id].forEach(function (w) { if (padded.indexOf(' ' + w + ' ') !== -1) score++; });
      if (score > bestScore) { best = id; bestScore = score; }
    });
    return best;
  }

  // ---------- normalization and validation ----------

  /**
   * Turns one raw record (from a file or the sample generator) into a stored record.
   * Returns { ok, record, errors, warnings }. Errors reject the row; warnings are kept.
   */
  function validateRecord(raw, opts) {
    const categories = opts.categories;
    const now = opts.now || new Date();
    const errors = [];
    const warnings = [];

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, errors: ['Row is not a valid record'], warnings: warnings };
    }

    const id = clean(raw.question_id);
    if (!id) errors.push('question_id is missing');
    else if (id.length > MAX_SHORT) errors.push('question_id is longer than ' + MAX_SHORT + ' characters');

    const text = clean(raw.question_text);
    if (!text) errors.push('question_text is missing');
    else if (text.length > MAX_QUESTION) errors.push('question_text is longer than ' + MAX_QUESTION + ' characters');

    const response = clean(raw.response_text);
    if (response.length > MAX_RESPONSE) errors.push('response_text is longer than ' + MAX_RESPONSE + ' characters');

    const submitted = parseDate(raw.submitted_at);
    if (!submitted) errors.push('submitted_at is missing or not a valid date');
    else if (submitted.getTime() > now.getTime() + MAX_FUTURE_MS) errors.push('submitted_at is in the future');

    // Status is required: every question must be Answered, Ticket Open or Ticket Closed.
    const statusRaw = clean(raw.resolution_status);
    let status = STATUS_ALIASES.get(normalizeKey(statusRaw)) || null;
    if (!statusRaw) errors.push('resolution_status is missing (use Answered, Ticket Open or Ticket Closed)');
    else if (!status) errors.push('resolution_status "' + statusRaw + '" must be Answered, Ticket Open or Ticket Closed');

    let source = clean(raw.source_system);
    if (!source) { source = 'Imported'; warnings.push('source_system is missing; set to "Imported"'); }
    else if (source.length > MAX_SHORT) errors.push('source_system is longer than ' + MAX_SHORT + ' characters');

    const note = clean(raw.resolution_note != null && raw.resolution_note !== '' ? raw.resolution_note : raw.note);
    if (note.length > MAX_NOTE) errors.push('resolution_note is longer than ' + MAX_NOTE + ' characters');
    const flag = clean(raw.flag).slice(0, MAX_SHORT);

    // Confirmed category: matched by name or id. Anything unmatched stays uncategorized.
    const catRaw = raw.category != null && raw.category !== '' ? raw.category : raw.category_id;
    let cat = findCategory(categories, catRaw, null);
    let subId = null;
    if (cat && cat.id !== UNCATEGORIZED_ID) {
      const subRaw = raw.subcategory != null && raw.subcategory !== '' ? raw.subcategory : raw.subcategory_id;
      if (clean(subRaw)) {
        const sub = findCategory(categories, subRaw, cat.id);
        if (sub) subId = sub.id;
        else warnings.push('subcategory "' + clean(subRaw) + '" is not under ' + cat.name + '; left blank');
      }
    } else {
      if (clean(catRaw) && (!cat || cat.id !== UNCATEGORIZED_ID)) {
        warnings.push('category "' + clean(catRaw) + '" is not in your category list; kept as Other / Uncategorized');
      }
      cat = categories.find(function (c) { return c.id === UNCATEGORIZED_ID; });
    }

    // Suggested category: from the chatbot if it sent one, otherwise from keyword rules.
    // Suggestions are only shown until an admin accepts them. Confirmed categories have none.
    let suggestedId = '';
    let suggestionSource = '';
    const sugRaw = clean(raw.suggested_category != null && raw.suggested_category !== '' ? raw.suggested_category : raw.suggested_category_id);
    const isUncategorized = cat.id === UNCATEGORIZED_ID;
    if (isUncategorized) {
      if (sugRaw) {
        const s = findCategory(categories, sugRaw, undefined);
        if (s) { suggestedId = s.id; suggestionSource = 'chatbot'; }
        else warnings.push('suggested_category "' + sugRaw + '" is not in your category list; ignored');
      }
      if (!suggestedId) {
        const kw = suggestCategoryFromText(text);
        if (kw) { suggestedId = kw; suggestionSource = 'keywords'; }
      }
    }

    // Ticket fields. ticket_status, when given, decides between Ticket Open and Ticket Closed.
    const ticketId = clean(raw.ticket_id);
    const tsRaw = clean(raw.ticket_status);
    const tsNorm = TICKET_ALIASES.get(normalizeKey(tsRaw)) || '';
    if (status === STATUS.ANSWERED && (ticketId || tsRaw)) {
      warnings.push('Ticket fields ignored because the question was answered');
    }
    if (tsRaw && !tsNorm && status !== STATUS.ANSWERED) {
      warnings.push('ticket_status "' + tsRaw + '" was not recognized; status kept as given');
    }
    let ticketStatus = '';
    if (status === STATUS.OPEN || status === STATUS.CLOSED) {
      if (tsNorm) {
        const derived = CLOSED_TICKET_STATUSES.indexOf(tsNorm) !== -1 ? STATUS.CLOSED : STATUS.OPEN;
        if (derived !== status) warnings.push('ticket_status "' + tsRaw + '" does not match resolution_status "' + status + '"; set to ' + derived);
        status = derived;
        ticketStatus = tsNorm;
      } else {
        ticketStatus = status === STATUS.CLOSED ? 'Closed' : 'Open';
      }
      if (!ticketId) warnings.push('No ticket_id given');
    }

    let resolvedAt = '';
    if (clean(raw.resolution_timestamp)) {
      const r = parseDate(raw.resolution_timestamp);
      if (r) resolvedAt = r.toISOString();
      else warnings.push('resolution_timestamp is not a valid date; ignored');
    }

    // Why a ticket was created. Answered questions have none.
    const isTicketStatus = status === STATUS.OPEN || status === STATUS.CLOSED;
    const reasonRaw = clean(raw.escalation_reason);
    let reason = '';
    if (isTicketStatus) {
      reason = ESCALATION_ALIASES.get(normalizeKey(reasonRaw)) || '';
      if (!reason && ['no-match', 'unclear', 'policy', 'out-of-scope'].indexOf(reasonRaw.toLowerCase()) !== -1) reason = reasonRaw.toLowerCase();
      if (!reason) {
        warnings.push(reasonRaw
          ? 'escalation_reason "' + reasonRaw + '" was not recognized; counted as "manual has nothing on this"'
          : 'escalation_reason is missing; counted as "manual has nothing on this"');
        reason = ESCALATION.NO_MATCH;
      }
    }
    const section = clean(raw.manual_section).slice(0, 200);
    const sectionPublished = parseDate(raw.section_published_at);
    // The bot's own topic label. Falls back to the question wording so repeats still group together.
    const theme = clean(raw.theme).slice(0, 120) || normalizeText(text).slice(0, 120);

    if (errors.length) return { ok: false, errors: errors, warnings: warnings };

    const hasTicket = status === STATUS.OPEN || status === STATUS.CLOSED;
    const nowIso = now.toISOString();
    const events = [];
    if (hasTicket) {
      events.push({ status: 'Open', at: submitted.toISOString() });
      if (ticketStatus !== 'Open') events.push({ status: ticketStatus, at: resolvedAt || nowIso });
    }

    return {
      ok: true,
      warnings: warnings,
      record: {
        question_id: id,
        conversation_id: clean(raw.conversation_id).slice(0, MAX_SHORT),
        question_text: text,
        response_text: response,
        submitted_at: submitted.toISOString(),
        source_system: source,
        resolution_status: status,
        answer_source: clean(raw.answer_source).slice(0, 200),
        ticket_id: hasTicket ? ticketId : '',
        ticket_status: ticketStatus,
        ticket_events: events,
        resolution_timestamp: resolvedAt,
        resolution_note: note,
        flag: flag,
        category_id: cat.id,
        subcategory_id: subId,
        suggested_category_id: suggestedId,
        suggestion_source: suggestionSource,
        normalized_text: normalizeText(text),
        escalation_reason: reason,
        manual_section: section,
        section_published_at: sectionPublished ? sectionPublished.toISOString() : '',
        theme: theme,
        ingested_at: nowIso,
        category_history: []
      }
    };
  }

  /**
   * Validates a list of raw records against the existing IDs.
   * Duplicates (already stored, or repeated inside the file) are skipped and reported.
   */
  function prepareImport(rawRows, opts) {
    const accepted = [];
    const rejected = [];
    const duplicates = [];
    const warnings = [];
    const seen = new Set();
    const existing = opts.existingIds || new Set();

    rawRows.forEach(function (raw, idx) {
      const row = (raw && raw.__row) || idx + 1;
      const res = validateRecord(raw, opts);
      if (!res.ok) {
        rejected.push({ row: row, id: raw && raw.question_id ? String(raw.question_id) : '', errors: res.errors });
        return;
      }
      const id = res.record.question_id;
      if (seen.has(id) || existing.has(id)) {
        duplicates.push({ row: row, id: id, where: seen.has(id) ? 'earlier in this file' : 'already stored' });
        return;
      }
      seen.add(id);
      accepted.push(res.record);
      if (res.warnings.length) warnings.push({ row: row, id: id, messages: res.warnings });
    });
    return { accepted: accepted, rejected: rejected, duplicates: duplicates, warnings: warnings };
  }

  // ---------- file parsing ----------

  // RFC 4180-style CSV: quoted fields, doubled quotes, CRLF or LF, optional BOM.
  function parseCSV(text) {
    const src = String(text || '').replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (inQuotes) {
        if (c === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else if (c !== '\r') {
        field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }

    const nonEmpty = rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ''; }); });
    if (nonEmpty.length < 2) return { records: [], error: 'The file needs a header row and at least one record.' };

    const headers = nonEmpty[0].map(function (h) { return normalizeKey(h).replace(/ /g, '_'); });
    const records = nonEmpty.slice(1).map(function (r, i) {
      const o = { __row: i + 2 };
      headers.forEach(function (h, j) { o[h] = r[j] == null ? '' : r[j]; });
      return o;
    });
    return { records: records };
  }

  function parseJSONImport(text) {
    let data;
    try { data = JSON.parse(String(text || '')); }
    catch (e) { return { records: [], error: 'That file is not valid JSON: ' + e.message }; }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.questions) ? data.questions : null);
    if (!list) return { records: [], error: 'Expected a list of questions, or an object with a "questions" list.' };
    return { records: list.map(function (r, i) { return Object.assign({}, r, { __row: i + 1 }); }) };
  }

  // ---------- export ----------

  function toExportRow(q, categories) {
    const byId = new Map(categories.map(function (c) { return [c.id, c]; }));
    const cat = byId.get(q.category_id);
    const sub = q.subcategory_id ? byId.get(q.subcategory_id) : null;
    const sug = q.suggested_category_id ? byId.get(q.suggested_category_id) : null;
    return {
      question_id: q.question_id,
      conversation_id: q.conversation_id || '',
      submitted_at: q.submitted_at,
      source_system: q.source_system,
      question_text: q.question_text,
      response_text: q.response_text || '',
      resolution_status: q.resolution_status,
      answer_source: q.answer_source || '',
      ticket_id: q.ticket_id || '',
      ticket_status: q.ticket_status || '',
      resolution_timestamp: q.resolution_timestamp || '',
      resolution_note: q.resolution_note || '',
      flag: q.flag || '',
      category: cat && cat.id !== UNCATEGORIZED_ID ? cat.name : '',
      subcategory: sub ? sub.name : '',
      suggested_category: sug ? sug.name : '',
      escalation_reason: q.escalation_reason || '',
      manual_section: q.manual_section || '',
      section_published_at: q.section_published_at || '',
      theme: q.theme || ''
    };
  }

  // Cells that start with = + - @ are prefixed so spreadsheets do not run them as formulas.
  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) || s !== s.trim() ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows, columns) {
    const lines = [columns.map(csvCell).join(',')];
    rows.forEach(function (r) { lines.push(columns.map(function (c) { return csvCell(r[c]); }).join(',')); });
    return lines.join('\r\n') + '\r\n';
  }

  // ---------- retention ----------

  function retentionCutoff(now, months) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - months);
    return d;
  }

  function recordsPastRetention(questions, months, now) {
    const cutoff = retentionCutoff(now || new Date(), months).getTime();
    return questions.filter(function (q) { return Date.parse(q.submitted_at) < cutoff; }).map(function (q) { return q.question_id; });
  }

  // ---------- sample data ----------

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Made-up questions and answers. Nothing here is real company information.
  // a = the chatbot answer, which doubles as the agent's note when a ticket is closed.
  const SAMPLE_TEMPLATES = {
    product: [
      { sub: 'prod-features', q: 'Does the app work offline?', a: 'Saved reports can be viewed offline. Creating new reports needs an internet connection.', src: 'Product FAQ' },
      { sub: 'prod-features', q: 'How many users can one workspace have?', a: 'Standard workspaces support up to 25 users. Enterprise workspaces have no fixed limit.', src: 'Product FAQ' },
      { sub: 'prod-features', q: 'Can I export my reports to Excel?', a: 'Yes. Open a report, choose Export, then select Excel (.xlsx).', src: 'User guide v3' },
      { sub: 'prod-features', q: 'Is there a dark mode?', a: 'Yes. Turn on dark mode in Settings under Appearance.', src: 'Release notes' },
      { sub: 'prod-features', q: 'Can I build custom dashboards?', a: 'Custom dashboards are included in the Pro plan and above.', src: 'Product FAQ' },
      { sub: 'prod-compat', q: 'Which browsers are supported?', a: 'The latest two versions of Chrome, Edge, Firefox and Safari.', src: 'System requirements' },
      { sub: 'prod-compat', q: 'Does it work on tablets?', a: 'Yes. It works on iPad and Android tablets using the latest browser.', src: 'System requirements' },
      { sub: 'prod-compat', q: 'Can I connect it to Google Sheets?', a: 'Yes, through the Sheets connector in the Integrations menu.', src: 'Integration guide' },
      { sub: 'prod-compat', q: 'Is there a Windows desktop installer?', a: 'There is no desktop installer. Use the web app in any supported browser.', src: 'Product FAQ' },
      { sub: 'prod-compat', q: 'Does it integrate with Microsoft Teams?', a: 'A Teams app is available on Business and Enterprise plans.', src: 'Integration guide' }
    ],
    tech: [
      { sub: 'tech-errors', q: 'I keep seeing error code 504 when I upload a file. What does that mean?', a: 'Error 504 means the upload timed out. Try a file under 50 MB, check your connection and retry.', src: 'Error code reference' },
      { sub: 'tech-errors', q: 'Why does the page say "Session expired" right after I log in?', a: 'Your browser may be blocking cookies. Allow cookies for this site and log in again.', src: 'Troubleshooting guide' },
      { sub: 'tech-errors', q: 'The report will not load and shows a blank screen.', a: 'Clear your browser cache and reload. If it persists, try a private window.', src: 'Troubleshooting guide' },
      { sub: 'tech-errors', q: 'What does error E-217 mean?', a: 'E-217 means the file format is not supported. Save the file as CSV or XLSX and try again.', src: 'Error code reference' },
      { sub: 'tech-errors', q: 'The export button is greyed out. Why?', a: 'Export is paused while a report is still loading. Wait for the spinner to stop.', src: 'User guide v3' },
      { sub: 'tech-setup', q: 'How do I install the browser extension?', a: 'Open the Chrome Web Store, search for the extension and click Add to Chrome.', src: 'Setup guide' },
      { sub: 'tech-setup', q: 'How do I set up single sign-on?', a: 'An administrator turns on single sign-on under Security > SSO. Ask your admin to enable it.', src: 'Admin guide' },
      { sub: 'tech-setup', q: 'Where do I download the reporting tool installer?', a: 'Installers are listed on the Downloads page of your account.', src: 'Setup guide' },
      { sub: 'tech-setup', q: 'Do I need to install anything for the mobile app?', a: 'No. Download the app from the App Store or Google Play. No other installation is needed.', src: 'Setup guide' },
      { sub: 'tech-setup', q: 'How do I change my time zone after setup?', a: 'Go to Settings > Profile and select your time zone.', src: 'User guide v3' }
    ],
    account: [
      { sub: 'acc-login', q: 'I forgot my password. How do I reset it?', a: 'Select "Forgot password" on the login page. A reset link is emailed to you within a few minutes.', src: 'Account FAQ' },
      { sub: 'acc-login', q: 'Why is my account locked?', a: 'Accounts lock after five failed sign-in attempts. Wait 15 minutes or ask an administrator to unlock it.', src: 'Account FAQ' },
      { sub: 'acc-login', q: 'How do I turn on two-factor authentication?', a: 'Go to Settings > Security and select Turn on two-factor authentication.', src: 'Security guide' },
      { sub: 'acc-login', q: 'I am not getting the verification code by email.', a: 'Check your spam folder. If it is not there, request a new code after 60 seconds.', src: 'Account FAQ' },
      { sub: 'acc-login', q: 'Can I change the email address on my account?', a: 'Yes. Go to Settings > Profile, update your email and verify the new address.', src: 'Account FAQ' },
      { sub: 'acc-roles', q: 'How do I give a colleague admin access?', a: 'Admins can invite colleagues and assign roles under Team > Members.', src: 'Admin guide' },
      { sub: 'acc-roles', q: 'What is the difference between Viewer and Editor?', a: 'Viewers can read reports. Editors can also create and change them.', src: 'Roles reference' },
      { sub: 'acc-roles', q: 'Can I remove a team member access?', a: 'Yes. Admins can remove members under Team > Members. Access stops immediately.', src: 'Admin guide' },
      { sub: 'acc-roles', q: 'Why can I not edit this dashboard?', a: 'Only the owner and Editors can make changes. Ask the owner to share edit access.', src: 'Roles reference' },
      { sub: 'acc-roles', q: 'How do I request access to another department folder?', a: 'Send a request from the folder page. The folder owner approves or declines it.', src: 'Admin guide' }
    ],
    process: [
      { sub: 'proc-returns', q: 'How do I return a device I was loaned?', a: 'Fill in the return form on the Assets page and ship the device to the address in the confirmation email.', src: 'Returns procedure' },
      { sub: 'proc-returns', q: 'What is the return window for software licences?', a: 'Unused software licences can be returned within 30 days of purchase.', src: 'Returns procedure' },
      { sub: 'proc-returns', q: 'Do I need a receipt to return an item?', a: 'A receipt or order number is required. Your order number is in the purchase confirmation.', src: 'Returns procedure' },
      { sub: 'proc-returns', q: 'Who approves a refund request?', a: 'The department budget holder approves refunds within five working days.', src: 'Finance procedure' },
      { sub: 'proc-returns', q: 'How long do refunds take?', a: 'Refunds are processed within 10 working days of approval.', src: 'Finance procedure' },
      { sub: 'proc-onboarding', q: 'What should a new employee do first?', a: 'Complete the welcome checklist in your inbox, then book an introduction call with your manager.', src: 'Onboarding checklist' },
      { sub: 'proc-onboarding', q: 'When will I get my laptop?', a: 'Laptops are ready two working days before your start date. IT emails pickup details.', src: 'Onboarding checklist' },
      { sub: 'proc-onboarding', q: 'Who do I contact about benefits enrollment?', a: 'Contact the HR benefits team through the HR portal.', src: 'HR portal' },
      { sub: 'proc-onboarding', q: 'How do I get a building access card?', a: 'Visit the Facilities desk on your first day with photo ID. Cards are issued the same day.', src: 'Onboarding checklist' },
      { sub: 'proc-onboarding', q: 'Is there a training schedule for new hires?', a: 'Yes. The training calendar is in the Learning section of the HR portal.', src: 'HR portal' }
    ],
    billing: [
      { sub: 'bill-invoice', q: 'Where can I download my invoices?', a: 'Go to Billing > Invoices. Each invoice can be downloaded as a PDF.', src: 'Billing FAQ' },
      { sub: 'bill-invoice', q: 'Can I change the billing address on an invoice?', a: 'Yes. Update the billing address under Billing > Details. Future invoices use the new address.', src: 'Billing FAQ' },
      { sub: 'bill-invoice', q: 'Why was I charged twice this month?', a: 'Duplicate charges are usually reversed within 5 days. Contact billing with the invoice numbers if not.', src: 'Billing FAQ' },
      { sub: 'bill-invoice', q: 'Can I add a purchase order number to my invoice?', a: 'Yes. Add a PO number under Billing > Details before the invoice is generated.', src: 'Billing FAQ' },
      { sub: 'bill-invoice', q: 'How do I update my payment card?', a: 'Go to Billing > Payment method and select Update card.', src: 'Billing FAQ' },
      { sub: 'bill-pricing', q: 'How much does the Pro plan cost?', a: 'The Pro plan is $29 per user per month billed monthly, or $24 billed annually.', src: 'Pricing sheet 2026' },
      { sub: 'bill-pricing', q: 'Is there a discount for nonprofits?', a: 'Registered nonprofits get 20% off paid plans. Apply on the Pricing page.', src: 'Pricing sheet 2026' },
      { sub: 'bill-pricing', q: 'Can I switch from monthly to annual billing?', a: 'Yes. Change the billing cycle under Billing > Plan. It takes effect at your next renewal.', src: 'Pricing sheet 2026' },
      { sub: 'bill-pricing', q: 'Is there a free trial?', a: 'Yes. The Pro plan has a 14-day free trial. No card is needed to start.', src: 'Pricing sheet 2026' },
      { sub: 'bill-pricing', q: 'What happens if I go over my plan user limit?', a: 'You will be asked to upgrade. Extra users are billed at the plan per-user rate.', src: 'Pricing sheet 2026' }
    ],
    [UNCATEGORIZED_ID]: [
      { sub: '', q: 'Do you sponsor student clubs?', a: 'Please see the general information page.', src: 'General FAQ' },
      { sub: '', q: 'Is there a mobile app for the parking permit?', a: 'Please see the general information page.', src: 'General FAQ' },
      { sub: '', q: 'Where is the campus map?', a: 'Please see the general information page.', src: 'General FAQ' },
      { sub: '', q: 'Can I bring my dog to the office?', a: 'Please see the general information page.', src: 'General FAQ' },
      { sub: '', q: 'Do you have a referral bonus program?', a: 'Please see the general information page.', src: 'General FAQ' },
      { sub: '', q: 'Can the team get free lunch on Fridays?', a: 'Please see the general information page.', src: 'General FAQ' }
    ]
  };

  const SAMPLE_PREFIXES = ['Hi, ', 'Hello, ', 'Quick question: ', 'Can you help? ', 'Sorry to bother you, '];

  /**
   * Generates made-up raw records in the same shape an import file uses.
   * The same seed always gives the same records, so tests can rely on it.
   * About 15% have no confirmed category, only a chatbot suggestion, so the
   * admin's accept step has something to do.
   */
  function generateSampleRows(count, now, seed) {
    const rng = mulberry32(seed == null ? 20260108 : seed);
    const pick = function (arr) { return arr[Math.floor(rng() * arr.length)]; };
    const weights = [
      ['product', 0.2], ['tech', 0.25], ['account', 0.15],
      ['process', 0.15], ['billing', 0.15], [UNCATEGORIZED_ID, 0.1]
    ];
    // Probability that the chatbot answered. The rest are tickets (open or closed by age).
    const answerRate = {
      product: 0.85, tech: 0.55, account: 0.40, process: 0.90, billing: 0.70, [UNCATEGORIZED_ID]: 0.30
    };
    const names = new Map(DEFAULT_CATEGORIES.map(function (c) { return [c.id, c.name]; }));
    const DAY = 24 * 60 * 60 * 1000;
    const rows = [];

    for (let i = 0; i < count; i++) {
      let roll = rng();
      let catId = weights[weights.length - 1][0];
      for (let w = 0; w < weights.length; w++) {
        roll -= weights[w][1];
        if (roll < 0) { catId = weights[w][0]; break; }
      }
      const tpl = pick(SAMPLE_TEMPLATES[catId]);
      const submitted = new Date(now.getTime() - rng() * 365 * DAY);
      const ageDays = (now.getTime() - submitted.getTime()) / DAY;
      const answered = rng() < answerRate[catId];
      const unconfirmed = rng() < 0.15;

      let text = tpl.q;
      if (rng() < 0.3) text = pick(SAMPLE_PREFIXES) + text.charAt(0).toLowerCase() + text.slice(1);

      const raw = {
        question_id: 'SMP-' + String(i + 1).padStart(5, '0'),
        conversation_id: 'SMP-C-' + String(Math.floor(i / 2) + 1).padStart(5, '0'),
        question_text: text,
        submitted_at: submitted.toISOString(),
        source_system: SAMPLE_SOURCE,
        resolution_status: answered ? 'Answered' : 'Ticket Open',
        category: unconfirmed ? '' : names.get(catId),
        subcategory: unconfirmed || !tpl.sub ? '' : names.get(tpl.sub),
        suggested_category: unconfirmed ? (tpl.sub || catId) : '',
        response_text: answered ? tpl.a : '',
        answer_source: answered ? tpl.src : '',
        ticket_id: '',
        ticket_status: '',
        resolution_timestamp: '',
        resolution_note: '',
        flag: ''
      };
      if (!answered) {
        raw.ticket_id = 'TCK-' + String(10001 + i);
        if (ageDays > 14) {
          raw.resolution_status = 'Ticket Closed';
          raw.ticket_status = rng() < 0.8 ? 'Resolved' : 'Closed';
          const resolved = Math.min(now.getTime(), submitted.getTime() + (1 + rng() * 9) * DAY);
          raw.resolution_timestamp = new Date(resolved).toISOString();
          raw.resolution_note = tpl.a;
          if (rng() < 0.04) raw.flag = 'Standardize';
        } else {
          raw.ticket_status = rng() < 0.5 ? 'Open' : 'In Progress';
        }
      }
      rows.push(raw);
    }
    return rows;
  }

  // ---------- operating-procedures sample (about 18 weeks of history) ----------

  const OPS_SECTIONS = {
    handover: 'Shift handover procedure', loto: 'Lockout/tagout steps', ppe: 'PPE requirements', incident: 'Incident reporting',
    startup: 'Equipment startup checklist', po: 'Purchase order approvals', hold: 'Quality hold and release', overtime: 'Overtime request process',
    spill: 'Chemical spill response', onboard: 'Supplier onboarding checklist', cold: 'Cold-weather startup procedure'
  };
  // publishedAgo: days ago the section was added; null = part of the original manual.
  const OPS_SECTION_LIST = [
    { title: OPS_SECTIONS.handover, category: 'shifts', publishedAgo: null }, { title: OPS_SECTIONS.loto, category: 'safety', publishedAgo: null },
    { title: OPS_SECTIONS.ppe, category: 'safety', publishedAgo: null }, { title: OPS_SECTIONS.incident, category: 'records', publishedAgo: null },
    { title: OPS_SECTIONS.startup, category: 'equip', publishedAgo: null }, { title: OPS_SECTIONS.po, category: 'supply', publishedAgo: null },
    { title: OPS_SECTIONS.hold, category: 'quality', publishedAgo: null }, { title: OPS_SECTIONS.overtime, category: 'shifts', publishedAgo: null },
    { title: 'Visitor access rules', category: 'safety', publishedAgo: null },
    { title: OPS_SECTIONS.spill, category: 'safety', publishedAgo: 45 }, { title: OPS_SECTIONS.onboard, category: 'supply', publishedAgo: 28 },
    { title: OPS_SECTIONS.cold, category: 'equip', publishedAgo: 14 }
  ];

  // kind: A answered | U answered sometimes, otherwise the section did not settle it | G manual gap
  //       P always goes to a person by policy | S outside the manual.   w = how often it is asked.
  const oA = function (label, cat, w, section, phrases) { return { kind: 'A', label: label, cat: cat, w: w, section: section, phrases: phrases }; };
  const oU = function (label, cat, w, section, p, phrases, note, ramp) { return { kind: 'U', label: label, cat: cat, w: w, section: section, p: p, phrases: phrases, note: note, ramp: ramp }; };
  const oG = function (label, cat, w, phrases, note, fix, ramp) { return { kind: 'G', label: label, cat: cat, w: w, phrases: phrases, note: note, fix: fix, ramp: ramp }; };
  const oP = function (label, cat, w, phrases) { return { kind: 'P', label: label, cat: cat, w: w, phrases: phrases }; };
  const oS = function (label, cat, w, phrases, note) { return { kind: 'S', label: label, cat: cat, w: w, phrases: phrases, note: note }; };

  const OPS_THEMES = [
    oA('Shift handover steps', 'shifts', 9, OPS_SECTIONS.handover, ['What do I cover in a shift handover?', 'Where do I log the handover notes?', 'Who signs off the handover sheet?']),
    oA('Lockout/tagout steps', 'safety', 6, OPS_SECTIONS.loto, ['What are the lockout/tagout steps?', 'How do I lock out the press before cleaning?', 'Who removes a lockout tag?']),
    oA('PPE for each work area', 'safety', 7, OPS_SECTIONS.ppe, ['What PPE do I need on the packing line?', 'Are safety glasses required in the warehouse?', 'Which gloves do I use for cleaning?']),
    oA('How to report an incident', 'records', 8, OPS_SECTIONS.incident, ['How do I report an incident?', 'Where is the incident form?', 'Who do I tell about an injury?']),
    oA('Equipment startup checklist', 'equip', 7, OPS_SECTIONS.startup, ['What is the startup checklist for line 2?', 'What do I check before starting the conveyor?', 'How do I start the compressor?']),
    oA('Purchase order approval limits', 'supply', 6, OPS_SECTIONS.po, ['Who approves a purchase order?', 'What is the approval limit for a supervisor?', 'Do I need two signatures on a PO?']),
    oA('Putting a batch on quality hold', 'quality', 5, OPS_SECTIONS.hold, ['How do I put a batch on hold?', 'What tag goes on held product?', 'Who do I notify about a quality hold?']),
    oA('Overtime request process', 'shifts', 6, OPS_SECTIONS.overtime, ['How do I request overtime?', 'Who approves extra shifts?', 'How far ahead must overtime be requested?']),

    oU('Incident reporting: near-miss deadline', 'records', 4, OPS_SECTIONS.incident, 0.2, ['Do near-misses need a report too?', 'How soon must a near-miss be reported?', 'What counts as a near-miss?'], 'Near-misses must be logged within 24 hours, using the same form as incidents.'),
    oU('Lockout/tagout: contractors', 'safety', 3.5, OPS_SECTIONS.loto, 0.3, ['Do contractors follow the same lockout steps?', 'Can a contractor apply their own lock?', 'Who supervises a contractor lockout?'], 'Contractors apply their own lock and must be escorted by an authorized employee.'),
    oU('Purchase orders: emergency buys', 'supply', 3.5, OPS_SECTIONS.po, 0.3, ['How do I buy a part urgently after hours?', 'Can I buy without a PO in an emergency?', 'Who approves an emergency purchase?'], 'Emergency purchases up to $2,000 can be approved by the on-call manager; raise the PO within 1 business day.'),
    oU('Quality hold: who can release', 'quality', 3, OPS_SECTIONS.hold, 0.35, ['Who can release a batch from hold?', 'Can a supervisor release held product?', 'What sign-off is needed to release a hold?'], 'Only the Quality Manager or a named delegate can release a hold, with a signed deviation record.', { from: 80 }),

    oG('Chemical spill response', 'safety', 8, ['What do I do if a chemical spills?', 'Where is the spill kit?', 'Who do I call for a large spill?'], 'Isolate the area, use the spill kit by the exit, call the safety lead on ext. 400, and file an incident report.', { section: OPS_SECTIONS.spill, ago: 45 }),
    oG('Supplier onboarding', 'supply', 7, ['How do I add a new supplier?', 'What paperwork does a new supplier need?', 'Who vets a new supplier?'], 'Send the supplier the onboarding pack; Procurement checks insurance and quality certificates before the first order.', { section: OPS_SECTIONS.onboard, ago: 28 }),
    oG('Cold-weather startup', 'equip', 5.5, ['Is there a different startup for freezing weather?', 'How long should the line warm up in winter?', 'What do I check on cold mornings?'], 'Below 2C let hydraulics warm up for 20 minutes and check for ice on sensors before full speed.', { section: OPS_SECTIONS.cold, ago: 14 }),
    oG('Forklift certification renewal', 'safety', 3.5, ['How do I renew my forklift certificate?', 'When does forklift training expire?', 'Where do I book forklift recertification?'], 'Certificates last 3 years. Book recertification through the safety lead at least 30 days before expiry.'),
    oG('Calibration out of tolerance', 'quality', 3.2, ['What if a gauge is out of tolerance?', 'Gauge failed calibration, what now?', 'Do I quarantine product measured with an out-of-tolerance gauge?'], 'Tag the gauge, quarantine product measured since the last good check, and notify Quality the same day.'),
    oG('Night-shift sick call', 'shifts', 2.6, ['Who do I call if I am sick on night shift?', 'How do I call in sick?', 'What is the sick-call procedure?'], 'Call the shift supervisor at least 2 hours before the shift. Do not text or email.'),
    oG('Audit preparation checklist', 'quality', 2.4, ['What should we prepare before an external audit?', 'Is there an audit prep checklist?', 'How do we get ready for the ISO audit?'], 'Update the document register, check calibration stickers, walk the floor with the 5S checklist, and brief all leads.'),
    oG('Scrap and waste disposal', 'records', 2, ['Where does scrap metal go?', 'How do I record scrap?', 'How do I dispose of oily rags?'], 'Segregate by bin color, record the weight on the scrap log, and use the sealed bin for oily rags.'),
    oG('Winter shutdown schedule', 'shifts', 2, ['When is the winter shutdown?', 'Who works during the shutdown?', 'How do I sign up for shutdown maintenance?'], 'Shutdown runs from Dec 24 to Jan 2. Maintenance sign-up opens on Dec 1 on the shift board.', null, { from: 35 }),

    oP('My overtime hours', 'shifts', 4.5, ['How many overtime hours do I have this month?', 'What is my overtime balance?', 'How many hours have I worked this week?']),
    oP('Leave early today', 'shifts', 4, ['Can I leave early today?', 'Can I swap shifts with Sam on Friday?', 'May I take Monday off?']),
    oP('Override a safety interlock', 'safety', 1.5, ['Can I bypass the safety interlock to clear a jam?', 'How do I override the guard sensor?', 'Can I run with the door open?']),
    oP('Exception to a procedure', 'quality', 2.2, ['Can I skip the inspection step this once?', 'Can we get an exception to the hold procedure?', 'Can I approve my own deviation?']),
    oP('Disciplinary or personal records', 'records', 1.2, ['Why was I given a warning?', 'What is in my training record?', 'Can I see my performance review?']),

    oS('Parking permits', 'records', 2.2, ['How do I get a parking permit?', 'Where do visitors park?', 'Is parking free for staff?'], 'Redirected to Facilities.'),
    oS('IT: login and badge problems', 'records', 2, ['I cannot log in to my account', 'My badge does not open the gate', 'How do I reset my password?'], 'Redirected to the IT helpdesk.'),
    oS('Cafeteria and canteen', 'records', 1.2, ['What are the canteen hours?', 'Is there a vegetarian option?', 'Who runs the vending machines?'], 'Redirected to Facilities.')
  ];

  const OPS_POLICY_NOTE = 'Handled directly by the responsible team.';
  const OPS_GREETINGS = ['', '', '', 'Hi, ', 'Hello, ', 'Quick question: '];

  function opsWeight(t, ago) {
    if (t.ramp) return ago >= t.ramp.from ? 0 : t.w * 2 * (1 - ago / t.ramp.from);
    return t.w;
  }

  /**
   * Made-up operating-procedures questions in the same shape an import file uses,
   * plus the manual sections (some added during the period, so their effect can be tracked).
   * Everything is generated relative to "now" and is deterministic for a given seed.
   */
  function generateOpsSample(now, seed, days) {
    const nowDate = now || new Date();
    const span = days || 126;
    const rng = mulberry32(seed == null ? 20260811 : seed);
    const DAY = 24 * 60 * 60 * 1000;
    const today = new Date(nowDate);
    today.setHours(0, 0, 0, 0);
    const catName = new Map(OPS_CATEGORIES.map(function (c) { return [c.id, c.name]; }));
    const publishedAt = new Map();
    const sections = OPS_SECTION_LIST.map(function (s) {
      const at = s.publishedAgo == null ? null : new Date(today.getTime() - s.publishedAgo * DAY + 9 * 3600000);
      if (at) publishedAt.set(s.title, at.toISOString());
      return { title: s.title, category: catName.get(s.category), publishedAt: at ? at.toISOString() : '' };
    });
    const rows = [];
    let n = 0;
    let ticketNo = 0;

    for (let ago = span - 1; ago >= 0; ago--) {
      const day = new Date(today.getTime() - ago * DAY);
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      const count = Math.max(0, Math.round((weekend ? 5 : 17) + (rng() - 0.5) * 4 + ((span - ago) / span) * 3));
      const weights = OPS_THEMES.map(function (t) { return opsWeight(t, ago); });
      const sum = weights.reduce(function (a, b) { return a + b; }, 0);
      for (let i = 0; i < count; i++) {
        let pick = rng() * sum;
        let k = 0;
        while (k < OPS_THEMES.length - 1 && pick >= weights[k]) { pick -= weights[k]; k++; }
        const t = OPS_THEMES[k];
        const at = new Date(day.getTime() + (6 + Math.floor(rng() * 13)) * 3600000 + Math.floor(rng() * 60) * 60000);
        if (at > nowDate) continue;
        const phrase = t.phrases[Math.floor(rng() * t.phrases.length)];
        const greeting = OPS_GREETINGS[Math.floor(rng() * OPS_GREETINGS.length)];
        const text = greeting && !greeting.endsWith(': ') ? greeting + phrase.charAt(0).toLowerCase() + phrase.slice(1) : greeting + phrase;
        n++;
        const raw = {
          question_id: 'SMP-' + String(n).padStart(5, '0'), conversation_id: 'SMP-C-' + String(n).padStart(5, '0'),
          question_text: text, submitted_at: at.toISOString(), source_system: SAMPLE_SOURCE,
          category: catName.get(t.cat), subcategory: '', theme: t.label,
          resolution_status: 'Answered', response_text: '', answer_source: '', manual_section: '', section_published_at: '',
          escalation_reason: '', ticket_id: '', ticket_status: '', resolution_timestamp: '', resolution_note: '', flag: ''
        };
        let answeredBy = null; // section title when answered
        let reason = '';
        let note = '';
        if (t.kind === 'A') answeredBy = t.section;
        else if (t.kind === 'U') {
          if (rng() < t.p) answeredBy = t.section; else { reason = ESCALATION.UNCLEAR; raw.manual_section = t.section; note = t.note; }
        } else if (t.kind === 'G') {
          if (t.fix && ago < t.fix.ago) {
            if (rng() < 0.85) answeredBy = t.fix.section; else { reason = ESCALATION.UNCLEAR; raw.manual_section = t.fix.section; note = t.note; }
          } else { reason = ESCALATION.NO_MATCH; note = t.note; }
        } else if (t.kind === 'P') { reason = ESCALATION.POLICY; note = OPS_POLICY_NOTE; }
        else { reason = ESCALATION.SCOPE; note = t.note; }

        if (answeredBy) {
          raw.response_text = 'See "' + answeredBy + '" in the operating manual.';
          raw.answer_source = answeredBy;
          raw.manual_section = answeredBy;
        } else {
          raw.escalation_reason = reason;
          raw.ticket_id = 'TCK-' + String(10001 + ticketNo++);
          if (ago > 14) {
            raw.resolution_status = 'Ticket Closed';
            raw.ticket_status = rng() < 0.8 ? 'Resolved' : 'Closed';
            raw.resolution_timestamp = new Date(Math.min(nowDate.getTime(), at.getTime() + (1 + rng() * 6) * DAY)).toISOString();
            raw.resolution_note = note;
          } else {
            raw.resolution_status = 'Ticket Open';
            raw.ticket_status = rng() < 0.5 ? 'Open' : 'In Progress';
          }
        }
        if (raw.manual_section && publishedAt.has(raw.manual_section)) raw.section_published_at = publishedAt.get(raw.manual_section);
        rows.push(raw);
      }
    }
    return { rows: rows, sections: sections };
  }

  return {
    STATUS: STATUS,
    ESCALATION: ESCALATION,
    ESCALATION_LABELS: ESCALATION_LABELS,
    OPS_CATEGORIES: OPS_CATEGORIES,
    generateOpsSample: generateOpsSample,
    ALL_STATUSES: ALL_STATUSES,
    TICKET_STATUSES: TICKET_STATUSES,
    CLOSED_TICKET_STATUSES: CLOSED_TICKET_STATUSES,
    UNCATEGORIZED_ID: UNCATEGORIZED_ID,
    SAMPLE_SOURCE: SAMPLE_SOURCE,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    KEYWORDS: KEYWORDS,
    EXPORT_COLUMNS: EXPORT_COLUMNS,
    normalizeKey: normalizeKey,
    normalizeText: normalizeText,
    parseDate: parseDate,
    findCategory: findCategory,
    suggestCategoryFromText: suggestCategoryFromText,
    validateRecord: validateRecord,
    prepareImport: prepareImport,
    parseCSV: parseCSV,
    parseJSONImport: parseJSONImport,
    toExportRow: toExportRow,
    toCSV: toCSV,
    recordsPastRetention: recordsPastRetention,
    generateSampleRows: generateSampleRows
  };
});
