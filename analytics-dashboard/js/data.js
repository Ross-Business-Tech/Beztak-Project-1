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
    'resolution_note', 'flag', 'category', 'subcategory', 'suggested_category'
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
      suggested_category: sug ? sug.name : ''
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

  return {
    STATUS: STATUS,
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
