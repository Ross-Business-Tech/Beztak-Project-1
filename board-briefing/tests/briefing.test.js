// Run with:  node --test board-briefing/tests
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require(path.join(__dirname, '..', 'js', 'engine', 'data.js'));
const B = require(path.join(__dirname, '..', 'js', 'briefing.js'));
const S = require(path.join(__dirname, '..', 'js', 'slides.js'));
const H = require(path.join(__dirname, '..', 'js', 'render-html.js'));
const E = require(path.join(__dirname, '..', 'js', 'email.js'));

const NOW = new Date(2099, 0, 1);
let seq = 0;

// One question record. Dates are local noon on the given day, so month edges behave the same in any time zone.
function q(y, m, d, over) {
  seq++;
  const raw = Object.assign({
    question_id: 'T-' + seq, question_text: 'Question number ' + seq,
    submitted_at: new Date(y, m - 1, d, 12).toISOString(), source_system: 'Test',
    resolution_status: 'Answered', category: 'Safety & Compliance', theme: 'Topic A',
    manual_section: 'Section A', answer_source: 'Section A'
  }, over);
  return raw;
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

// Aug: 40 questions, 20 answered. Sep: 40, 30 answered. Oct: 40, 24 answered (60%). Nov: noise that must not leak.
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

test('availableMonths flags partial months and defaultMonth picks the latest complete one', () => {
  const recs = fixture();
  const months = B.availableMonths(recs);
  assert.deepEqual(months.map((m) => m.ym), ['2026-08', '2026-09', '2026-10', '2026-11']);
  assert.equal(months[3].complete, false, 'November stops on day 5');
  assert.equal(B.defaultMonth(recs), '2026-10');
});

test('headline numbers match the month and ignore later months', () => {
  const b = B.build(fixture(), '2026-10', { goal: 65, minutesPerTicket: 12 });
  assert.equal(b.b.total, 40);
  assert.equal(b.b.answered, 24);
  assert.equal(Math.round(b.b.rate), 60);
  assert.equal(Math.round(b.pb.rate), 75); // September: 30 of 40
  assert.equal(Math.round(b.delta), -15);
  assert.equal(Math.round(b.vsGoal), -5);
  assert.equal(b.needForGoal, 2); // 65% of 40 = 26 answered needed, 24 answered
  assert.equal(b.hoursSavedByBot, (24 * 12) / 60);
});

test('trend covers only full months up to the chosen one', () => {
  const b = B.build(fixture(), '2026-09', {});
  assert.deepEqual(b.series.map((s) => s.label), ['Aug', 'Sep']);
  assert.deepEqual(b.series.map((s) => Math.round(s.rate)), [50, 75]);
});

test('ticket reasons add up to the tickets, and fixable ones are counted', () => {
  const b = B.build(fixture(), '2026-10', {});
  assert.equal(b.reasons.reduce((a, r) => a + r.count, 0), b.b.tickets);
  assert.equal(b.fixableTickets, b.reasons.filter((r) => r.fixable).reduce((a, r) => a + r.count, 0));
  assert.ok(b.fixablePct > 0 && b.fixablePct < 100);
});

test('top fixes come from fixable topics only, ranked by tickets', () => {
  const b = B.build(fixture(), '2026-10', {});
  assert.ok(b.fixes.length >= 1);
  assert.equal(b.fixes[0].theme, 'Gap topic');
  assert.ok(!b.fixes.some((f) => f.theme === 'Policy topic'), 'policy topics are never listed as fixes');
  assert.ok(b.projectedRate > b.b.rate);
  assert.equal(b.moreFromFixes, b.fixes.reduce((a, f) => a + f.more, 0));
});

test('a month with little data warns instead of failing', () => {
  const recs = records(many(5, (i) => q(2026, 10, 1 + i)));
  const b = B.build(recs, '2026-10', {});
  assert.ok(b.warnings.length >= 1);
  assert.equal(b.pb, null);
  assert.equal(b.delta, null);
  assert.doesNotThrow(() => S.build(b));
});

test('a manual update is credited with the questions answered after it was published', () => {
  const raws = [];
  for (let i = 0; i < 30; i++) raws.push(ticket(2026, 9, 1 + (i % 28), { theme: 'Spill', escalation_reason: 'no-match' }));
  const pub = new Date(2026, 9, 1, 9).toISOString();
  for (let i = 0; i < 30; i++) raws.push(q(2026, 10, 1 + (i % 28), { theme: 'Spill', manual_section: 'Spill response', answer_source: 'Spill response', section_published_at: pub }));
  const b = B.build(records(raws), '2026-10', { minutesPerTicket: 10 });
  assert.equal(b.roi.count, 1);
  assert.equal(b.roi.updates[0].title, 'Spill response');
  assert.equal(b.roi.answersSince, 30);
  assert.equal(b.roi.answersThisMonth, 30);
  assert.equal(b.roi.hoursSince, 5); // 30 answers x 10 min
  assert.equal(b.roi.newThisMonth, 1);
  // The same update is not yet visible when reporting September.
  assert.equal(B.build(records(raws), '2026-09', {}).roi.count, 0);
});

test('every slide fits on the page and the deck has seven slides', () => {
  const deck = S.build(B.build(fixture(), '2026-10', { org: 'Test Co', note: 'A short note.' }));
  assert.equal(deck.slides.length, 7);
  deck.slides.forEach((s, i) => {
    s.items.forEach((it) => {
      if (it.t === 'line') { [it.x1, it.x2].forEach((x) => assert.ok(x >= 0 && x <= S.W + 0.01, 'slide ' + (i + 1))); return; }
      assert.ok(it.x >= -0.01 && it.y >= -0.01 && it.x + it.w <= S.W + 0.01 && it.y + it.h <= S.H + 0.01, 'slide ' + (i + 1) + ' shape off the page: ' + JSON.stringify(it).slice(0, 120));
    });
    assert.ok(s.notes.length > 10, 'slide ' + (i + 1) + ' has speaker notes');
  });
});

test('slides still build with no fixes, no updates and a single month', () => {
  const recs = records(many(30, (i) => q(2026, 10, 1 + (i % 28))));
  const b = B.build(recs, '2026-10', { goal: 50 });
  assert.equal(b.fixes.length, 0);
  assert.equal(b.roi.count, 0);
  const deck = S.build(b);
  assert.equal(deck.slides.length, 7);
  assert.match(S.verdict(b), /100% of questions in October, above the 50% goal/);
});

test('the preview is escaped, so a note cannot inject HTML', () => {
  const b = B.build(fixture(), '2026-10', { note: '<img src=x onerror=alert(1)> & "quotes"', org: '<b>Org</b>' });
  const html = H.toHtml(S.build(b));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<b>Org</b>'));
  assert.ok(html.includes('&lt;img src=x'));
});

test('email text mentions the month, the rate and the note', () => {
  const b = B.build(fixture(), '2026-10', { note: 'Thank you all.', preparedBy: 'Dana' });
  const e = S.email(b);
  assert.match(e.subject, /October 2026: 60% of questions answered by the bot/);
  assert.match(e.body, /Thank you all\./);
  assert.match(e.body, /Dana$/);
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

test('PowerPoint file has seven slides with notes (skipped when pptxgenjs is not installed)', async (t) => {
  let Pptx;
  try { Pptx = require('pptxgenjs'); } catch (e) { t.skip('pptxgenjs is not installed in Node; the browser bundle is tested by hand'); return; }
  const P = require(path.join(__dirname, '..', 'js', 'render-pptx.js'));
  const deck = S.build(B.build(fixture(), '2026-10', {}));
  const buf = await P.toPptx(Pptx, deck, { title: 't' }).write({ outputType: 'nodebuffer' });
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  assert.equal(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 7);
  assert.equal(Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).length, 7);
});
