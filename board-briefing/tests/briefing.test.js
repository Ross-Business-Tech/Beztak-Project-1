// Run with:  node --test board-briefing/tests
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require(path.join(__dirname, '..', 'js', 'engine', 'data.js'));
const B = require(path.join(__dirname, '..', 'js', 'briefing.js'));
const IM = require(path.join(__dirname, '..', 'js', 'improve.js'));
const S = require(path.join(__dirname, '..', 'js', 'slides.js'));
const H = require(path.join(__dirname, '..', 'js', 'render-html.js'));
const E = require(path.join(__dirname, '..', 'js', 'email.js'));

const NOW = new Date(2099, 0, 1);
let seq = 0;

// One question record. Dates are local noon on the given day, so month edges behave the same in any time zone.
function q(y, m, d, over) {
  seq++;
  return Object.assign({
    question_id: 'T-' + seq, question_text: 'Question number ' + seq,
    submitted_at: new Date(y, m - 1, d, 12).toISOString(), source_system: 'Test',
    resolution_status: 'Answered', category: 'Safety & Compliance', theme: 'Topic A',
    manual_section: 'Section A', answer_source: 'Section A'
  }, over);
}
const ticket = function (y, m, d, over) {
  return q(y, m, d, Object.assign({ resolution_status: 'Ticket Closed', escalation_reason: 'no-match', manual_section: '', answer_source: '', theme: 'Gap topic', resolution_note: 'Do the thing.' }, over));
};
function records(raws) {
  const res = D.prepareImport(raws, { categories: D.OPS_CATEGORIES, now: NOW, existingIds: new Set() });
  assert.equal(res.rejected.length, 0, JSON.stringify(res.rejected[0]));
  return res.accepted;
}
function many(n, fn) { const out = []; for (let i = 0; i < n; i++) out.push(fn(i)); return out; }

// Aug: 40 questions, 20 answered. Sep: 40, 30 answered. Oct: 40, 24 answered.
// In each month the tickets alternate: a gap in the manual (odd), then a question that goes to a person by policy (even).
// So October: 24 answered, 8 gaps, 8 by policy -> fair rate 24 / 32 = 75%, strict rate 60%.
function fixture() {
  const raws = [];
  [[8, 20], [9, 30], [10, 24]].forEach(function (mo) {
    const month = mo[0];
    for (let i = 0; i < 40; i++) {
      const day = 1 + (i % 28);
      raws.push(i < mo[1] ? q(2026, month, day) : ticket(2026, month, day, { escalation_reason: i % 2 ? 'no-match' : 'policy', theme: i % 2 ? 'Gap topic' : 'Policy topic' }));
    }
  });
  for (let i = 0; i < 40; i++) raws.push(q(2026, 11, 1 + (i % 5)));
  return records(raws);
}
const deckFor = function (over, ym) { return S.build(B.build(fixture(), ym || '2026-10', over || {})); };
const textOf = function (deck) {
  return deck.slides.map(function (s) {
    return s.items.filter(function (it) { return it.t === 'text'; }).map(function (it) { return it.text || (it.runs || []).map(function (r) { return r.text; }).join(''); }).join(' | ') + ' || ' + s.notes;
  }).join('\n');
};

test('availableMonths flags partial months and defaultMonth picks the latest complete one', () => {
  const recs = fixture();
  const months = B.availableMonths(recs);
  assert.deepEqual(months.map((m) => m.ym), ['2026-08', '2026-09', '2026-10', '2026-11']);
  assert.equal(months[3].complete, false, 'November stops on day 5');
  assert.equal(B.defaultMonth(recs), '2026-10');
});

test('the answer rate leaves out questions that go to a person on purpose, and says how many', () => {
  const b = B.build(fixture(), '2026-10', { goal: 80, minutesPerTicket: 12 });
  assert.equal(b.b.total, 40);
  assert.equal(b.b.answered, 24);
  assert.equal(b.byDesign, 8);
  assert.equal(b.byDesignPolicy, 8);
  assert.equal(b.byDesignScope, 0);
  assert.equal(b.eligible, 32);
  assert.equal(Math.round(b.rate), 75, 'fair rate = 24 / 32');
  assert.equal(Math.round(b.strictRate), 60, 'the strict rate is kept for reference');
  assert.equal(Math.round(b.prevRate), 86, 'September on the same basis: 30 / 35');
  assert.equal(Math.round(b.vsGoal), -5);
  assert.equal(b.needForGoal, 2, '80% of 32 = 26 answered needed, 24 answered');
});

test('later months never leak into a month', () => {
  const a = B.build(fixture(), '2026-10', {});
  const without = B.build(fixture().filter((r) => !/^2026-11/.test(r.submitted_at.slice(0, 7))), '2026-10', {});
  assert.equal(a.rate, without.rate);
  assert.equal(a.changes.length, without.changes.length);
});

test('trend uses the fair rate and only full months up to the chosen one', () => {
  const b = B.build(fixture(), '2026-09', {});
  assert.deepEqual(b.series.map((s) => s.label), ['Aug', 'Sep']);
  assert.deepEqual(b.series.map((s) => Math.round(s.rate)), [67, 86]);
  assert.deepEqual(b.series.map((s) => s.total), [40, 40]);
});

test('ticket reasons add up to the tickets', () => {
  const b = B.build(fixture(), '2026-10', {});
  assert.equal(b.reasons.reduce((a, r) => a + r.count, 0), b.b.tickets);
  assert.equal(b.fixableTickets, b.reasons.filter((r) => r.fixable).reduce((a, r) => a + r.count, 0));
});

test('changes are ranked over the last three months, so one odd month does not reorder them', () => {
  const raws = [];
  for (const m of [8, 9, 10]) {
    for (let i = 0; i < 30; i++) raws.push(q(2026, m, 1 + (i % 30)));
    for (let i = 0; i < 4; i++) raws.push(ticket(2026, m, 5 + i, { theme: 'Steady gap' }));
  }
  for (let i = 0; i < 8; i++) raws.push(ticket(2026, 10, 10 + i, { theme: 'One-month spike' }));
  const b = B.build(records(raws), '2026-10', {});
  assert.equal(b.window.months, 3);
  assert.deepEqual(b.changes.map((c) => c.theme), ['Steady gap', 'One-month spike']);
  assert.equal(b.changes[0].tickets, 12);
  assert.equal(b.changes[0].perMonth, 4);
  // Judged on October alone the spike would have won.
  assert.equal(b.changes[1].tickets, 8);
});

test('each change carries every question behind it, unanswered first, plus how staff resolved them', () => {
  const b = B.build(fixture(), '2026-10', {});
  const c = b.changes[0];
  assert.equal(c.theme, 'Gap topic');
  assert.equal(c.kind, 'add');
  assert.equal(c.questions.length, c.tickets + c.answered);
  assert.ok(c.questions.every((x) => !x.answered), 'this topic is never answered');
  assert.deepEqual(c.notes.map((n) => n.text), ['Do the thing.']);
  assert.equal(c.notes[0].count, c.tickets);
  assert.ok(!b.changes.some((x) => x.theme === 'Policy topic'), 'policy topics are never listed as changes to make');
  assert.ok(c.more >= 1 && c.hours > 0);
  assert.equal(b.moreFromFixes, b.fixes.reduce((a, f) => a + f.more, 0));
  assert.ok(b.projectedRate > b.rate);
});

test('improve.build answered questions sort after the unanswered ones', () => {
  const raws = [];
  for (let i = 0; i < 4; i++) raws.push(ticket(2026, 10, 10 + i, { theme: 'Mixed' }));
  for (let i = 0; i < 3; i++) raws.push(q(2026, 10, 1 + i, { theme: 'Mixed' })); // answered earlier, so the topic is not yet fixed
  const recs = records(raws);
  const out = IM.build(recs, [], { months: 1, factor: 0.8, minutes: 12 });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].questions.map((x) => x.answered), [false, false, false, false, true, true, true]);
});

test('a manual update is credited with the questions answered after it was published', () => {
  const raws = [];
  for (let i = 0; i < 30; i++) raws.push(ticket(2026, 9, 1 + (i % 28), { theme: 'Spill', escalation_reason: 'no-match' }));
  const pub = new Date(2026, 9, 1, 9).toISOString();
  for (let i = 0; i < 30; i++) raws.push(q(2026, 10, 1 + (i % 28), { theme: 'Spill', manual_section: 'Spill response', answer_source: 'Spill response', section_published_at: pub }));
  const b = B.build(records(raws), '2026-10', { minutesPerTicket: 10 });
  assert.equal(b.roi.count, 1);
  assert.equal(b.roi.answersSince, 30);
  assert.equal(b.roi.hoursSince, 5); // 30 answers x 10 min
  assert.equal(B.build(records(raws), '2026-09', {}).roi.count, 0);
});

test('warnings: little data, and missing columns that the real export may lack', () => {
  const few = B.build(records(many(5, (i) => q(2026, 10, 1 + i))), '2026-10', {});
  assert.ok(few.warnings.length >= 1);
  assert.doesNotThrow(() => S.build(few));
  const noTheme = B.build(records(many(25, (i) => q(2026, 10, 1 + i, { theme: '' }))), '2026-10', {});
  assert.ok(noTheme.warnings.some((w) => /no "theme" column/.test(w)));
  const noReason = B.build(records(many(25, (i) => (i < 10 ? q(2026, 10, 1 + i) : ticket(2026, 10, 1 + i, { escalation_reason: '' })))), '2026-10', {});
  assert.ok(noReason.warnings.some((w) => /escalation_reason/.test(w)));
  assert.equal(B.build(fixture(), '2026-10', {}).warnings.length, 0, 'a complete file raises no warnings');
});

test('the deck: six slides, none hidden, each ends with a takeaway', () => {
  const d = deckFor({ org: 'Test Co' });
  assert.equal(d.slides.length, 6);
  assert.equal(d.visible, 6);
  assert.ok(d.slides.every((s) => !s.hidden));
  const text = textOf(d);
  assert.equal((text.match(/TAKEAWAY/g) || []).length, 5, 'every slide but the cover has a takeaway line');
  assert.match(text, /OPERATING MANUAL UPDATE/);
  assert.match(text, /WHAT PEOPLE ASKED ABOUT MOST/);
  assert.match(text, /Manual Improvement Dashboard/);
});

test('the deck explains the questions it leaves out, and never says "points"', () => {
  const d = deckFor({ goal: 80 });
  const text = textOf(d);
  assert.match(text, /go to a person on purpose, so they are left out/);
  assert.match(text, /How it is counted: 24 answered ÷ 32 the manual should cover \(40 asked − 8 that go to a person on purpose\) = 75%/);
  assert.match(text, /8 personal or approval questions and 0 outside the manual/);
  assert.ok(!/\bpoints?\b/i.test(text + d.email.subject + d.email.body), 'no "points" wording anywhere');
});

test('every slide fits on the page and has speaker notes', () => {
  const d = deckFor({ org: 'Test Co', note: 'A short note.' });
  d.slides.forEach((s, i) => {
    s.items.forEach((it) => {
      if (it.t === 'line') { [it.x1, it.x2].forEach((x) => assert.ok(x >= 0 && x <= S.W + 0.01, 'slide ' + (i + 1))); return; }
      assert.ok(it.x >= -0.01 && it.y >= -0.01 && it.x + it.w <= S.W + 0.01 && it.y + it.h <= S.H + 0.01, 'slide ' + (i + 1) + ' shape off the page: ' + JSON.stringify(it).slice(0, 120));
    });
    assert.ok(s.notes.length > 10, 'slide ' + (i + 1) + ' has speaker notes');
  });
});

test('the deck still builds with no gaps, no updates and a single month', () => {
  const recs = records(many(30, (i) => q(2026, 10, 1 + (i % 28))));
  const b = B.build(recs, '2026-10', { goal: 50 });
  assert.equal(b.fixes.length, 0);
  assert.equal(b.roi.count, 0);
  const d = S.build(b);
  assert.equal(d.slides.length, 6);
  assert.match(S.verdict(b), /100% of the questions it should cover in October, above the 50% goal/);
});

test('the preview is escaped, so text from a setting cannot inject HTML', () => {
  const d = deckFor({ org: '<b>Org</b><img src=x onerror=alert(1)>' });
  const html = H.toHtml(d);
  assert.ok(!html.includes('<b>Org</b>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;b&gt;Org&lt;/b&gt;'));
});

test('the email text names the month, the fair rate, the exclusions and the note', () => {
  const d = deckFor({ note: 'Thank you all.', preparedBy: 'Dana' });
  assert.match(d.email.subject, /update, October 2026: 75% of questions answered by the bot/);
  assert.match(d.email.body, /8 of 40 questions go to a person on purpose/);
  assert.match(d.email.body, /Thank you all\./);
  assert.match(d.email.body, /Dana$/);
});

test('email draft file is valid MIME with the attachment intact', () => {
  const bytes = new Uint8Array(Array.from({ length: 5000 }, (_, i) => i % 256));
  const eml = E.buildEml({ to: 'a@x.com; not-an-address, b@y.org', subject: 'Briefing: 60% · done', body: 'Héllo\nline two', filename: 'My deck.pptx', bytes });
  assert.match(eml, /^X-Unsent: 1\r\nTo: a@x\.com, b@y\.org\r\n/);
  assert.match(eml, /Subject: =\?UTF-8\?B\?/);
  assert.match(eml, /filename="My_deck\.pptx"/);
  const part = eml.split('Content-Disposition: attachment; filename="My_deck.pptx"\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, '');
  assert.deepEqual(Array.from(Buffer.from(part, 'base64')), Array.from(bytes));
  const bodyB64 = eml.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, '');
  assert.equal(Buffer.from(bodyB64, 'base64').toString('utf8'), 'Héllo\nline two');
});

test('PowerPoint file has every slide with notes (skipped when pptxgenjs is not installed)', async (t) => {
  let Pptx;
  try { Pptx = require('pptxgenjs'); } catch (e) { t.skip('pptxgenjs is not installed in Node; the browser bundle is tested by hand'); return; }
  const P = require(path.join(__dirname, '..', 'js', 'render-pptx.js'));
  const JSZip = require('jszip');
  const deck = deckFor({});
  const buf = await P.toPptx(Pptx, deck, { title: 't' }).write({ outputType: 'nodebuffer' });
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(slideFiles.length, 6);
  assert.equal(Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).length, 6);
  for (const f of slideFiles) assert.ok(!/show="0"/.test(await zip.files[f].async('string')), 'no hidden slides');
});
