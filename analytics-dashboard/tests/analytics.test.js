// Run with:  node --test analytics-dashboard/tests/analytics.test.js
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
    resolution_status: 'Answered',
    category: 'Product Information',
    subcategory: 'Features & specs'
  }, over);
}

function check(over) {
  return D.validateRecord(raw(over), { categories: CATS, now: NOW });
}

function stored(over) {
  const res = check(over);
  assert.equal(res.ok, true, res.errors && res.errors.join('; '));
  return res.record;
}

// ---------- validation ----------

test('a complete answered record validates and maps names to category ids', () => {
  const r = stored({});
  assert.equal(r.category_id, 'product');
  assert.equal(r.subcategory_id, 'prod-features');
  assert.equal(r.resolution_status, STATUS.ANSWERED);
  assert.equal(r.normalized_text, 'does the app work offline');
});

test('missing id, text or a bad date is rejected with a reason', () => {
  const res = check({ question_id: '', question_text: '', submitted_at: 'not a date' });
  assert.equal(res.ok, false);
  assert.equal(res.errors.length, 3);
});

test('a date in the far future is rejected', () => {
  assert.equal(check({ submitted_at: new Date(2030, 0, 1).toISOString() }).ok, false);
});

test('status is required and must be one of the three allowed values', () => {
  assert.equal(check({ resolution_status: '' }).ok, false);
  assert.equal(check({ resolution_status: 'Unresolved' }).ok, false);
  assert.equal(check({ resolution_status: 'Unknown' }).ok, false);
});

test('common status spellings map to the three statuses', () => {
  assert.equal(check({ resolution_status: 'answer found' }).record.resolution_status, STATUS.ANSWERED);
  assert.equal(check({ resolution_status: 'Ticket Open' }).record.resolution_status, STATUS.OPEN);
  assert.equal(check({ resolution_status: 'ticket_created' }).record.resolution_status, STATUS.OPEN);
  assert.equal(check({ resolution_status: 'Ticket Closed' }).record.resolution_status, STATUS.CLOSED);
});

test('ticket_status decides between Ticket Open and Ticket Closed', () => {
  const closed = stored({ resolution_status: 'Ticket Open', ticket_id: 'TCK-1', ticket_status: 'Resolved' });
  assert.equal(closed.resolution_status, STATUS.CLOSED);
  assert.equal(closed.ticket_status, 'Resolved');
  const open = stored({ resolution_status: 'Ticket Closed', ticket_id: 'TCK-2', ticket_status: 'In Progress' });
  assert.equal(open.resolution_status, STATUS.OPEN);
  const res = check({ resolution_status: 'Ticket Closed', ticket_id: 'TCK-2', ticket_status: 'In Progress' });
  assert.ok(res.warnings.some(w => w.includes('does not match')));
});

test('ticket fields are dropped for answered questions', () => {
  const res = check({ ticket_id: 'TCK-9' });
  assert.equal(res.record.ticket_id, '');
  assert.equal(res.warnings.length, 1);
});

test('resolution note and flag are stored', () => {
  const r = stored({ resolution_status: 'Ticket Closed', ticket_id: 'TCK-3', resolution_note: 'Sent the reset link', flag: 'Standardize' });
  assert.equal(r.resolution_note, 'Sent the reset link');
  assert.equal(r.flag, 'Standardize');
});

test('an unmatched category is kept as Uncategorized and gets a keyword suggestion', () => {
  const r = stored({ category: 'Weather', subcategory: '', question_text: 'Why was I charged twice on my invoice?' });
  assert.equal(r.category_id, 'uncategorized');
  assert.equal(r.suggested_category_id, 'bill-invoice');
  assert.equal(r.suggestion_source, 'keywords');
});

test('a chatbot suggestion takes precedence over keyword rules', () => {
  const r = stored({ category: '', subcategory: '', suggested_category: 'Pricing & Billing', question_text: 'Why was I charged twice?' });
  assert.equal(r.category_id, 'uncategorized');
  assert.equal(r.suggested_category_id, 'billing');
  assert.equal(r.suggestion_source, 'chatbot');
});

test('a confirmed category carries no suggestion', () => {
  const r = stored({ category: 'Account & Access', subcategory: 'Login & password', question_text: 'Why was I charged twice?' });
  assert.equal(r.category_id, 'account');
  assert.equal(r.subcategory_id, 'acc-login');
  assert.equal(r.suggested_category_id, '');
});

test('a resolved ticket adds a closing event to its history', () => {
  const r = stored({ resolution_status: 'Ticket Open', ticket_id: 'TCK-1', ticket_status: 'Resolved', resolution_timestamp: '2026-06-12T10:00:00Z' });
  assert.equal(r.ticket_events.length, 2);
  assert.equal(r.ticket_events[1].status, 'Resolved');
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
    { question_id: 'X3', question_text: '', submitted_at: 'bad', resolution_status: '' }
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

test('export row includes note, flag and the suggested category name', () => {
  const r = stored({ category: '', subcategory: '', question_text: 'Why was I charged?', resolution_status: 'Ticket Open', ticket_id: 'T', resolution_note: 'n', flag: 'Standardize' });
  const row = D.toExportRow(r, CATS);
  assert.equal(row.resolution_note, 'n');
  assert.equal(row.flag, 'Standardize');
  assert.equal(row.category, '');
  assert.equal(row.suggested_category, 'Invoices');
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
  const statuses = new Set(out.accepted.map(r => r.resolution_status));
  assert.deepEqual([...statuses].sort(), [STATUS.ANSWERED, STATUS.CLOSED, STATUS.OPEN].sort());
});

test('sample data includes some suggestions waiting for an admin', () => {
  const out = D.prepareImport(D.generateSampleRows(300, NOW), { categories: CATS, now: NOW, existingIds: new Set() });
  assert.ok(out.accepted.some(r => r.category_id === 'uncategorized' && r.suggested_category_id));
});

// ---------- analytics ----------

// A fixed, hand-checked dataset.
function dataset() {
  const mk = (id, status, cat, sub, when, extra) => stored(Object.assign({
    question_id: id, question_text: 'Q ' + id, resolution_status: status, category: cat,
    subcategory: sub, submitted_at: when, ticket_id: status === 'Answered' ? '' : 'TCK-' + id
  }, extra || {}));
  return [
    mk('1', 'Answered', 'Product Information', 'Features & specs', new Date(2026, 5, 14, 10)),
    mk('2', 'Answered', 'Product Information', 'Features & specs', new Date(2026, 5, 14, 11)),
    mk('3', 'Ticket Closed', 'Technical Support', 'Error messages', new Date(2026, 5, 13, 10), { ticket_status: 'Resolved', resolution_timestamp: new Date(2026, 5, 14).toISOString(), resolution_note: 'Cleared cache' }),
    mk('4', 'Ticket Open', 'Technical Support', 'Error messages', new Date(2026, 5, 9, 10)),
    mk('5', 'Ticket Open', 'Technical Support', '', new Date(2026, 5, 8, 10)),
    mk('6', 'Ticket Open', 'Account & Access', '', new Date(2026, 4, 1, 10)),
    mk('7', 'Ticket Closed', 'Account & Access', '', new Date(2026, 4, 2, 10), { ticket_status: 'Closed', resolution_note: 'Reset link sent' }),
    mk('8', 'Answered', 'Account & Access', '', new Date(2026, 4, 3, 10))
  ];
}

test('summary counts and percentages use all records as the base', () => {
  const s = A.summarize(dataset());
  assert.equal(s.total, 8);
  assert.equal(s.counts[STATUS.ANSWERED], 3);
  assert.equal(s.counts[STATUS.OPEN], 3);
  assert.equal(s.counts[STATUS.CLOSED], 2);
  assert.equal(s.ticketed, 5);
  const sum = s.pct.answered + s.pct.open + s.pct.closed;
  assert.ok(Math.abs(sum - 100) < 1e-9);
});

test('the past-7-days range includes today and excludes older records', () => {
  const range = A.rangeFromPreset('7d', NOW);
  // Seven days ending today: 9 June to 15 June inclusive.
  assert.deepEqual(A.filterRange(dataset(), range).map(q => q.question_id).sort(), ['1', '2', '3', '4']);
  assert.equal(range.label, 'Past 7 days');
});

test('custom date range is inclusive of both end days', () => {
  const range = A.rangeFromPreset('custom', NOW, { from: '2026-05-01', to: '2026-05-02' });
  assert.deepEqual(A.filterRange(dataset(), range).map(q => q.question_id).sort(), ['6', '7']);
});

test('all time keeps everything', () => {
  assert.equal(A.filterRange(dataset(), A.rangeFromPreset('all', NOW)).length, 8);
});

test('category stats give volume and answer rate over all records in the category', () => {
  const rows = A.categoryStats(dataset(), CATS);
  const acc = rows.find(r => r.id === 'account');
  assert.equal(acc.total, 3);
  assert.ok(Math.abs(acc.answerRate - 100 / 3) < 1e-9);
  const tech = rows.find(r => r.id === 'tech');
  assert.equal(tech.total, 3);
  assert.equal(tech.ticketed, 3);
  assert.ok(Math.abs(tech.volumePct - 37.5) < 1e-9);
});

test('trend fills empty weeks with zeros and buckets by Monday', () => {
  const rows = A.trend(dataset(), 'week');
  assert.equal(rows.reduce((n, r) => n + r.total, 0), 8);
  assert.ok(rows.some(r => r.total === 0), 'expected at least one empty week');
  rows.forEach(r => assert.equal(r.start.getDay(), 1));
});

test('monthly trend counts each month once', () => {
  assert.deepEqual(A.trend(dataset(), 'month').map(r => r.total), [3, 5]);
});

test('gaps list ticketed questions and repeated ticketed questions', () => {
  const qs = dataset().concat([
    stored({ question_id: '9', question_text: 'Hi, Can I reset my password?', resolution_status: 'Ticket Open', ticket_id: 'TCK-9', category: 'Account & Access', submitted_at: new Date(2026, 5, 11, 9).toISOString() }),
    stored({ question_id: '10', question_text: 'can I reset my password', resolution_status: 'Ticket Closed', ticket_id: 'TCK-10', ticket_status: 'Closed', category: 'Account & Access', submitted_at: new Date(2026, 5, 12, 9).toISOString() })
  ]);
  const g = A.gaps(qs, CATS, { minSample: 1 });
  assert.equal(g.ticketedCount, 7);
  assert.equal(g.repeats.length, 1);
  assert.equal(g.repeats[0].count, 2);
  assert.equal(g.repeats[0].categoryId, 'account');
  assert.equal(g.byCategory[0].id, 'account');
});

test('manual suggestions find standardization, manual gaps and answers that needed a follow-up ticket', () => {
  const qs = [
    stored({ question_id: 'a1', question_text: 'Error 504 on upload', resolution_status: 'Ticket Closed', ticket_id: 'TCK-a1', ticket_status: 'Resolved', subcategory: 'Error messages', category: 'Technical Support', resolution_note: 'Cleared cache', submitted_at: new Date(2026, 5, 1).toISOString() }),
    stored({ question_id: 'a2', question_text: 'Error 504 on upload', resolution_status: 'Ticket Closed', ticket_id: 'TCK-a2', ticket_status: 'Resolved', subcategory: 'Error messages', category: 'Technical Support', resolution_note: 'Restarted app', submitted_at: new Date(2026, 5, 2).toISOString() }),
    stored({ question_id: 'a3', question_text: 'Error 504 on upload', resolution_status: 'Ticket Closed', ticket_id: 'TCK-a3', ticket_status: 'Resolved', subcategory: 'Error messages', category: 'Technical Support', resolution_note: 'Restarted app', submitted_at: new Date(2026, 5, 3).toISOString() }),
    stored({ question_id: 'r1', question_text: 'Who can remove a member?', resolution_status: 'Answered', subcategory: 'Roles & permissions', category: 'Account & Access', flag: 'Standardize', submitted_at: new Date(2026, 5, 4).toISOString() }),
    stored({ question_id: 'c1', question_text: 'Invoice question', resolution_status: 'Answered', answer_source: 'Billing FAQ', conversation_id: 'C1', subcategory: 'Invoices', category: 'Pricing & Billing', submitted_at: new Date(2026, 5, 5, 9).toISOString() }),
    stored({ question_id: 'c2', question_text: 'Invoice follow up', resolution_status: 'Ticket Open', ticket_id: 'TCK-c2', conversation_id: 'C1', subcategory: 'Invoices', category: 'Pricing & Billing', submitted_at: new Date(2026, 5, 5, 10).toISOString() }),
    stored({ question_id: 'c3', question_text: 'Another invoice question', resolution_status: 'Answered', answer_source: 'Billing FAQ', conversation_id: 'C2', subcategory: 'Invoices', category: 'Pricing & Billing', submitted_at: new Date(2026, 5, 6, 9).toISOString() }),
    stored({ question_id: 'c4', question_text: 'Invoice follow up 2', resolution_status: 'Ticket Closed', ticket_id: 'TCK-c4', ticket_status: 'Closed', conversation_id: 'C2', subcategory: 'Invoices', category: 'Pricing & Billing', submitted_at: new Date(2026, 5, 6, 10).toISOString() })
  ];
  const m = A.manualSuggestions(qs, CATS, { minTickets: 3, minFollowUps: 2 });

  const errorTopic = m.standardize.find(s => s.key === 'tech-errors');
  assert.ok(errorTopic, 'the same question resolved with two different notes should trigger standardization');
  assert.equal(errorTopic.conflicts, 1);
  assert.ok(m.standardize.find(s => s.key === 'acc-roles' && s.flag === 'Standardize'));

  // Different questions with different notes are not, by themselves, a standardization issue.
  const distinct = A.manualSuggestions(qs.filter(q => q.question_id !== 'a2' && q.question_id !== 'a3'), CATS, {});
  assert.equal(distinct.standardize.find(s => s.key === 'tech-errors'), undefined);

  const manual = m.addToManual.find(s => s.key === 'tech-errors');
  assert.ok(manual, 'three closed tickets with no chatbot answer should suggest a manual entry');
  assert.equal(manual.closed, 3);

  assert.equal(m.improveAnswers.length, 1);
  assert.equal(m.improveAnswers[0].source, 'Billing FAQ');
  assert.equal(m.improveAnswers[0].count, 2);
});

test('answered and ticketed records never overlap', () => {
  const qs = dataset();
  const answered = qs.filter(q => q.resolution_status === STATUS.ANSWERED).map(q => q.question_id);
  const ticketed = qs.filter(q => A.summarize([q]).ticketed === 1).map(q => q.question_id);
  assert.equal(answered.filter(id => ticketed.includes(id)).length, 0);
});
