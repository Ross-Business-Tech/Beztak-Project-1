/*
 * The Briefing Maker page: load a questions file, pick a month, then either
 *   - preview and send the executive deck (PowerPoint, PDF, email draft), or
 *   - work in the Manual Improvement Dashboard.
 * Nothing is uploaded anywhere. The file is read in this browser tab, and the last file
 * is kept on this computer (in the browser's storage) so the dashboard is there next time.
 */
(function () {
  'use strict';
  const Q = window.QAD;
  const D = Q.data;
  const B = Q.briefing;
  const SETTINGS_KEY = 'monthly-board-briefing-settings-v1';
  const FIELDS = ['org', 'preparedBy', 'goal', 'minutesPerTicket', 'brand', 'recipients', 'team', 'note'];

  const $ = function (id) { return document.getElementById(id); };
  const state = { records: [], sections: [], ym: null, deck: null, brief: null, pptx: null, tab: 'deck' };
  let dash = null;

  // ---------- settings (remembered on this computer) ----------

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { /* ignore */ }
    return Object.assign({}, B.DEFAULTS, saved);
  }
  function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function readSettings() {
    const s = {};
    FIELDS.forEach(function (f) { s[f] = $(f).value; });
    s.goal = Math.min(100, Math.max(1, Number(s.goal) || B.DEFAULTS.goal));
    s.minutesPerTicket = Math.min(600, Math.max(1, Number(s.minutesPerTicket) || B.DEFAULTS.minutesPerTicket));
    s.org = (s.org || '').trim() || B.DEFAULTS.org;
    return s;
  }
  function fillSettings(s) { FIELDS.forEach(function (f) { $(f).value = s[f] == null ? '' : s[f]; }); }
  const teamList = function () { return String($('team').value || '').split(/[,;\n]+/).map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 40); };

  // ---------- keeping the last file on this computer ----------

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
  const keepFile = function (rec) { return idb('readwrite', function (s) { return s.put(rec, IDB.key); }).catch(function () { /* storage blocked: fine */ }); };
  const savedFile = function () { return idb('readonly', function (s) { return s.get(IDB.key); }).catch(function () { return null; }); };
  const forgetFile = function () { return idb('readwrite', function (s) { return s.delete(IDB.key); }).catch(function () { /* ignore */ }); };

  // ---------- loading a file ----------

  function setStatus(text, kind) { const el = $('status'); el.textContent = text; el.className = 'status' + (kind ? ' ' + kind : ''); }
  const nf = function (n) { return Number(n).toLocaleString('en-US'); };

  function accept(result, label, sections, opts) {
    if (!result.accepted.length) {
      setStatus('No usable questions were found in ' + label + '. ' + (result.rejected[0] ? 'First problem: row ' + result.rejected[0].row + ': ' + result.rejected[0].errors[0] : ''), 'err');
      return false;
    }
    state.records = result.accepted;
    state.sections = sections || [];
    const months = B.availableMonths(state.records);
    const first = months[0];
    const last = months[months.length - 1];
    let msg = nf(state.records.length) + ' questions' + (opts && opts.restored ? ' restored from the last time (' : ' loaded from ') + label + (opts && opts.restored ? ')' : '') + ', ' + first.label + ' to ' + last.label + '.';
    if (result.rejected.length) msg += ' ' + nf(result.rejected.length) + ' rows were skipped (for example row ' + result.rejected[0].row + ': ' + result.rejected[0].errors[0] + ').';
    if (result.duplicates.length) msg += ' ' + nf(result.duplicates.length) + ' repeated question IDs were ignored.';
    setStatus(msg, result.rejected.length ? '' : 'ok');
    fillMonths(months);
    $('forget-wrap').hidden = !(opts && (opts.keep || opts.restored));
    refresh();
    $('setup').open = false;
    return true;
  }

  function fillMonths(months) {
    const sel = $('month');
    sel.innerHTML = '';
    months.slice().reverse().forEach(function (m) {
      const o = document.createElement('option');
      o.value = m.ym;
      o.textContent = m.label + ' (' + nf(m.count) + ' questions)' + (m.complete ? '' : ', incomplete');
      sel.appendChild(o);
    });
    sel.disabled = false;
    state.ym = B.defaultMonth(state.records) || months[months.length - 1].ym;
    sel.value = state.ym;
  }

  function parseText(text, name) {
    const parsed = /\.json$/i.test(name) ? D.parseJSONImport(text) : D.parseCSV(text);
    if (parsed.error) return { error: parsed.error };
    return { result: D.prepareImport(parsed.records, { categories: D.OPS_CATEGORIES, now: new Date(), existingIds: new Set() }) };
  }

  function handleFile(file) {
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) { setStatus('That file is larger than 60 MB. Export a shorter period.', 'err'); return; }
    file.text().then(function (text) {
      const p = parseText(text, file.name);
      if (p.error) { setStatus(p.error, 'err'); return; }
      if (accept(p.result, file.name, [], { keep: true })) keepFile({ name: file.name, text: text, at: Date.now() });
    }).catch(function () { setStatus('That file could not be read.', 'err'); });
  }

  function loadSample() {
    // Made-up questions through 31 Oct 2026. A far-future "now" keeps them valid on any computer clock.
    const sample = D.generateOpsSample(new Date(2026, 9, 31, 23, 59), 20261031, 215);
    const result = D.prepareImport(sample.rows, { categories: D.OPS_CATEGORIES, now: new Date(2099, 0, 1), existingIds: new Set() });
    accept(result, 'the sample data', sample.sections);
  }

  // ---------- building the briefing ----------

  let timer = null;
  function refreshSoon() { clearTimeout(timer); timer = setTimeout(refresh, 200); }

  function refresh() {
    const settings = readSettings();
    saveSettings(settings);
    document.documentElement.style.setProperty('--brand', settings.brand || '#1473e6');
    if (!state.records.length) return;
    state.ym = $('month').value || state.ym;
    state.pptx = null;
    try {
      state.brief = B.build(state.records, state.ym, settings, state.sections);
      state.deck = Q.slides.build(state.brief);
    } catch (e) {
      setStatus('Could not build the briefing: ' + e.message, 'err');
      return;
    }
    $('empty').hidden = true;
    $('tabs').hidden = false;
    $('tab-dash-n').textContent = state.brief.changes.length + ' changes';
    $('setup-sum').textContent = state.brief.range.label + '  ·  ' + nf(state.brief.b.total) + ' questions  ·  goal ' + state.brief.goal + '%  ·  click to change';
    warnings();
    if (!dash) dash = Q.dashboard.create($('dash-root'), { team: teamList });
    dash.update(state.brief);
    showTab(state.tab);
  }

  function warnings() {
    const el = $('warnings');
    const list = state.brief.warnings.slice();
    el.hidden = !list.length;
    el.replaceChildren.apply(el, list.map(function (w) { const p = document.createElement('p'); p.textContent = w; return p; }));
  }

  // ---------- the two views ----------

  function showTab(which) {
    state.tab = which;
    ['deck', 'dash'].forEach(function (k) {
      $('tab-' + k).setAttribute('aria-selected', String(which === k));
      $('tab-' + k).classList.toggle('on', which === k);
      $('view-' + k).hidden = which !== k;
    });
    if (which === 'deck') renderDeck();
    else dash.render();
  }

  function fit() {
    document.querySelectorAll('.frame').forEach(function (f) {
      const k = f.clientWidth / 1280;
      f.style.height = (720 * k) + 'px';
      f.firstElementChild.style.transform = 'scale(' + k + ')';
    });
  }

  function renderDeck() {
    if (!state.deck) return;
    $('slides').innerHTML = state.deck.slides.map(function (sl, i) { return '<div class="slot"><div class="frame">' + Q.renderHtml.slideHtml(sl, i) + '</div></div>'; }).join('');
    fit();
    $('email-subject').textContent = state.deck.email.subject;
    $('email-body').textContent = state.deck.email.body;
    document.title = state.deck.fileBase;
  }

  // ---------- outputs for the deck ----------

  function msg(text, bad) { const el = $('action-msg'); el.textContent = text; el.className = 'msg' + (bad ? ' err' : ''); }
  function busy(on) { ['dl-pptx', 'dl-pdf', 'dl-eml', 'copy-email'].forEach(function (id) { $(id).disabled = on; }); }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function pptxBytes() {
    if (state.pptx) return Promise.resolve(state.pptx);
    return Promise.resolve().then(function () {
      if (typeof window.PptxGenJS !== 'function') throw new Error('The PowerPoint writer did not load.');
      const b = state.brief;
      return Q.renderPptx.toPptx(window.PptxGenJS, state.deck, { title: state.deck.name + ', ' + b.range.label, author: b.cfg.preparedBy || b.cfg.org, company: b.cfg.org }).write({ outputType: 'uint8array' });
    }).then(function (bytes) { state.pptx = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); return state.pptx; });
  }

  const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

  function onPptx() {
    busy(true); msg('Making the PowerPoint…');
    pptxBytes().then(function (bytes) {
      download(new Blob([bytes], { type: PPTX_MIME }), state.deck.fileBase + '.pptx');
      msg('Saved ' + state.deck.fileBase + '.pptx to your Downloads folder.');
    }).catch(function (e) { msg('Could not make the PowerPoint: ' + e.message, true); }).then(function () { busy(false); });
  }

  function onEml() {
    busy(true); msg('Making the email draft…');
    pptxBytes().then(function (bytes) {
      const d = state.deck;
      const eml = Q.email.buildEml({ to: state.brief.cfg.recipients, subject: d.email.subject, body: d.email.body, filename: d.fileBase + '.pptx', bytes: bytes });
      download(new Blob([eml], { type: 'message/rfc822' }), d.fileBase + '-email.eml');
      msg('Saved the email draft. Open it from your Downloads folder and the deck is already attached.');
    }).catch(function (e) { msg('Could not make the email draft: ' + e.message, true); }).then(function () { busy(false); });
  }

  function onPdf() {
    msg('In the print window, choose "Save as PDF" as the destination.');
    $('email-box').hidden = true;
    setTimeout(function () { window.print(); }, 60);
  }

  function onCopy() {
    $('email-box').hidden = false;
    const text = 'Subject: ' + state.deck.email.subject + '\n\n' + state.deck.email.body;
    const done = function () { msg('Email text copied. It is also shown below.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { msg('It is shown below. Select it and copy.'); });
    else msg('It is shown below. Select it and copy.');
  }

  // ---------- wiring ----------

  function init() {
    fillSettings(loadSettings());
    document.documentElement.style.setProperty('--brand', $('brand').value || '#1473e6');
    FIELDS.forEach(function (f) { $(f).addEventListener('input', refreshSoon); });
    $('month').addEventListener('change', refresh);
    $('file').addEventListener('change', function (e) { handleFile(e.target.files[0]); e.target.value = ''; });
    $('sample').addEventListener('click', function () { forgetFile(); loadSample(); });
    $('forget').addEventListener('click', function () {
      forgetFile().then(function () { $('forget-wrap').hidden = true; setStatus('Forgot the saved file. Your decisions in the dashboard are kept.', ''); });
    });
    $('tab-deck').addEventListener('click', function () { if (state.brief) showTab('deck'); });
    $('tab-dash').addEventListener('click', function () { if (state.brief) showTab('dash'); });
    $('dl-pptx').addEventListener('click', onPptx);
    $('dl-pdf').addEventListener('click', onPdf);
    $('dl-eml').addEventListener('click', onEml);
    $('copy-email').addEventListener('click', onCopy);
    const drop = $('drop');
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { handleFile(e.dataTransfer.files[0]); });
    window.addEventListener('resize', fit);
    window.addEventListener('beforeprint', function () { document.querySelectorAll('.slide').forEach(function (s) { s.style.transform = 'none'; }); });
    window.addEventListener('afterprint', fit);

    // Pick up where we left off: the last file, if this computer kept it.
    savedFile().then(function (rec) {
      if (!rec || !rec.text) return;
      const p = parseText(rec.text, rec.name);
      if (p.result) accept(p.result, rec.name, [], { restored: true });
    });
  }

  init();
})();
