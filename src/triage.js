import { AGENTS, KNOWLEDGE, TOPIC_WORDS, URGENT_WORDS } from './data'

// Stand-in for the AI agent. It runs in the browser using simple keyword rules,
// so the whole flow can be tried without a server or API key.
// A real AI model can replace this function later behind a here.now proxy route.
export function triage(subject, body) {
  const text = `${subject} ${body}`.toLowerCase()

  const hit = KNOWLEDGE.find((k) => k.keys.some((w) => text.includes(w)))
  if (hit) return { resolved: true, answer: hit.answer, topic: hit.topic }

  let topic = 'general'
  let best = 0
  for (const [t, words] of Object.entries(TOPIC_WORDS)) {
    const score = words.filter((w) => text.includes(w)).length
    if (score > best) { best = score; topic = t }
  }
  const urgentHits = URGENT_WORDS.filter((w) => text.includes(w))
  const urgent = urgentHits.length > 0
  const agent = AGENTS.find((a) => a.topics.includes(topic))
  const note =
    `Routed to ${agent.skill}${best ? ` (matched ${topic} wording)` : ' (no clear topic)'}. ` +
    (urgent ? `Marked urgent: "${urgentHits[0]}".` : 'Not urgent.')
  return { resolved: false, topic, urgent, assignee: agent.id, note }
}
