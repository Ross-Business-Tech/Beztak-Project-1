// Run with:  node --test analytics-dashboard/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require(path.join(__dirname, '..', 'js', 'data.js'));
const A = require(path.join(__dirname, '..', 'js', 'analytics.js'));
const { STATUS } = D;

const NOW = new Date(2026, 5, 15, 12, 0, 0); // 15 June 2026, local noon
const CATS = D.DEFAULT_CATEGORIES;

function raw(over) {
  return Object.assign({
    question_id: 'T-1',
    question_text: 'Does the app work offline?',
    submitted_at: new Date(2026, 5, 10, 9, 0).toISOString(),
    source_system: 'Test',
    resolution_status: 'Answer Found',
    category: 'Product Information',
    subcategory: 'Features & specs'
  }, over);
}

function stored(over) {
  const res = D.validateRecord(raw(over), { categories: CATS, now: NOW });
  assert.equal(res.ok, true, res.errors && res.errors.join('; '));
  return res.record;
}

// ---------- validation ----------

test('a complete record validates and maps names to category ids', () => {
  const r = stored({});
  assert.equal(r.category_id, 'product');
  assert.equal(r.subcategory_id, 'prod-features');
  assert.equal(r.resolution_status, STATUS.ANSWER);
  assert.equal(r.normalized_text, 'does the app work offline');
});

test('missing id, text or a bad date is rejected with a reason', () => {
  const res = D.validateRecord(raw({ question_id: '', question_text: '', submitted_at: 'not a date' }), { categories: CATS, now: NOW });
  assert.equal(res.ok, false);
  assert.equal(res.errors.length, 3);
});

test('a date in the far future is rejected', () => {
  const res = D.validateRecord(raw({ submitted_at: new Date(2030, 0, 1).toISOString() }), { categories: CATS, now: NOW });
  assert.equal(res.ok, false);
});

test('unrecognized status is kept as Unknown with a warning, not rejected', () => {
  const res = D.validateRecord(raw({ resolution_status: 'maybe' }), { categories: CATS, now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.record.resolution_status, STATUS.UNKNOWN);
  assert.equal(res.warnings.length, 1);
});

test('common status spellings are recognized', () => {
  assert.equal(D.validateRecord(raw({ resolution_status: 'answered' }), { categories: CATS, now: NOW }).record.resolution_status, STATUS.ANSWER);
  assert.equal(D.validateRecord(raw({ resolution_status: 'ticket_created' }), { categories: CATS, now: NOW }).record.resolution_status, STATUS.TICKET);
  assert.equal(D.validateRecord(raw({ resolution_status: ' UNRESOLVED ' }), { categories: CATS, now: NOW }).record.resolution_status, STATUS.UNRESOLVED);
});

test('an unknown category goes to Other / Uncategorized with a warning', () => {
  const res = D.validateRecord(raw({ category: 'Weather' , subcategory: '' }), { categories: CATS, now: NOW });
  assert.equal(res.record.category_id, 'uncategorized');
  assert.equal(res.warnings.length, 1);
});

test('ticket fields are kept for Ticket Created and ignored for Answer Found', () => {
  const t = stored({ resolution_status: 'Ticket Created', ticket_id: 'TCK-9', ticket_status: 'In Progress' });
  assert.equal(t.ticket_id, 'TCK-9');
  assert.equal(t.ticket_status, 'In Progress');
  assert.equal(t.ticket_events.length, 2);
  const a = D.validateRecord(raw({ ticket_id: 'TCK-9' }), { categories: CATS, now: NOW });
  assert.equal(a.record.ticket_id, '');
  assert.equal(a.warnings.length, 1);
});

test('resolving a ticket does not change the original outcome', () => {
  const t = stored({ resolution_status: 'Ticket Created', ticket_id: 'TCK-9', ticket_status: 'Resolved', resolution_timestamp: '2026-06-12T10:00:00Z' });
  assert.equal(t.resolution_status, STATUS.TICKET);
  assert.equal(t.ticket_status, 'Resolved');
});

// ---------- parsing and import ----------

test('CSV parsing handles quoted commas, doubled quotes, CRLF and BOM', () => {
  const text = '﻿question_id,question_text,submitted_at\r\nA1,"Hi, is it ""free""?",2026-06-01\r\n';
  const out = D.parseCSV(text);
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].question_text, 'Hi, is it "free"?');
  assert.equal(out.records[0].question_id, 'A1');
  assert.equal(out.records[0].__row, 2);
});

test('CSV with only a header is reported, not silently empty', () => {
  assert.ok(D.parseCSV('question_id,question_text\n').error);
});

test('JSON import accepts a list or an object with a questions list', () => {
  assert.equal(D.parseJSONImport('[{"question_id":"a"}]').records.length, 1);
  assert.equal(D.parseJSONImport('{"questions":[{"question_id":"a"},{"question_id":"b"}]}').records.length, 2);
  assert.ok(D.parseJSONImport('{"nope":1}').error);
  assert.ok(D.parseJSONImport('{bad json').error);
});

test('import skips duplicates within the file and against stored records', () => {
  const rows = [
    raw({ question_id: 'X1' }),
    raw({ question_id: 'X1', question_text: 'Same id again' }),
    raw({ question_id: 'X2' }),
    raw({ question_id: 'OLD' }),
    { question_id: 'X3', question_text: '', submitted_at: 'bad' }
  ];
  const out = D.prepareImport(rows, { categories: CATS, now: NOW, existingIds: new Set(['OLD']) });
  assert.deepEqual(out.accepted.map(r => r.question_id), ['X1', 'X2']);
  assert.equal(out.duplicates.length, 2);
  assert.equal(out.rejected.length, 1);
  assert.equal(out.rejected[0].row, 5);
});

test('CSV export escapes commas and quotes and neutralizes formulas', () => {
  const csv = D.toCSV([{ a: 'x, "y"', b: '=SUM(1,2)' }], ['a', 'b']);
  assert.equal(csv, 'a,b\r\n"x, ""y""","\'=SUM(1,2)"\r\n');
});

test('retention marks only records older than the cut-off', () => {
  const qs = [
    { question_id: 'old', submitted_at: new Date(2024, 0, 1).toISOString() },
    { question_id: 'new', submitted_at: new Date(2026, 4, 1).toISOString() }
  ];
  assert.deepEqual(D.recordsPastRetention(qs, 12, NOW), ['old']);
});

// ---------- sample data ----------

test('sample data is deterministic, unique and fully valid', () => {
  const a = D.generateSampleRows(1500, NOW);
  const b = D.generateSampleRows(1500, NOW);
  assert.deepEqual(a, b);
  const out = D.prepareImport(a, { categories: CATS, now: NOW, existingIds: new Set() });
  assert.equal(out.rejected.length, 0);
  assert.equal(out.duplicates.length, 0);
  assert.equal(out.accepted.length, 1500);
});

// ---------- analytics ----------

// A fixed, hand-checked dataset.
function dataset() {
  const mk = (id, status, cat, when, extra) => stored(Object.assign({
    question_id: id, question_text: 'Q ' + id, resolution_status: status, category: cat,
    subcategory: '', submitted_at: when, ticket_id: status === 'Ticket Created' ? 'TCK-' + id : ''
  }, extra || {}));
  return [
    mk('1', 'Answer Found', 'Product Information', new Date(2026, 5, 14, 10)),
    mk('2', 'Answer Found', 'Product Information', new Date(2026, 5, 14, 11)),
    mk('3', 'Ticket Created', 'Technical Support', new Date(2026, 5, 13, 10), { ticket_status: 'Resolved', resolution_timestamp: new Date(2026, 5, 14).toISOString() }),
    mk('4', 'Unresolved', 'Technical Support', new Date(2026, 5, 9, 10)),
    mk('5', 'Unknown', 'Technical Support', new Date(2026, 5, 8, 10)),
    mk('6', 'Ticket Created', 'Account & Access', new Date(2026, 4, 1, 10), { ticket_status: 'Open' }),
    mk('7', 'Unresolved', 'Account & Access', new Date(2026, 4, 2, 10)),
    mk('8', 'Answer Found', 'Account & Access', new Date(2026, 4, 3, 10))
  ];
}

test('summary counts and percentages use known-status records as the base', () => {
  const s = A.summarize(dataset());
  assert.equal(s.total, 8);
  assert.equal(s.known, 7);
  assert.equal(s.counts[STATUS.ANSWER], 3);
  assert.equal(s.counts[STATUS.TICKET], 2);
  assert.equal(s.counts[STATUS.UNRESOLVED], 2);
  assert.equal(s.counts[STATUS.UNKNOWN], 1);
  assert.ok(Math.abs(s.pct.answered + s.pct.ticketed + s.pct.unresolved - 100) < 1e-9);
  assert.equal(s.ticketsResolved, 1);
  assert.equal(s.ticketsOpen, 1);
});

test('the past-7-days range includes today and excludes older records', () => {
  const range = A.rangeFromPreset('7d', NOW);
  const out = A.filterRange(dataset(), range);
  // Seven days ending today: 9 June to 15 June inclusive.
  assert.deepEqual(out.map(q => q.question_id).sort(), ['1', '2', '3', '4']);
  assert.equal(range.label, 'Past 7 days');
});

test('custom date range is inclusive of both end days', () => {
  const range = A.rangeFromPreset('custom', NOW, { from: '2026-05-01', to: '2026-05-02' });
  assert.deepEqual(A.filterRange(dataset(), range).map(q => q.question_id).sort(), ['6', '7']);
});

test('all time keeps everything', () => {
  assert.equal(A.filterRange(dataset(), A.rangeFromPreset('all', NOW)).length, 8);
});

test('category stats give volume and answer rate over known records', () => {
  const rows = A.categoryStats(dataset(), CATS);
  const acc = rows.find(r => r.id === 'account');
  assert.equal(acc.total, 3);
  assert.equal(acc.known, 3);
  assert.ok(Math.abs(acc.answerRate - 100 / 3) < 1e-9);
  const tech = rows.find(r => r.id === 'tech');
  assert.equal(tech.total, 3);
  assert.equal(tech.known, 2);
  assert.ok(Math.abs(tech.volumePct - 37.5) < 1e-9);
});

test('trend fills empty weeks with zeros and buckets by Monday', () => {
  const rows = A.trend(dataset(), 'week');
  const totalAcross = rows.reduce((n, r) => n + r.total, 0);
  assert.equal(totalAcross, 8);
  assert.ok(rows.some(r => r.total === 0), 'expected at least one empty week');
  rows.forEach(r => assert.equal(r.start.getDay(), 1));
});

test('monthly trend counts each month once', () => {
  const rows = A.trend(dataset(), 'month');
  // May has three records, June has five.
  assert.deepEqual(rows.map(r => r.total), [3, 5]);
});

test('gaps list unanswered questions, rates and repeated unanswered questions', () => {
  const qs = dataset().concat([
    stored({ question_id: '9', question_text: 'Hi, Can I reset my password?', resolution_status: 'Unresolved', category: 'Account & Access', submitted_at: new Date(2026, 5, 11, 9).toISOString() }),
    stored({ question_id: '10', question_text: 'can I reset my password', resolution_status: 'Ticket Created', ticket_id: 'TCK-10', category: 'Account & Access', submitted_at: new Date(2026, 5, 12, 9).toISOString() })
  ]);
  const g = A.gaps(qs, CATS, { minSample: 1 });
  assert.equal(g.unansweredCount, 6);
  assert.equal(g.repeats.length, 1);
  assert.equal(g.repeats[0].count, 2);
  assert.equal(g.repeats[0].categoryId, 'account');
  assert.equal(g.byCategory[0].id, 'account');
});

test('answered and ticketed records never overlap', () => {
  const qs = dataset();
  const answered = qs.filter(q => q.resolution_status === STATUS.ANSWER).map(q => q.question_id);
  const ticketed = qs.filter(q => q.resolution_status === STATUS.TICKET).map(q => q.question_id);
  assert.equal(answered.filter(id => ticketed.includes(id)).length, 0);
});
