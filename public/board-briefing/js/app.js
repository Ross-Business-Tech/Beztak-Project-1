/*
 * The Briefing Maker page: load a questions file, pick a month, preview the slides,
 * then download the PowerPoint, save a PDF, or get an email draft.
 * Nothing is uploaded anywhere; the file is read and processed in this browser tab.
 */
(function () {
  'use strict';
  const Q = window.QAD;
  const D = Q.data;
  const B = Q.briefing;
  const SETTINGS_KEY = 'monthly-board-briefing-settings-v1';
  const FIELDS = ['org', 'preparedBy', 'goal', 'minutesPerTicket', 'brand', 'recipients', 'note'];

  const $ = function (id) { return document.getElementById(id); };
  const state = { records: [], sections: [], ym: null, deck: null, brief: null, pptxBytes: null };

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

  // ---------- loading a file ----------

  function setStatus(text, kind) { const el = $('status'); el.textContent = text; el.className = 'status' + (kind ? ' ' + kind : ''); }
  const nf = function (n) { return Number(n).toLocaleString('en-US'); };

  function accept(result, label, sections) {
    if (!result.accepted.length) {
      setStatus('No usable questions were found in ' + label + '. ' + (result.rejected[0] ? 'First problem: row ' + result.rejected[0].row + ': ' + result.rejected[0].errors[0] : ''), 'err');
      return;
    }
    state.records = result.accepted;
    state.sections = sections || [];
    const months = B.availableMonths(state.records);
    const first = months[0];
    const last = months[months.length - 1];
    let msg = nf(state.records.length) + ' questions loaded from ' + label + ' (' + first.label + ' to ' + last.label + ').';
    if (result.rejected.length) msg += ' ' + nf(result.rejected.length) + ' rows were skipped (for example row ' + result.rejected[0].row + ': ' + result.rejected[0].errors[0] + ').';
    if (result.duplicates.length) msg += ' ' + nf(result.duplicates.length) + ' repeated question IDs were ignored.';
    setStatus(msg, result.rejected.length ? '' : 'ok');
    fillMonths(months);
    refresh();
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

  function handleFile(file) {
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) { setStatus('That file is larger than 60 MB. Export a shorter period.', 'err'); return; }
    file.text().then(function (text) {
      const parsed = /\.json$/i.test(file.name) ? D.parseJSONImport(text) : D.parseCSV(text);
      if (parsed.error) { setStatus(parsed.error, 'err'); return; }
      const result = D.prepareImport(parsed.records, { categories: D.OPS_CATEGORIES, now: new Date(), existingIds: new Set() });
      accept(result, file.name);
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
    document.documentElement.style.setProperty('--brand', settings.brand || '#0f766e');
    if (!state.records.length) return;
    state.ym = $('month').value || state.ym;
    state.pptxBytes = null;
    try {
      state.brief = B.build(state.records, state.ym, settings, state.sections);
      state.deck = Q.slides.build(state.brief);
    } catch (e) {
      setStatus('Could not build the briefing: ' + e.message, 'err');
      return;
    }
    render();
  }

  function warnings() {
    const el = $('warnings');
    const list = state.brief.warnings.slice();
    el.hidden = !list.length;
    el.innerHTML = list.map(function (w) { const p = document.createElement('p'); p.textContent = w; return p.outerHTML; }).join('');
  }

  function fit() {
    document.querySelectorAll('.frame').forEach(function (f) {
      const k = f.clientWidth / 1280;
      f.style.height = (720 * k) + 'px';
      f.firstElementChild.style.transform = 'scale(' + k + ')';
    });
  }

  function render() {
    $('empty').hidden = true;
    $('result').hidden = false;
    warnings();
    let seenHidden = false;
    const html = state.deck.slides.map(function (sl, i) {
      let head = '';
      if (sl.hidden && !seenHidden) {
        seenHidden = true;
        head = '<div class="appendix-head no-print"><h2>Appendix: hidden slides</h2><p>These stay out of the slide show but travel inside the PowerPoint file. They hold the questions behind each category and a working table for deciding, assigning and tracking the changes. In PowerPoint, right-click a slide and choose Hide Slide to show or hide it.</p></div>';
      }
      return head + '<div class="slot' + (sl.hidden ? ' is-hidden' : '') + '">' + (sl.hidden ? '<p class="slot-tag no-print">Hidden slide</p>' : '') + '<div class="frame">' + Q.renderHtml.slideHtml(sl, i) + '</div></div>';
    }).join('');
    $('slides').innerHTML = html;
    $('pdf-opt').hidden = !seenHidden;
    fit();
    $('email-subject').textContent = state.deck.email.subject;
    $('email-body').textContent = state.deck.email.body;
    document.title = state.deck.fileBase;
  }

  // ---------- outputs ----------

  function msg(text, bad) { const el = $('action-msg'); el.textContent = text; el.className = 'msg' + (bad ? ' err' : ''); }
  function busy(on) { ['dl-pptx', 'dl-pdf', 'dl-eml', 'copy-email'].forEach(function (id) { $(id).disabled = on; }); }

  function makePptx() {
    if (typeof window.PptxGenJS !== 'function') return Promise.reject(new Error('The PowerPoint writer did not load.'));
    const b = state.brief;
    const pres = Q.renderPptx.toPptx(window.PptxGenJS, state.deck, { title: 'Operating manual briefing, ' + b.range.label, author: b.cfg.preparedBy || b.cfg.org, company: b.cfg.org });
    return pres;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function pptxBytes() {
    if (state.pptxBytes) return Promise.resolve(state.pptxBytes);
    return makePptx().write({ outputType: 'uint8array' }).then(function (bytes) {
      state.pptxBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return state.pptxBytes;
    });
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
    const s = state.brief.cfg;
    pptxBytes().then(function (bytes) {
      const eml = Q.email.buildEml({ to: s.recipients, subject: state.deck.email.subject, body: state.deck.email.body, filename: state.deck.fileBase + '.pptx', bytes: bytes });
      download(new Blob([eml], { type: 'message/rfc822' }), state.deck.fileBase + '-email.eml');
      msg('Saved the email draft. Open it from your Downloads folder and the deck is already attached.');
    }).catch(function (e) { msg('Could not make the email draft: ' + e.message, true); }).then(function () { busy(false); });
  }

  function onPdf() {
    document.body.classList.toggle('with-appendix', $('pdf-appendix').checked);
    msg('In the print window, choose "Save as PDF" as the destination.');
    $('email-box').hidden = true;
    setTimeout(function () { window.print(); }, 60);
  }

  function onCopy() {
    const box = $('email-box');
    box.hidden = false;
    const text = 'Subject: ' + state.deck.email.subject + '\n\n' + state.deck.email.body;
    const done = function () { msg('Email text copied. It is also shown below.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { msg('It is shown below. Select it and copy.'); });
    else msg('It is shown below. Select it and copy.');
  }

  // ---------- wiring ----------

  function init() {
    fillSettings(loadSettings());
    document.documentElement.style.setProperty('--brand', $('brand').value || '#0f766e');
    FIELDS.forEach(function (f) { $(f).addEventListener('input', refreshSoon); });
    $('month').addEventListener('change', refresh);
    $('file').addEventListener('change', function (e) { handleFile(e.target.files[0]); e.target.value = ''; });
    $('sample').addEventListener('click', loadSample);
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
  }

  init();
})();
