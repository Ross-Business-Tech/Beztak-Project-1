import { useEffect, useRef, useState } from 'react'
import { AGENTS, CANNED, SEED_DOCS, SEED_TICKETS } from './data'
import { Canned, Compose, Dashboard, Documents, Profile, Setup } from './Pages'
import GapTracker from './GapTracker'
import Guardrails from './Guardrails'
import { Detail, List, VIEW_NAMES } from './Tickets'
import { DEFAULT_HELPER_URL, helperCall } from './helper'
import { followUp } from './escalate'
import { ackText, triage } from './triage'
import { agentName, canSee, dueIn, initials } from './util'

const store = (key, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(key)); if (v) return v } catch { /* ignore */ }
  return fallback
}
const Ico = ({ d }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const NAV = [
  ['tickets', 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z', 'Tickets'],
  ['dashboard', 'M4 20V10M10 20V4M16 20v-7M22 20H2', 'Reports'],
  ['gaps', 'M12 3l9 16H3zM12 10v4M12 17h.01', 'Gaps'],
  ['replies', 'M4 5h16v11H9l-5 4z', 'Replies'],
  ['kb', 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7', 'Documents'],
  ['settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z', 'Setup'],
]

export default function App() {
  const [tickets, setTickets] = useState(() => store('hr-desk-tickets-v5', SEED_TICKETS))
  const [canned, setCanned] = useState(() => store('hr-desk-canned-v1', CANNED))
  const [docs, setDocs] = useState(() => store('hr-desk-docs-v2', SEED_DOCS))
  const [me, setMe] = useState(() => store('hr-desk-me', 'dana'))
  const [prefs, setPrefs] = useState(() => ({ theme: 'light', notify: true, ooo: false, ...store('hr-desk-prefs', {}) }))
  const [helper, setHelper] = useState(() => ({ url: DEFAULT_HELPER_URL, token: '', ...store('hr-desk-helper', {}) }))
  const [nav, setNav] = useState({ view: 'mine' })
  // Guardrails is a back-office page for the project team: not in the menu, opened from Setup or /#guardrails.
  const [page, setPage] = useState(() => (location.hash === '#guardrails' ? 'guardrails' : 'tickets'))
  useEffect(() => { if (page !== 'guardrails' && location.hash === '#guardrails') history.replaceState(null, '', location.pathname + location.search) }, [page])
  const [openId, setOpenId] = useState(null)
  const [composing, setComposing] = useState(false)
  useEffect(() => { const f = () => { if (location.hash === '#guardrails') { setPage('guardrails'); setOpenId(null) } }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  const [toast, setToast] = useState('')
  useEffect(() => { try { localStorage.setItem('hr-desk-tickets-v5', JSON.stringify(tickets)); localStorage.setItem('hr-desk-canned-v1', JSON.stringify(canned)); localStorage.setItem('hr-desk-me', JSON.stringify(me)); localStorage.setItem('hr-desk-docs-v2', JSON.stringify(docs)); localStorage.setItem('hr-desk-prefs', JSON.stringify(prefs)); localStorage.setItem('hr-desk-helper', JSON.stringify(helper)) } catch { /* ignore */ } }, [tickets, canned, me, docs, prefs, helper])
  useEffect(() => { document.documentElement.dataset.theme = prefs.theme }, [prefs.theme])
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id) }, [toast])

  const ticketsRef = useRef(tickets)
  useEffect(() => { ticketsRef.current = tickets }, [tickets])
  const syncing = useRef(false)
  // Every 30 seconds: pull new emails from the helper, turn them into tickets, let the
  // AI agent answer what it can (sent by email), and attach customer follow-ups.
  useEffect(() => {
    if (!helper.token || !helper.url) return
    const parse = (from) => { const m = from.match(/^\s*"?([^"<]*?)"?\s*<(.+)>\s*$/); return m ? { name: m[1] || m[2], email: m[2] } : { name: from, email: from } }
    const run = async () => {
      if (syncing.current) return
      syncing.current = true
      try {
        const remote = await helperCall(helper, '/tickets')
        const cur = ticketsRef.current
        const created = []
        const follow = {}
        let nextId = Math.max(1000, ...cur.map((x) => x.id))
        for (const r of [...remote].reverse()) {
          const inbound = r.replies.filter((m) => m.inbound)
          const local = cur.find((x) => x.threadId === r.id)
          if (local) {
            const known = new Set(local.replies.map((m) => m.messageId).filter(Boolean))
            const fresh = inbound.filter((m) => m.messageId !== local.firstMessageId && !known.has(m.messageId))
            if (fresh.length) follow[local.id] = fresh
          } else if (inbound[0] && !/no-?reply|mailer-daemon/i.test(r.customer)) {
            const { name, email } = parse(r.customer)
            // The helper already decided and sent the automatic email. Older tickets without that
            // decision fall back to the simple rules here.
            const res = r.triage || triage(r.subject, inbound[0].text)
            const reply = r.triage?.replyText || (res.resolved ? res.answer : ackText(name, agentName(res.assignee), res.urgent, res.sensitive, res.extra))
            if (!r.triage) { try { await helperCall(helper, `/tickets/${r.id}/reply`, { method: 'POST', body: JSON.stringify({ text: reply, auto: true }) }) } catch { /* ticket is still created */ } }
            const now = new Date().toISOString()
            created.unshift({
              id: ++nextId, threadId: r.id, firstMessageId: inbound[0].messageId, subject: r.subject, body: inbound[0].text, customer: name, email,
              status: res.resolved ? 'Closed' : 'Open', urgent: res.urgent, topic: res.topic, assignee: res.assignee, createdAt: inbound[0].at, dueAt: dueIn(res.urgent, inbound[0].at),
              resolvedByAI: res.resolved, channel: 'Email', note: res.note, advice: [], draft: res.draft || undefined,
              tags: [...(res.resolved ? ['ai-resolved'] : []), ...(res.tags || (res.sensitive ? ['sensitive'] : []))],
              replies: [{ from: 'HR Assistant (automated)', text: reply, at: now, email: true, ai: true }, ...inbound.slice(1).map((m) => ({ inbound: true, from: name, text: m.text, at: m.at, messageId: m.messageId }))],
            })
          }
        }
        const ids = Object.keys(follow)
        // An employee wrote back after the AI answered: a person gets it if they asked for one (or asked something new),
        // and the employee gets an email saying who will reply and when. A plain "thanks" leaves the ticket closed.
        const when = new Date()
        for (const id of ids) {
          const t = cur.find((x) => x.id === Number(id))
          if (!t?.resolvedByAI) continue
          const { confirmation } = followUp(t, follow[id], when)
          if (confirmation && t.threadId) { try { await helperCall(helper, `/tickets/${t.threadId}/reply`, { method: 'POST', body: JSON.stringify({ text: confirmation }) }) } catch { /* the ticket is still escalated */ } }
        }
        if (created.length || ids.length) {
          setTickets((p) => [...created.filter((c) => !p.some((x) => x.threadId === c.threadId)), ...p.map((t) => {
            const f = follow[t.id]
            if (!f) return t
            if (t.resolvedByAI) return { ...t, ...followUp(t, f, when).patch }
            const reopen = t.status === 'Closed'
            return { ...t, status: reopen ? 'Open' : t.status, resolvedByAI: reopen ? false : t.resolvedByAI, tags: reopen ? t.tags.filter((g) => g !== 'ai-resolved') : t.tags,
              note: reopen ? 'The employee replied after the automatic answer, so a person needs to look at it.' : t.note,
              replies: [...t.replies, ...f.map((m) => ({ inbound: true, from: t.customer, text: m.text, at: m.at, messageId: m.messageId }))] }
          })])
          setToast(`${created.length ? `${created.length} new email ticket${created.length > 1 ? 's' : ''}` : ''}${created.length && ids.length ? ' and ' : ''}${ids.length ? `${ids.length} customer repl${ids.length > 1 ? 'ies' : 'y'}` : ''}.`)
        }
      } catch { /* the helper may be offline; try again next time */ }
      syncing.current = false
    }
    run()
    const id = setInterval(run, 30000)
    return () => clearInterval(id)
  }, [helper])

  const mine = tickets.filter((t) => canSee(t, me))
  const update = (id, patch) => setTickets((p) => p.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)))
  const event = (t, text) => ({ event: true, text, at: new Date().toISOString() })

  // The employee wrote back after the AI answered (the demo box on a ticket uses this too).
  const employeeReply = (t, text) => {
    const now = new Date()
    const r = followUp(t, [{ text, at: now.toISOString() }], now)
    update(t.id, (x) => followUp(x, [{ text, at: now.toISOString() }], now).patch)
    setToast(r.kind === 'thanks' ? 'Noted. The ticket stays closed.' : `Sent to ${agentName(t.assignee)}'s list, and the employee is told a person will reply.`)
  }

  const transfer = (t, to) => {
    update(t.id, (x) => ({ assignee: to, replies: [...x.replies, event(x, `${agentName(me)} transferred this ticket to ${agentName(to)}`)] }))
    setOpenId(null)
    setToast(`Ticket #${t.id} transferred to ${agentName(to)}. It is now in their list.`)
  }
  const merge = (src, target) => {
    setTickets((p) => p.map((t) => {
      if (t.id === target.id) return { ...t, tags: [...new Set([...t.tags, ...src.tags])], replies: [...t.replies, event(t, `Ticket #${src.id} was merged into this ticket`), { inbound: true, from: src.customer, text: `(from #${src.id}: ${src.subject})\n${src.body}`, at: src.createdAt }, ...src.replies] }
      if (t.id === src.id) return { ...t, status: 'Closed', mergedInto: target.id, replies: [...t.replies, event(t, `Merged into ticket #${target.id}`)] }
      return t
    }))
    setOpenId(target.id)
    setToast(`Ticket #${src.id} merged into #${target.id}.`)
  }
  const onCreate = (t) => {
    const full = { ...t, tags: t.tags || [], advice: [], dueAt: dueIn(t.urgent) }
    setTickets((p) => [full, ...p])
    setComposing(false)
    if (full.assignee === me) { setOpenId(full.id); setPage('tickets') }
    else setToast(`Ticket #${full.id} was created and assigned to ${agentName(full.assignee)}. You only see your own tickets, so sign in as them to view it.`)
  }
  const go = (k) => { setPage(k); setOpenId(null) }
  const switchUser = (id) => { setMe(id); setOpenId(null); setPage('tickets'); setToast(`Now signed in as ${agentName(id)} (demo).`) }

  return (
    <div className="shell">
      <aside className="rail">
        <button className={`brand${page === 'profile' ? ' on' : ''}`} onClick={() => go('profile')} aria-label="My profile" title="My profile">{initials(agentName(me))}</button>
        {NAV.map(([k, d, label]) => (
          <button key={k} className={page === k ? 'on' : ''} onClick={() => go(k)} aria-label={label}><Ico d={d} /><small>{label}</small></button>
        ))}
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="profile-top" onClick={() => go('profile')} aria-label="My profile">{initials(agentName(me))}</button>
          <b className="title">Beztakets</b>
          <div className="row">
            <label className="me"><small>Signed in as</small>
              <select value={me} onChange={(e) => switchUser(e.target.value)}>{AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </label>
            <button className="btn primary" onClick={() => setComposing(true)}>Simulate email</button>
          </div>
        </header>
        <div className="content">
          {page === 'tickets' && (openId
            ? <Detail backLabel={VIEW_NAMES[nav.view] || 'All tickets'} key={openId} ticket={tickets.find((t) => t.id === openId)} all={mine} me={me} canned={canned} helper={helper} update={update} transfer={transfer} merge={merge} onEmployeeReply={employeeReply} toast={setToast} back={() => setOpenId(null)} />
            : <List nav={nav} setNav={setNav} tickets={mine} me={me} open={setOpenId} reset={() => { setTickets(SEED_TICKETS); setCanned(CANNED); setDocs(SEED_DOCS) }} />)}
          {page === 'dashboard' && <Dashboard tickets={mine} me={me} />}
          {page === 'gaps' && <GapTracker tickets={tickets} theme={prefs.theme} />}
          {page === 'guardrails' && <Guardrails />}
          {page === 'replies' && <Canned canned={canned} setCanned={setCanned} />}
          {page === 'kb' && <Documents docs={docs} setDocs={setDocs} />}
          {page === 'profile' && <Profile helper={helper} setHelper={setHelper} me={me} tickets={tickets} prefs={prefs} setPrefs={setPrefs} switchUser={switchUser} toast={setToast} reset={() => { setTickets(SEED_TICKETS); setCanned(CANNED); setDocs(SEED_DOCS); setToast('Sample data reset.') }} />}
          {page === 'settings' && <Setup me={me} openGuardrails={() => go('guardrails')} />}
        </div>
      </div>
      {composing && <Compose tickets={tickets} onClose={() => setComposing(false)} onCreate={onCreate} />}
      {toast && <div className="toast" role="status" onClick={() => setToast('')}>{toast}</div>}
    </div>
  )
}
