// Every ticket a person answers gets a reply the AI prepared, flagged "check before sending".
// Nothing here is ever sent on its own: an HR person reads it, then either sends it as is
// ("Ready to send") or edits it first. Edited and approved replies are remembered, so the next
// similar question starts from the HR team's own wording (the AI "learns from its mistakes").
import { manualDraft, mustGoToPerson, words } from './aiAgent'
import { agentName } from './util'

// How sure the AI is about the draft, shown to HR as a label.
export const CONFIDENCE = {
  learned: { label: 'High: an HR person wrote this answer before', color: 'green' },
  AI: { label: 'Medium: written by the AI from the manual', color: 'yellow' },
  manual: { label: 'Medium: closest answer in the manual', color: 'yellow' },
  unsure: { label: 'Low: the AI was not sure, so it left blanks for you', color: 'orange' },
  starter: { label: 'Low: only a starting point', color: 'red' },
}

// Past replies HR approved or corrected, most similar first. Returns null when none is close enough.
export function learnedMatch(subject, body, learned = []) {
  const q = new Set(words(`${subject} ${body}`))
  let best = null
  for (const l of learned) {
    const w = new Set(l.keywords ? l.keywords.split(' ') : words(l.question || ''))
    const shared = [...q].filter((x) => w.has(x)).length
    const score = shared / Math.max(1, Math.min(q.size, w.size))
    if (shared >= 3 && score >= 0.5 && (!best || score > best.score || (score === best.score && l.at > best.l.at))) best = { l, score }
  }
  return best?.l || null
}

// Blanks HR must fill in before sending.
export const hasBlanks = (x) => /\[(?:Add|Write|HR:)[^\]]*\]/.test(x)

// Turn a stored template ({name}, {agent}) or a manual answer into a full email for this ticket.
const firstName = (n) => (n || 'there').split(' ')[0]
// Removes citations like [HR-2] or [6.3, 13.8] but keeps blanks like [HR: add the date].
const CITE = /\s*\[(?:HR-\d+|\d+\.\d+)(?:\s*,\s*(?:HR-\d+|\d+\.\d+))*\]/g
const wrap = (text, t, me) => `Hi ${firstName(t.customer)},\n\n${text.replace(CITE, '').trim()}\n\nBest,\n${agentName(me)}`
const fillIn = (tpl, t, me) => tpl.replaceAll('{name}', firstName(t.customer)).replaceAll('{agent}', agentName(me))

// Confidential and safety tickets: never reuse past answers and never learn from them.
export const isSensitive = (t) => Boolean(mustGoToPerson(t.subject, t.body)) || (t.tags || []).includes('sensitive')

// The draft for one ticket: { email, kind, refs, title, from }. Always returns something for a
// ticket a person must answer, so HR never starts from a blank page.
export function draftFor(t, me, learned = []) {
  if (isSensitive(t)) {
    // Confidential or safety topics: the AI does not write the content, only a careful opener.
    return { kind: 'starter', sensitive: true, refs: [],
      email: wrap(`Thank you for reaching out, and for trusting us with this. I am handling your message personally and will treat it confidentially.\n\n[Add the next step here: for example a time to talk, or what you need from them.]\n\nIf anyone is in immediate danger, please call 911.`, t, me) }
  }
  const l = learnedMatch(t.subject, t.body, learned)
  if (l) return { kind: 'learned', email: fillIn(l.template, t, me), from: l, refs: [] }
  const d = t.draft || manualDraft(t.subject, t.body)
  if (d) return { kind: d.unsure ? 'unsure' : d.source === 'AI' ? 'AI' : 'manual', email: wrap(d.text, t, me), refs: d.refs || [], title: d.title }
  // Nothing in the manual clearly fits: a polite reply with a blank, never a wrong answer.
  return { kind: 'starter', refs: [],
    email: wrap('Thanks for your question. [Write the answer here: the manual did not have one.]\n\nPlease reply if you need anything else.', t, me) }
}

// A ticket is flagged "needs verification" until a person sends a reply.
export const needsCheck = (t) => !t.resolvedByAI && t.status !== 'Closed' && !t.replies.some((m) => m.email && !m.ai && !m.inbound)

// What gets remembered after HR sends: the email turned back into a reusable template.
export function toLearned(t, me, sent, original) {
  const template = sent.replaceAll(agentName(me), '{agent}').replace(new RegExp(`\\b${firstName(t.customer).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), '{name}')
  // Only the question's keywords are kept, not the employee's message itself.
  return { id: `${t.id}-${Date.now()}`, ticket: t.id, subject: t.subject, keywords: words(`${t.subject} ${t.body}`).join(' '), template, edited: sent.trim() !== original.trim(), by: me, at: new Date().toISOString() }
}
