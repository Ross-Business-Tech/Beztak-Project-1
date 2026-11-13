import { KNOWLEDGE, TOPIC_LABELS } from './data'
import { SECTIONS as OPS } from './data/beztakManual.js'

// Turns the HR desk's tickets into the question records the Manual Gap Tracker reads.
// This is the single place that defines how "what the AI agent handled" becomes "a question".
// A real agent feed (a shared store, an export) only has to produce the same row shape.

// Tags that mean "a person must handle this by policy", so they are not gaps in the manual.
const POLICY_TAGS = ['personal-record', 'pay-error', 'needs-approval', 'management-decision', 'confidential', 'security', 'sensitive', 'crisis', 'danger', 'emergency', 'injury', 'concern', 'private-info', 'legal', 'medical']
const STATUS = { Open: 'Open', 'In progress': 'In Progress', 'In Progress': 'In Progress', Resolved: 'Resolved', Closed: 'Closed' }

const answeredByAI = (t) => Boolean(t.resolvedByAI) || (t.tags || []).includes('ai-resolved') || /^Answered automatically/.test(t.note || '')
// Which manual entry answered a question, read from the citation the AI agent put in its reply
// ([HR-2] for the HR answers, [6.3] for the Operations Manual).
function citedSection(text) {
  const hr = /\[HR-(\d+)\]/.exec(text || '')
  if (hr && KNOWLEDGE[hr[1] - 1]) return { source: 'HR answers', section: `HR answers: ${TOPIC_LABELS[KNOWLEDGE[hr[1] - 1].topic]}, ${KNOWLEDGE[hr[1] - 1].keys[0]}` }
  const op = /\[§?\s?(\d+)\.(\d+)\]/.exec(text || '')
  const sec = op && OPS.find((x) => x.n === Number(op[1]))
  if (sec) return { source: 'Operations Manual', section: `Ops Manual §${sec.n} ${sec.title}` }
  return null
}
const humanReplies = (t) => (t.replies || []).filter((r) => !r.event && !r.ai && !r.inbound && r.text)

export function ticketsToRows(tickets) {
  return tickets.filter((t) => !t.mergedInto).map((t) => {
    const ai = answeredByAI(t)
    const closed = t.status === 'Closed' || t.status === 'Resolved'
    const lastHuman = humanReplies(t).slice(-1)[0]
    const firstAI = (t.replies || []).find((r) => r.ai)
    const policy = (t.tags || []).some((x) => POLICY_TAGS.includes(x))
    const wasEscalated = Boolean(t.escalatedAt) // the AI answered, then the employee asked for a person
    const cited = ai || wasEscalated ? citedSection(firstAI?.text) : null
    const row = {
      question_id: `HR-${t.id}`,
      conversation_id: `HR-${t.id}`,
      submitted_at: t.createdAt,
      source_system: t.channel || 'Email',
      question_text: `${t.subject}. ${t.body}`.slice(0, 1900),
      response_text: ai ? (firstAI?.text || '') : '',
      resolution_status: ai ? 'Answered' : closed ? 'Ticket Closed' : 'Ticket Open',
      answer_source: ai || wasEscalated ? (cited?.source || 'HR answers list') : '',
      manual_section: ai || wasEscalated ? (cited?.section || `HR answers: ${TOPIC_LABELS[t.topic] || 'General'}`) : '',
      category: TOPIC_LABELS[t.topic] || 'General',
      theme: t.subject,
    }
    if (!ai) {
      row.ticket_id = String(t.id)
      row.ticket_status = STATUS[t.status] || (closed ? 'Closed' : 'Open')
      row.escalation_reason = policy ? 'policy' : wasEscalated ? 'unclear' : 'no-match'
      if (closed) {
        const last = (t.replies || []).slice(-1)[0]
        row.resolution_timestamp = last?.at || t.createdAt
        row.resolution_note = lastHuman?.text || ''
      }
    }
    return row
  })
}

// ---- made-up history so the tracker has months of trend to show ----
// Same deterministic generator every time. Nothing here is real.
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

const SECTIONS = [
  ['Vacation and paid time off', 'Time off', null], ['Pay dates and pay stubs', 'Payroll', null], ['401(k) match', 'Benefits', null],
  ['Open enrollment', 'Benefits', null], ['First day checklist', 'Onboarding', null], ['Dress code and hybrid work', 'General', null],
  ['Parental leave', 'Benefits', 40], ['Adding a dependent after a life event', 'Benefits', 24], ['Expense reimbursement', 'Payroll', 12],
]
// kind: A always answered, U answered only sometimes (section unclear), G gap (no section until it is added), P goes to a person by policy
const TOPICS = [
  ['A', 'Vacation days per year', 'Time off', 9, 'Vacation and paid time off', ['How many vacation days do I get?', 'What is our paid time off allowance?']],
  ['A', 'Pay schedule', 'Payroll', 8, 'Pay dates and pay stubs', ['When is payday?', 'Where do I find my pay stub?']],
  ['A', '401(k) match', 'Benefits', 6, '401(k) match', ['Does the company match 401(k) contributions?', 'When am I eligible for the 401(k)?']],
  ['A', 'Dress code', 'General', 4, 'Dress code and hybrid work', ['What is the dress code?', 'How many days can I work from home?']],
  ['A', 'First day', 'Onboarding', 4, 'First day checklist', ['What do I bring on my first day?', 'Who meets me on my first day?']],
  ['U', 'Open enrollment changes', 'Benefits', 4, 'Open enrollment', ['Can I change plans outside open enrollment?', 'When does open enrollment end?'], 'Coverage can change within 30 days of a life event with proof of the event.'],
  ['G', 'Parental leave', 'Benefits', 7, 'Parental leave', ['How does parental leave work?', 'How many weeks of parental leave do I get?'], 'Up to 12 weeks paid leave, starting any time in the first year. Tell Benefits 30 days ahead where possible.', 40],
  ['G', 'Adding a spouse or dependent', 'Benefits', 6, 'Adding a dependent after a life event', ['How do I add my spouse to my health plan?', 'How do I add a new baby to my coverage?'], 'Add them in the benefits portal within 30 days of the event and upload the marriage or birth certificate.', 24],
  ['G', 'Expense reimbursement', 'Payroll', 5, 'Expense reimbursement', ['How do I get reimbursed for travel?', 'Where do I submit expenses?'], 'Submit receipts in the expense tool within 30 days. Payroll reimburses on the next pay date.', 12],
  ['G', 'Laptop for new hires', 'Onboarding', 4, '', ['My laptop is not ready for my start date', 'Who orders a new hire laptop?'], 'Managers request the laptop in the IT portal at least 5 days before the start date.'],
  ['G', 'Orthodontic and dental coverage', 'Benefits', 3, '', ['Does dental cover braces for my kids?', 'What does the dental plan cover?'], 'The dental plan covers orthodontics for dependents up to $1,500 lifetime.'],
  ['G', 'Remote work from another state', 'General', 2.5, '', ['Can I work remotely from another state for a month?', 'What is the policy on working from another state?'], 'Up to 4 weeks a year from another state with manager approval and HR notice.'],
  ['P', 'My own PTO balance', 'Time off', 3, '', ['How many PTO hours do I have left?', 'What is my vacation balance?']],
  ['P', 'My paycheck looks wrong', 'Payroll', 3, '', ['Why was my paycheck less this week?', 'My overtime is missing from my pay']],
  ['P', 'Can I take time off', 'Time off', 3, '', ['Can I take tomorrow off?', 'Can you approve my leave?']],
  ['P', 'Employee relations concerns', 'Employee relations', 1.5, '', ['Why did my manager write me up?', 'I want to report a conflict with my manager']],
]

export function sampleHistory(days = 120) {
  const r = rng(20261110)
  const DAY = 86400000
  const now = Date.now()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const sections = SECTIONS.map(([title, category, ago]) => ({ title, category, publishedAt: ago == null ? '' : new Date(today.getTime() - ago * DAY + 9 * 3600000).toISOString() }))
  const total = TOPICS.reduce((s, t) => s + t[3], 0)
  const rows = []
  for (let i = 0; i < 230; i++) {
    const age = r() * days
    let pick = r() * total
    let tp = TOPICS[0]
    for (const t of TOPICS) { pick -= t[3]; if (pick < 0) { tp = t; break } }
    const [kind, theme, cat, , section, phrases, note, ago] = tp
    // A gap stops generating tickets after its fix went live, and the section starts answering.
    const fixed = kind === 'G' && ago != null && age < ago
    const asked = new Date(now - age * DAY)
    const q = phrases[Math.floor(r() * phrases.length)]
    let answered = kind === 'A' || fixed || (kind === 'U' && r() < 0.35)
    const row = {
      question_id: `SMP-${i + 1}`, conversation_id: `SMP-${i + 1}`, submitted_at: asked.toISOString(), source_system: 'Sample (made up)',
      question_text: q, category: cat, theme,
      manual_section: kind === 'A' || kind === 'U' || fixed ? section : '',
      section_published_at: fixed ? (sections.find((s) => s.title === section)?.publishedAt || '') : '',
    }
    if (answered) { Object.assign(row, { resolution_status: 'Answered', response_text: `Answer from "${section}".`, answer_source: 'HR answers list' }) }
    else {
      const closed = age > 3
      Object.assign(row, {
        resolution_status: closed ? 'Ticket Closed' : 'Ticket Open', ticket_id: `HR-S${i + 1}`, ticket_status: closed ? 'Resolved' : 'In Progress',
        escalation_reason: kind === 'P' ? 'policy' : kind === 'U' ? 'unclear' : 'no-match',
        manual_section: kind === 'U' ? section : '',
      })
      if (closed) { row.resolution_timestamp = new Date(asked.getTime() + (0.3 + r() * 2) * DAY).toISOString(); row.resolution_note = note || 'Handled directly by the team.' }
    }
    rows.push(row)
  }
  return { rows, sections }
}
