import { AGENTS, KNOWLEDGE, SENSITIVE_WORDS, TOPIC_LABELS, TOPIC_WORDS, URGENT_WORDS } from './data'

// Stand-in for the AI agent. It reads an incoming HR email and decides:
// 1) can I answer this myself? 2) if not, who should handle it? 3) is it urgent?
// It runs in the browser with simple keyword rules so the flow can be tried
// without a server or API key. A real AI model can replace this later.
export function triage(subject, body) {
  const text = `${subject} ${body}`.toLowerCase()
  const sensitive = SENSITIVE_WORDS.find((w) => text.includes(w))
  const urgentHits = URGENT_WORDS.filter((w) => text.includes(w))
  const urgent = urgentHits.length > 0

  const hit = !sensitive && KNOWLEDGE.find((k) => k.keys.some((w) => text.includes(w)))
  if (hit) {
    return { resolved: true, topic: hit.topic, urgent: false, answer: hit.answer, assignee: AGENTS.find((a) => a.topics.includes(hit.topic)).id,
      note: 'Answered automatically from the HR answers list. No person needed.' }
  }

  let topic = sensitive ? 'relations' : 'general'
  let best = 0
  if (!sensitive) {
    for (const [t, words] of Object.entries(TOPIC_WORDS)) {
      const score = words.filter((w) => text.includes(w)).length
      if (score > best) { best = score; topic = t }
    }
  }
  const agent = AGENTS.find((a) => a.topics.includes(topic))
  const note = (sensitive
    ? `Sensitive subject ("${sensitive}"): the assistant never answers these, a person handles it. `
    : `No ready answer. `) +
    `Routed to ${agent.skill}${best || sensitive ? '' : ' (no clear topic)'}. ` +
    (urgent ? `Marked urgent: "${urgentHits[0]}".` : 'Not urgent.')
  return { resolved: false, topic, urgent, assignee: agent.id, note, sensitive: Boolean(sensitive) }
}

export const topicLabel = (t) => TOPIC_LABELS[t] ?? t

export function ackText(name, agentName, urgent, sensitive) {
  const first = (name || 'there').split(' ')[0]
  return `Hi ${first}, thanks for contacting HR. ` +
    (sensitive ? `This is a confidential matter, so a person on the team will handle it personally. ` : '') +
    `We passed your message to ${agentName}.` +
    (urgent ? ' It is marked urgent, so it will be looked at first.' : ' You can expect a reply within one business day.')
}
