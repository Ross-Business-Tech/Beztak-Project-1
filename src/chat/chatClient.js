// How the chat gets its answers. It asks the email helper first (that is where the AI key lives, kept secret).
// If the helper can't be reached, the same rules run here in the browser without the AI (word matching only),
// so the chat always answers from the manual, never from guesses.
import { chatAnswer } from '../aiAgent'
import { DEFAULT_HELPER_URL } from '../helper'

const post = async (path, body, ms = 30000) => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(DEFAULT_HELPER_URL.replace(/\/$/, '') + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw Object.assign(new Error(data.error || `Error ${r.status}`), { status: r.status })
    return data
  } finally { clearTimeout(timer) }
}

// `meta` = { conversationId, name, email }: the helper saves the conversation as one ticket for the HR and Ops team.
// The earlier messages go along only when they are needed: a question that points back ("what about it?", "how far ahead?")
// or a reply after the chat passed the question to a person (to say it is urgent). A new question is sent on its own,
// so its answer never mixes in the answer to the question before it.
const POINTS_BACK = /\b(it|that|this|they|them|those|these|there|same|one|what about|how about|what if|and if|also)\b/i
const needsHistory = (message, history) => {
  const lastBot = [...history].reverse().find((m) => m.role === 'assistant')
  return Boolean(lastBot) && (lastBot.kind === 'person' || lastBot.kind === 'unknown' || String(message).trim().split(/\s+/).length <= 3 || POINTS_BACK.test(message))
}

export async function askChat(message, history, meta = {}) {
  const input = { message, history: (needsHistory(message, history) ? history : []).map((m) => ({ role: m.role, text: m.text, kind: m.kind })), conversationId: meta.conversationId, name: meta.name, email: meta.email }
  try {
    const res = await post('/chat', input)
    if (res && typeof res.text === 'string' && res.kind) return { ...res, via: 'helper' }
    throw new Error('Unexpected answer')
  } catch (e) {
    if (e.status === 429) return { kind: 'unknown', text: e.message, refs: [], related: [], via: 'limit' }
    return { ...(await chatAnswer({}, input)), via: 'browser' }
  }
}

// "Talk to a person": the conversation becomes a ticket for the HR team, who reply by email.
export const handToPerson = (payload) => post('/chat/escalate', payload, 20000)
