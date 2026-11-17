import { AGENTS } from './data'
import { triage } from './triage'

// Every lesson waiting for approval is assigned to one person on the team: whoever handles the lesson's topic (a benefits
// lesson goes to the benefits specialist), and never the person who wrote it. The same lesson always gets the same person, on every screen.
export function reviewerFor(lesson) {
  const topic = triage(lesson.question || '', lesson.answer || '').topic
  const byTopic = AGENTS.find((a) => a.topics.includes(topic)) || AGENTS[0]
  if (byTopic.name !== lesson.addedBy) return byTopic
  return AGENTS[(AGENTS.indexOf(byTopic) + 1) % AGENTS.length]
}

// The lessons waiting for this person (an HR team member's id) to approve.
export const pendingFor = (lessons, me) => lessons.filter((l) => l.status === 'pending' && reviewerFor(l).id === me)
