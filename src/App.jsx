import { useEffect, useState } from 'react'
import { AGENTS, CANNED, SEED_TICKETS } from './data'
import { Canned, Compose, Dashboard, Knowledge, Setup } from './Pages'
import { Detail, List } from './Tickets'
import { agentName, canSee, dueIn } from './util'

const store = (key, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(key)); if (v) return v } catch { /* ignore */ }
  return fallback
}
const NAV = [['tickets', '🎫', 'Tickets'], ['dashboard', '📊', 'Dashboard'], ['replies', '💬', 'Replies'], ['kb', '📚', 'Knowledge'], ['settings', '⚙️', 'Setup']]

export default function App() {
  const [tickets, setTickets] = useState(() => store('hr-desk-tickets-v3', SEED_TICKETS))
  const [canned, setCanned] = useState(() => store('hr-desk-canned-v1', CANNED))
  const [me, setMe] = useState(() => store('hr-desk-me', 'dana'))
  const [page, setPage] = useState('tickets')
  const [openId, setOpenId] = useState(null)
  const [composing, setComposing] = useState(false)
  const [toast, setToast] = useState('')
  useEffect(() => { try { localStorage.setItem('hr-desk-tickets-v3', JSON.stringify(tickets)); localStorage.setItem('hr-desk-canned-v1', JSON.stringify(canned)); localStorage.setItem('hr-desk-me', JSON.stringify(me)) } catch { /* ignore */ } }, [tickets, canned, me])
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id) }, [toast])

  const mine = tickets.filter((t) => canSee(t, me))
  const update = (id, patch) => setTickets((p) => p.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)))
  const event = (t, text) => ({ event: true, text, at: new Date().toISOString() })

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
        <div className="brand">HR</div>
        {NAV.map(([k, icon, label]) => (
          <button key={k} className={page === k ? 'on' : ''} onClick={() => go(k)} aria-label={label}><span>{icon}</span><small>{label}</small></button>
        ))}
      </aside>
      <div className="main">
        <header className="topbar">
          <b className="title">HR Desk <span className="ai-tag">AI</span></b>
          <div className="row">
            <label className="me"><small>Signed in as</small>
              <select value={me} onChange={(e) => switchUser(e.target.value)}>{AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </label>
            <button className="btn primary" onClick={() => setComposing(true)}>＋ <span className="hide-s">Simulate </span>email</button>
          </div>
        </header>
        <div className="content">
          {page === 'tickets' && (openId
            ? <Detail key={openId} ticket={tickets.find((t) => t.id === openId)} all={mine} me={me} canned={canned} update={update} transfer={transfer} merge={merge} toast={setToast} back={() => setOpenId(null)} />
            : <List tickets={mine} me={me} open={setOpenId} reset={() => { setTickets(SEED_TICKETS); setCanned(CANNED) }} />)}
          {page === 'dashboard' && <Dashboard tickets={mine} me={me} />}
          {page === 'replies' && <Canned canned={canned} setCanned={setCanned} />}
          {page === 'kb' && <Knowledge />}
          {page === 'settings' && <Setup me={me} />}
        </div>
      </div>
      {composing && <Compose tickets={tickets} onClose={() => setComposing(false)} onCreate={onCreate} />}
      {toast && <div className="toast" role="status" onClick={() => setToast('')}>{toast}</div>}
    </div>
  )
}
