import { mustGoToPerson } from './aiAgent'
import { WORK } from './hours'
import { agentName, dueIn } from './util'

// What happens when an employee writes back after the AI already answered their question.
//   "Thanks!"                          -> nothing to do, the ticket stays closed
//   "That didn't help, a person please" -> a person gets it, with a fresh one-business-day deadline,
//                                          moved to the top of their list, and the employee is told who will reply and when
//   Any other reply (a new question)   -> also goes to a person, so a real question is never dropped
// No AI is involved: these are simple word rules, so they behave the same every time.

const PERSON = [
  /\b(talk|speak|chat|connect|transfer|escalate|hand)\b[^.?!]{0,40}\b(person|human|someone|somebody|rep|representative|agent|hr|team member|manager)\b/,
  /\b(real|live|actual)\s+(person|human)\b/,
  /\b(person|human|someone|somebody)\b[^.?!]{0,30}\b(follow\s?up|reply|respond|call|help|answer|contact|look)\b/,
  /\b(did\s?n['’]?t|did not|does\s?n['’]?t|does not|do\s?n['’]?t|do not|not)\b[^.?!]{0,12}\b(help|answer|helpful|solve|work|what i asked|clear)\b/,
  /\bnot (helpful|clear|what i (asked|meant|need))\b/,
  /\bstill (confused|do\s?n['’]?t|do not|need|have|can['’]?t|cannot|not sure|unsure|no idea)\b/,
  /\b(wrong|incorrect|unclear|confusing|useless|unhelpful)\b/,
  /\bmore help\b|\bneed help\b|\bescalate\b|\bcall me\b|\bhave someone\b|\bfollow\s?up with me\b/,
]
const THANKS = /^(thanks|thank you|thank u|thx|ty|many thanks|great|perfect|awesome|got it|ok|okay|cool|cheers|appreciate|that helps|that helped|that works|that worked|that is helpful|that was helpful|that answers|all good|makes sense|sounds good|nice)\b/

const clean = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

// 'person' | 'thanks' | 'other' for one reply.
export function classifyFollowUp(text) {
  const t = clean(text)
  if (!t) return 'thanks'
  if (PERSON.some((re) => re.test(t))) return 'person'
  const words = t.replace(/[^a-z0-9' ]/g, ' ').split(' ').filter(Boolean)
  if (THANKS.test(t) && words.length <= 14 && !/\bbut\b|\?/.test(t) ) return 'thanks'
  return 'other'
}

const event = (text, at) => ({ event: true, text, at })

// Turns the employee's new message(s) on an AI-answered ticket into the changes to make.
// `msgs` are { text, at, messageId }. Returns { kind, patch, confirmation }.
//   kind          'thanks' | 'person' | 'other'
//   patch         what to change on the ticket (always includes the new messages in the thread)
//   confirmation  the email to send the employee, or null when nothing needs sending
export function followUp(t, msgs, now = new Date()) {
  const incoming = msgs.map((m) => ({ inbound: true, from: t.customer, text: m.text, at: m.at, ...(m.messageId ? { messageId: m.messageId } : {}) }))
  const kinds = msgs.map((m) => classifyFollowUp(m.text))
  const kind = kinds.includes('person') ? 'person' : kinds.every((k) => k === 'thanks') ? 'thanks' : 'other'
  if (kind === 'thanks') return { kind, patch: { replies: [...t.replies, ...incoming] }, confirmation: null }

  const text = msgs.map((m) => m.text).join('\n')
  // The same safety rules as for a new email decide whether this is urgent. Saying "urgent" or "asap" does not count.
  const safety = mustGoToPerson(t.subject, text) || { resolved: true }
  const urgent = Boolean(t.urgent || safety.urgent)
  const at = now.toISOString()
  const dueAt = dueIn(urgent, now)
  const who = agentName(t.assignee)
  const first = (t.customer || 'there').split(' ')[0]
  const when = new Date(dueAt).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' })
  const extra = !safety.resolved && safety.extra ? `${safety.extra} ` : ''
  const confirmation = kind === 'person'
    ? `Hi ${first}, sorry the automatic answer did not help. ${extra}${who} from the HR team will reply to you personally by ${when}. Our HR team works ${WORK.label}.`
    : `Hi ${first}, thanks for your reply. ${extra}We passed it to ${who} from the HR team, who will reply to you personally by ${when}. Our HR team works ${WORK.label}.`
  const quoted = text.length > 140 ? `${text.slice(0, 140).trim()}…` : text
  const why = kind === 'person' ? 'asked for a person' : 'wrote back with a follow-up'
  const tags = new Set((t.tags || []).filter((g) => g !== 'ai-resolved'))
  tags.add(kind === 'person' ? 'asked-for-person' : 'follow-up')
  if (!safety.resolved) (safety.tags || []).forEach((g) => tags.add(g))

  return {
    kind,
    confirmation,
    patch: {
      status: 'Open', resolvedByAI: false, urgent, dueAt, escalatedAt: at, escalatedBecause: kind, tags: [...tags],
      note: `The employee ${why} after the automatic answer: "${quoted}" ${who} replies by ${when}.${safety.resolved ? '' : ' ' + safety.note}`,
      replies: [
        ...t.replies, ...incoming,
        event(`The employee ${why} after the automatic answer. Moved to ${who}'s list, due ${when}.`, at),
        { from: 'HR Assistant (automated)', text: confirmation, at, email: true, ai: true },
      ],
    },
  }
}
