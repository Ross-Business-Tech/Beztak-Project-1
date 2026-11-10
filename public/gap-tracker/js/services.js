/*
 * Services: everything the screens need that is not drawing.
 * Loading a questions file, settings, the team's decisions on each gap, results of past fixes,
 * backup and restore, and the scheduled progress deck / fix-list emails.
 *
 * Both redesigns sit on this same layer, so they always show the same numbers.
 * Nothing is uploaded: files are read in the browser and kept in this browser only.
 *
 *   const svc = QAD.svc;
 *   svc.on('brief', function (brief) { ... });   // fires whenever the numbers are rebuilt
 *   svc.on('decisions', fn); svc.on('message', fn); svc.on('updates', fn);
 *   svc.loadSample();  svc.loadFile(file);  svc.setMonth('2026-10');
 *   svc.state.brief   // the numbers for the chosen month (see briefing.js: build())
 */
(function () {
  'use strict';
  const Q = window.QAD;
  const D = Q.data;
  const B = Q.briefing;
  const IM = Q.improve;
  const U = Q.ui;
  const decision = Q.decision;

  const SETTINGS_KEY = 'monthly-board-briefing-settings-v1';
  const FIELDS = ['org', 'preparedBy', 'goal', 'minutesPerTicket', 'brand', 'team'];

  // ---------- tiny event bus ----------

  const listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, arg) { (listeners[ev] || []).forEach(function (f) { try { f(arg); } catch (e) { console.error(e); } }); }

  const state = {
    records: [], sections: [], ym: null, months: [], brief: null, deck: null, pptx: null,
    source: '', kept: false, message: '', messageKind: ''
  };

  // ---------- settings ----------

  function settingsGet() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { /* storage blocked */ }
    const s = Object.assign({}, B.DEFAULTS, saved);
    s.goal = Math.min(100, Math.max(1, Number(s.goal) || B.DEFAULTS.goal));
    s.minutesPerTicket = Math.min(600, Math.max(1, Number(s.minutesPerTicket) || B.DEFAULTS.minutesPerTicket));
    s.org = String(s.org || '').trim() || B.DEFAULTS.org;
    s.team = String(s.team || '');
    return s;
  }
  function settingsSet(patch) {
    const next = Object.assign(settingsGet(), patch);
    const keep = {};
    FIELDS.forEach(function (f) { keep[f] = next[f]; });
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(keep)); } catch (e) { /* ignore */ }
    emit('settings', settingsGet());
    rebuild();
  }
  function teamList() {
    return String(settingsGet().team || '').split(/[,;\n]+/).map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 40);
  }
  /** Team from settings plus every owner already used on a decision. */
  function people() {
    const all = decision.everything();
    const used = Object.keys(all).map(function (k) { return all[k].owner; }).filter(Boolean);
    return Array.from(new Set(teamList().concat(used))).sort();
  }

  // ---------- keeping the last file in this browser ----------

  const IDB = { name: 'monthly-board-briefing', store: 'files', key: 'questions' };
  function idb(mode, fn) {
    return new Promise(function (resolve, reject) {
      let req;
      try { req = indexedDB.open(IDB.name, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB.store); };
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        const db = req.result;
        const tx = db.transaction(IDB.store, mode);
        const r = fn(tx.objectStore(IDB.store));
        tx.oncomplete = function () { db.close(); resolve(r && r.result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      };
    });
  }
  const keepFile = function (rec) { return idb('readwrite', function (st) { return st.put(rec, IDB.key); }).catch(function () { /* blocked: fine */ }); };
  const savedFile = function () { return idb('readonly', function (st) { return st.get(IDB.key); }).catch(function () { return null; }); };
  function forgetSaved() {
    return idb('readwrite', function (st) { return st.delete(IDB.key); }).catch(function () { /* ignore */ }).then(function () {
      state.kept = false; emit('message', null); emit('brief', state.brief);
    });
  }

  // ---------- loading ----------

  function say(text, kind) { state.message = text; state.messageKind = kind || ''; emit('message', { text: text, kind: kind || '' }); }

  function accept(result, label, sections, opts) {
    opts = opts || {};
    if (!result.accepted.length) {
      say('No usable questions were found in ' + label + '. ' + (result.rejected[0] ? 'First problem: row ' + result.rejected[0].row + ': ' + result.rejected[0].errors[0] : ''), 'err');
      return false;
    }
    state.records = result.accepted;
    state.sections = sections || [];
    state.source = label;
    state.kept = !!(opts.keep || opts.restored);
    state.months = B.availableMonths(state.records);
    state.ym = B.defaultMonth(state.records) || state.months[state.months.length - 1].ym;
    let msg = U.n0(state.records.length) + ' questions from ' + label + ', ' + state.months[0].label + ' to ' + state.months[state.months.length - 1].label + '.';
    if (result.rejected.length) msg += ' ' + U.n0(result.rejected.length) + ' rows were skipped (for example row ' + result.rejected[0].row + ': ' + result.rejected[0].errors[0] + ').';
    if (result.duplicates.length) msg += ' ' + U.n0(result.duplicates.length) + ' repeated question IDs were ignored.';
    say(msg, result.rejected.length ? '' : 'ok');
    rebuild();
    if (!opts.restored && result.rejected.length) U.toast(U.n0(result.rejected.length) + ' rows in the file were skipped.', true);
    return true;
  }

  function parseText(text, name) {
    const parsed = /\.json$/i.test(name) ? D.parseJSONImport(text) : D.parseCSV(text);
    if (parsed.error) return { error: parsed.error };
    return { result: D.prepareImport(parsed.records, { categories: D.OPS_CATEGORIES, now: new Date(), existingIds: new Set() }) };
  }

  /** Reads a File the user chose or dropped. Resolves true when it was usable. */
  function loadFile(file) {
    if (!file) return Promise.resolve(false);
    if (file.size > 60 * 1024 * 1024) { say('That file is larger than 60 MB. Export a shorter period.', 'err'); return Promise.resolve(false); }
    return file.text().then(function (text) {
      const p = parseText(text, file.name);
      if (p.error) { say(p.error, 'err'); U.toast(p.error, true); return false; }
      const ok = accept(p.result, file.name, [], { keep: true });
      if (ok) keepFile({ name: file.name, text: text, at: Date.now() });
      return ok;
    }).catch(function () { say('That file could not be read.', 'err'); return false; });
  }

  /** Made-up questions through 31 Oct 2026. The far-future "now" keeps them valid on any computer clock. */
  function loadSample() {
    forgetSaved();
    const sample = D.generateOpsSample(new Date(2026, 9, 31, 23, 59), 20261031, 215);
    const result = D.prepareImport(sample.rows, { categories: D.OPS_CATEGORIES, now: new Date(2099, 0, 1), existingIds: new Set() });
    return accept(result, 'the sample data', sample.sections);
  }

  /**
   * Takes questions straight from a host page (the HR desk) instead of a file.
   * rows are raw export-style records (see EXPORT_COLUMNS in engine/data.js). Nothing is stored in this browser.
   */
  function loadRows(rows, label, sections) {
    const result = D.prepareImport(Array.isArray(rows) ? rows : [], { categories: D.OPS_CATEGORIES, now: new Date(Date.now() + 86400000), existingIds: new Set() });
    if (!result.accepted.length) {
      state.records = []; state.brief = null; state.source = label || 'the HR desk';
      say('No questions to show yet.', 'err');
      emit('brief', null);
      return false;
    }
    return accept(result, label || 'the HR desk', sections || [], {});
  }

  function restoreSaved() {
    return savedFile().then(function (rec) {
      if (!rec || !rec.text) return false;
      const p = parseText(rec.text, rec.name);
      return p.result ? accept(p.result, rec.name, [], { restored: true }) : false;
    });
  }

  function setMonth(ym) { if (state.months.some(function (m) { return m.ym === ym; })) { state.ym = ym; rebuild(); } }

  function rebuild() {
    const s = settingsGet();
    document.documentElement.style.setProperty('--brand', s.brand || '#1473e6');
    if (!state.records.length) { emit('brief', null); return; }
    state.pptx = null;
    try {
      state.brief = B.build(state.records, state.ym, s, state.sections);
      state.deck = Q.slides.build(state.brief);
    } catch (e) {
      say('Could not build the numbers: ' + e.message, 'err');
      return;
    }
    emit('brief', state.brief);
    emit('updates', null);
  }

  // ---------- gaps and decisions ----------

  const typeWords = function (c) { return c.kind === 'add' ? 'Add a section' : 'Clarify a section'; };
  const verb = function (c) { return c.kind === 'add' ? 'Add' : 'Clarify'; };
  /** hi = biggest third of gaps, mid = middle third, lo = the rest. */
  function severity(c) {
    const b = state.brief;
    const n = (b && b.changes.length) || 1;
    const third = Math.ceil(n / 3);
    return !c.rank ? 'lo' : c.rank <= third ? 'hi' : c.rank <= third * 2 ? 'mid' : 'lo';
  }

  // A gap the file no longer lists (because the fix worked) is rebuilt from what was saved with the decision.
  function synth(key) {
    const brief = state.brief;
    const saved = decision.everything()[U.norm(key)] || {};
    const snap = saved.snap || {};
    const rows = brief.records.filter(function (q) { return IM.themeKey(q) === saved.theme; });
    const det = IM.themeDetail(rows);
    const answered = det.questions.filter(function (x) { return x.answered; }).length;
    return {
      key: saved.theme || key, theme: saved.theme || key, kind: snap.kind || 'add', category: snap.category || 'Other', tickets: snap.tickets || 0, more: snap.more || 0,
      hours: 0, section: snap.section || '', notes: det.notes, questions: det.questions, asked: rows.length, answeredShare: rows.length ? (answered / rows.length) * 100 : 0,
      example: det.questions.length ? det.questions[0].text : (saved.theme || key), examples: [], rank: null, synthetic: true, perMonth: 0
    };
  }
  /** One gap by key (ranked, or rebuilt from a saved decision). */
  function find(key) {
    const brief = state.brief;
    if (!brief) return null;
    const hit = brief.changes.filter(function (c) { return U.norm(c.key) === U.norm(key); })[0];
    if (hit) return hit;
    return decision.everything()[U.norm(key)] ? synth(key) : null;
  }
  /** Gaps with this decision status: todo | doing | done | dismissed. Ranked ones first. */
  function itemsFor(status) {
    const brief = state.brief;
    if (!brief) return [];
    const out = brief.changes.filter(function (c) { return decision.get(c.key).status === status; });
    const have = new Set(out.map(function (c) { return U.norm(c.key); }));
    decision.withStatus(status).forEach(function (d) {
      if (have.has(d.key)) return;
      if (brief.changes.some(function (c) { return U.norm(c.key) === d.key; })) return;
      out.push(synth(d.key));
    });
    return out;
  }
  const openItems = function () { return itemsFor('todo').concat(itemsFor('doing')).sort(function (a, z) { return (a.rank || 999) - (z.rank || 999); }); };
  const counts = function () {
    const o = { todo: 0, doing: 0, done: 0, dismissed: 0 };
    Object.keys(o).forEach(function (k) { o[k] = itemsFor(k).length; });
    o.open = o.todo + o.doing;
    o.doneAll = o.done + (state.brief ? (state.brief.roi.updates || []).length : 0);
    return o;
  };
  /** Save a change to a gap's status / owner / due date / notes / go-live date. */
  function decide(c, patch) {
    const a = decision.put(c, patch);
    emit('decisions', { key: c.key, decision: a });
    return a;
  }
  /** Did a fix marked Done work? */
  function trackFor(c) {
    const a = decision.get(c.key);
    const liveMs = U.isoToMs(a.liveOn);
    return IM.track(state.brief.records, c.theme, liveMs, state.brief.cfg.minutesPerTicket);
  }
  function doneItems() {
    return itemsFor('done').map(function (c) {
      const a = decision.get(c.key);
      const liveMs = U.isoToMs(a.liveOn);
      return { key: c.key, c: c, a: a, title: c.theme, liveMs: liveMs, tr: IM.track(state.brief.records, c.theme, liveMs, state.brief.cfg.minutesPerTicket) };
    });
  }

  /**
   * Proof that fixes worked: manual updates detected in the file, plus gaps the team marked Done.
   * Row: { title, live (ms), before, after (tickets a week), ready, answered, hours, src, detected, cutPct, key? }
   */
  function results() {
    const b = state.brief;
    if (!b) return { rows: [], hours: 0 };
    const rows = [];
    (b.roi.updates || []).forEach(function (u) {
      const has = u.ticketsBeforePerWeek != null && u.ticketsAfterPerWeek != null;
      rows.push({ title: u.title, live: u.publishedAt, before: u.ticketsBeforePerWeek, after: u.ticketsAfterPerWeek, ready: u.ticketsAfterPerWeek != null,
        answered: u.answersSince, hours: u.hoursSaved, src: 'Detected in your questions file', detected: true, weeklyUse: u.weeklyUse, rateBefore: u.rateBefore, rateAfter: u.rateAfter,
        cutPct: has && u.ticketsBeforePerWeek > 0 ? Math.max(0, Math.round((1 - u.ticketsAfterPerWeek / u.ticketsBeforePerWeek) * 100)) : null });
    });
    doneItems().forEach(function (d) {
      rows.push({ title: d.title, live: d.liveMs, before: d.tr.beforePerWeek, after: d.tr.ready ? d.tr.afterPerWeek : null, ready: d.tr.ready, answered: null,
        hours: d.tr.ready ? d.tr.hours : 0, src: 'Marked done by your team', detected: false, key: d.key, cutPct: d.tr.ready ? d.tr.cutPct : null });
    });
    rows.sort(function (a, z) { return z.live - a.live; });
    return { rows: rows, hours: rows.reduce(function (a, r) { return a + (r.hours || 0); }, 0) };
  }

  /** Things about the file that make the numbers less reliable: [[headline, what it means], ...]. */
  function dataChecks() {
    const b = state.brief;
    if (!b) return [];
    const out = [];
    const recs = b.records || [];
    const has = function (f) { return recs.some(function (q) { return q[f]; }); };
    const months = b.series.length;
    if (b.b.total < 20) out.push(['Very few questions in ' + b.range.name + ' (' + b.b.total + ').', 'Percentages can swing a lot from one month to the next, so do not read much into the change.']);
    if (!b.pb) out.push(['There is little or no data for ' + b.prevRange.name + '.', 'The “from last month” comparisons are missing.']);
    else if (months < 3) out.push(['Only ' + months + ' months of history.', 'The trend line and the estimates are rough. Three or more months is better.']);
    if (b.b.total >= 20 && !recs.some(function (q) { return q.theme && q.theme !== String(q.normalized_text || '').slice(0, 120); })) out.push(['The file has no topic (“theme”) column.', 'Similar questions are grouped by exact wording, so the same gap can show up as several small ones and rank too low.']);
    if (b.b.tickets >= 10 && b.b.counts['no-match'] === b.b.tickets) out.push(['No “reason it went to a person” was given.', 'Every ticket counts as a gap in the manual, including personal or approval questions, so the answer rate looks worse than it is and the list is padded.']);
    if (!has('section_published_at') && !b.roi.count) out.push(['No manual-update dates in the file.', 'Past updates cannot be detected. Results will only show fixes you mark Done yourself.']);
    if (!has('resolution_note')) out.push(['No notes on how tickets were resolved.', '“Wording to start from” will be empty.']);
    if (b.roi.count && !b.fixFactor.fromHistory) out.push(['Too few past updates to learn from.', 'The “fewer a month” estimates use a typical figure (about ' + Math.round(b.fixFactor.factor * 100) + '%) instead of your own results.']);
    else if (b.roi.count && b.fixFactor.n < 3) out.push(['Estimates rest on only ' + b.fixFactor.n + ' past update' + (b.fixFactor.n === 1 ? '' : 's') + '.', 'Treat the “fewer a month” figures as rough.']);
    return out;
  }

  /** Per-section health for the month (cited, answered, unclear share, flag: clarify | unused | ''). */
  function sections() {
    const b = state.brief;
    if (!b) return [];
    const A = Q.analytics;
    const range = b.range;
    const cur = b.records.filter(function (q) { const t = Date.parse(q.submitted_at); return t >= range.start.getTime() && t < range.end.getTime(); });
    const pr = b.prevRange;
    const prev = b.records.filter(function (q) { const t = Date.parse(q.submitted_at); return t >= pr.start.getTime() && t < pr.end.getTime(); });
    return A.sectionStats(cur, prev, state.sections);
  }

  // ---------- exports ----------

  function csvText() {
    const b = state.brief;
    const rows = b.changes.map(function (c) {
      const a = decision.get(c.key);
      return { rank: c.rank, fix: c.theme, type: typeWords(c), category: c.category, tickets: c.tickets, example_question: c.example, wording_to_start_from: c.notes.length ? c.notes[0].text : '', estimated_fewer_per_month: c.more, status: Q.statusLabel(a.status), owner: a.owner, due: a.due, went_live: a.liveOn, notes: a.notes };
    });
    return D.toCSV(rows, ['rank', 'fix', 'type', 'category', 'tickets', 'example_question', 'wording_to_start_from', 'estimated_fewer_per_month', 'status', 'owner', 'due', 'went_live', 'notes']);
  }
  /** A plain-text reminder that stands on its own: the people reading it do not have the tool. */
  function reminderText() {
    const brief = state.brief;
    const open = openItems();
    const cut = function (t, n) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };
    const lines = ['Hello,', '', 'These are the changes still to make to the operating manual (' + brief.range.label + '), biggest first. Each one is a topic employees keep asking the chatbot about that the manual does not answer well, so the question ends up as a ticket for a person.', ''];
    if (!open.length) lines.push('Nothing is open right now. Every gap has been done or dismissed.');
    const max = 10;
    open.slice(0, max).forEach(function (c, i) {
      const a = decision.get(c.key);
      lines.push((i + 1) + '. ' + typeWords(c).toUpperCase() + ': ' + c.theme);
      lines.push('   Why it matters: ' + c.tickets + ' tickets over ' + brief.window.label + '. For example, employees ask “' + cut(c.example, 90) + '”');
      if (c.notes.length) lines.push('   Wording to start from: ' + cut(c.notes[0].text, 320) + ' (staff gave this answer ' + c.notes[0].count + ' times)');
      lines.push('   Status: ' + Q.statusLabel(a.status) + '  ·  ' + (a.owner ? 'Owner: ' + a.owner : 'No owner yet') + (a.due ? '  ·  Due ' + a.due : ''));
      lines.push('');
    });
    if (open.length > max) lines.push('…and ' + (open.length - max) + ' more in the attached spreadsheet.', '');
    lines.push('The full list, with all details, is attached as a spreadsheet.', '', 'Best regards,', brief.cfg.preparedBy || brief.cfg.org);
    return lines.join('\n');
  }
  function downloadCsv() {
    const b = state.brief;
    U.download(new Blob([csvText()], { type: 'text/csv;charset=utf-8' }), 'Fix-list-' + b.range.ym + '.csv');
    U.toast('Saved the fix list as a spreadsheet (CSV).');
  }

  function pptxBytes() {
    if (state.pptx) return Promise.resolve(state.pptx);
    return Promise.resolve().then(function () {
      if (typeof window.PptxGenJS !== 'function') throw new Error('The PowerPoint writer did not load.');
      const b = state.brief;
      return Q.renderPptx.toPptx(window.PptxGenJS, state.deck, { title: state.deck.name + ', ' + b.range.label, author: b.cfg.preparedBy || b.cfg.org, company: b.cfg.org }).write({ outputType: 'uint8array' });
    }).then(function (bytes) { state.pptx = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); return state.pptx; });
  }
  function downloadDeck() {
    return pptxBytes().then(function (bytes) {
      U.download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), state.deck.fileBase + '.pptx');
      U.toast('Saved the progress deck (PowerPoint).');
    }).catch(function (e) { U.toast('Could not make the deck: ' + e.message, true); });
  }
  /** The leadership deck drawn as HTML: 1280 x 720 boxes, one per slide (class "slide", children "sh"/"tx"). */
  function deckHtml() { return state.deck ? Q.renderHtml.toHtml(state.deck) : ''; }

  // ---------- backup ----------

  const BACKUP_KEYS = { decisions: 'manual-improvement-assignments-v1', updates: 'manual-gap-updates-v1', settings: SETTINGS_KEY };
  function backup() {
    const out = { version: 2, savedAt: new Date().toISOString() };
    Object.keys(BACKUP_KEYS).forEach(function (k) { try { out[k] = JSON.parse(localStorage.getItem(BACKUP_KEYS[k])); } catch (e) { out[k] = null; } });
    U.download(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), 'Manual-Gap-Tracker-backup-' + U.todayIso() + '.json');
    U.toast('Backup saved to your Downloads folder.');
  }
  function restore(file) {
    return file.text().then(function (text) {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.decisions || typeof data.decisions !== 'object') throw new Error('not a backup');
      const n = decision.importFile(JSON.stringify({ assignments: data.decisions }));
      if (data.updates && typeof data.updates === 'object') localStorage.setItem(BACKUP_KEYS.updates, JSON.stringify(data.updates));
      if (data.settings && typeof data.settings === 'object') localStorage.setItem(BACKUP_KEYS.settings, JSON.stringify(data.settings));
      U.toast('Restored ' + U.plural(n, 'decision') + ' and your settings. Reloading…');
      setTimeout(function () { location.reload(); }, 900);
    }).catch(function () { U.toast('That is not a backup saved from this tool.', true); });
  }

  // ---------- scheduled updates (deck + fix list by email) ----------
  // This page cannot send email by itself. "Send now" saves an email draft (.eml) with the files attached.
  // When an update is due, the page says so the next time it is opened.

  const UPD_KEY = 'manual-gap-updates-v1';
  const FREQ = [
    { v: '1', label: 'Every month' }, { v: '2', label: 'Every 2 months' }, { v: '3', label: 'Quarterly (every 3 months)' },
    { v: '4', label: 'Every 4 months' }, { v: '6', label: 'Every 6 months' }, { v: '12', label: 'Once a year' }, { v: 'custom', label: 'Custom…' }
  ];
  const KINDS = {
    deck: { title: 'Progress deck', blurb: 'A slide deck: is the bot answering more on its own, and did the fixes work?', file: 'PowerPoint deck attached' },
    list: { title: 'Manual update list', blurb: 'A reminder of what is still to add or clarify in the manual, with owners and due dates.', file: 'Fix list spreadsheet attached' }
  };
  const fresh = function () { return { on: false, freq: '3', custom: 3, emails: '', startedOn: U.todayIso(), lastSent: '' }; };
  let ucfg = { deck: fresh(), list: fresh() };
  try { const s = JSON.parse(localStorage.getItem(UPD_KEY)); if (s) ucfg = { deck: Object.assign(fresh(), s.deck), list: Object.assign(fresh(), s.list) }; } catch (e) { /* ignore */ }
  const usave = function () { try { localStorage.setItem(UPD_KEY, JSON.stringify(ucfg)); } catch (e) { /* ignore */ } emit('updates', null); };

  const umonths = function (c) { return c.freq === 'custom' ? Math.min(24, Math.max(1, Math.round(Number(c.custom) || 1))) : Number(c.freq); };
  const parseIso = function (iso) { const t = U.isoToMs(iso); return t ? new Date(t) : new Date(); };
  function nextDueDate(c) {
    const d = parseIso(c.lastSent || c.startedOn);
    const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + umonths(c));
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d;
  }
  const emailsOf = function (c) { return Q.email.addresses(c.emails).split(', ').filter(Boolean); };
  const badTokens = function (c) { return String(c.emails || '').split(/[,;\s]+/).filter(Boolean).filter(function (t) { return emailsOf({ emails: t }).length === 0; }); };
  const isDue = function (c) { return c.on && emailsOf(c).length > 0 && nextDueDate(c).getTime() <= Date.now(); };

  const updates = {
    FREQ: FREQ,
    KINDS: KINDS,
    /** Read-only view of one schedule, with helpers filled in. */
    get: function (kind) {
      const c = ucfg[kind];
      return Object.assign({}, c, {
        kind: kind, title: KINDS[kind].title, blurb: KINDS[kind].blurb, file: KINDS[kind].file,
        valid: emailsOf(c), bad: badTokens(c), due: isDue(c),
        nextDue: nextDueDate(c).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        rhythm: FREQ.filter(function (f) { return f.v === c.freq; })[0].label
      });
    },
    /** patch fields: on (bool), freq ('1'..'12' | 'custom'), custom (months), emails (text). */
    set: function (kind, patch) {
      const c = ucfg[kind];
      Object.assign(c, patch);
      if (patch.on && !c.lastSent) c.startedOn = U.todayIso();
      if (c.freq === 'custom') c.custom = Math.min(24, Math.max(1, Math.round(Number(c.custom) || 1)));
      usave();
    },
    due: function () { return ['deck', 'list'].filter(function (k) { return isDue(ucfg[k]); }); },
    titleOf: function (k) { return KINDS[k].title; },
    /** Saves an email draft (.eml) with the attachment. Resolves true when the draft was made. */
    send: function (kind) {
      const c = ucfg[kind];
      const to = emailsOf(c);
      if (!to.length) { U.toast('Add at least one email address first.', true); return Promise.resolve(false); }
      const b = state.brief;
      let made;
      if (kind === 'deck') {
        const d = state.deck;
        made = pptxBytes().then(function (bytes) { return Q.email.buildEml({ to: c.emails, subject: d.email.subject, body: d.email.body, filename: d.fileBase + '.pptx', bytes: bytes }); });
      } else {
        made = Promise.resolve(Q.email.buildEml({ to: c.emails, subject: 'Manual updates still to make: ' + b.range.label, body: reminderText(), filename: 'Fix-list-' + b.range.ym + '.csv', bytes: new TextEncoder().encode(csvText()), mime: 'text/csv' }));
      }
      return made.then(function (eml) {
        U.download(new Blob([eml], { type: 'message/rfc822' }), (kind === 'deck' ? 'Progress-deck' : 'Manual-update-list') + '-email.eml');
        c.lastSent = U.todayIso(); usave();
        U.toast('Saved an email draft to ' + U.plural(to.length, 'person', 'people') + '. Open it from Downloads and press Send.');
        return true;
      }).catch(function (e) { U.toast('Could not make the email: ' + e.message, true); return false; });
    }
  };

  // ---------- go ----------

  /** Call once after your screens are listening. Restores the last file this browser kept. */
  function init() {
    document.documentElement.style.setProperty('--brand', settingsGet().brand || '#1473e6');
    if (window.GAP_EMBEDDED) return Promise.resolve(false);
    return restoreSaved();
  }

  Q.svc = {
    on: on, state: state, init: init,
    settings: { get: settingsGet, set: settingsSet, team: teamList, people: people },
    loadFile: loadFile, loadSample: loadSample, loadRows: loadRows, forgetSaved: forgetSaved, setMonth: setMonth,
    find: find, itemsFor: itemsFor, openItems: openItems, counts: counts, decide: decide, trackFor: trackFor, doneItems: doneItems,
    results: results, dataChecks: dataChecks, sections: sections, severity: severity, typeWords: typeWords, verb: verb,
    csvText: csvText, downloadCsv: downloadCsv, downloadDeck: downloadDeck, deckHtml: deckHtml, pptxBytes: pptxBytes,
    backup: backup, restore: restore, updates: updates
  };
})();
