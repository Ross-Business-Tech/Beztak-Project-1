import { KNOWLEDGE, TOPIC_LABELS } from './data'
import { sectionTitle } from './activeManual.js'

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
  const title = op && sectionTitle(Number(op[1]))
  if (title) return { source: 'Operations Manual', section: `Ops Manual §${Number(op[1])} ${title}` }
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
