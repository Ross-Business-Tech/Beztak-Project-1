import { AGENTS } from './data'

export const agent = (id) => AGENTS.find((a) => a.id === id)
export const agentName = (id) => agent(id)?.name ?? 'Unassigned'
export const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
const span = (ms) => {
  const m = Math.max(1, Math.round(ms / 60000))
  return m < 60 ? `${m}m` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}
export const ago = (iso) => `${span(Date.now() - new Date(iso))} ago`
export const dueIn = (urgent) => new Date(Date.now() + (urgent ? 4 : 24) * 3600000).toISOString()

// What to show for a ticket's deadline timer.
export function dueInfo(t) {
  if (t.status === 'Closed' || !t.dueAt) return null
  const diff = new Date(t.dueAt) - Date.now()
  if (diff < 0) return { text: `Overdue ${span(-diff)}`, cls: 'red' }
  if (diff < 4 * 3600000) return { text: `Due in ${span(diff)}`, cls: 'amber' }
  return { text: `Due in ${span(diff)}`, cls: 'grey' }
}
export const canSee = (t, me) => t.assignee === me || (t.advice || []).some((a) => a.to === me)
export const pendingAdviceFor = (t, me) => (t.advice || []).filter((a) => a.to === me && !a.answer)
export const toLocalInput = (iso) => {
  const d = new Date(iso)
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export const fill = (text, name, me) => text.replaceAll('{name}', (name || 'there').split(' ')[0]).replaceAll('{agent}', agentName(me))
