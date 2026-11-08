import { useEffect, useState } from 'react'
import { AGENTS, CANNED, SEED_DOCS, SEED_TICKETS } from './data'
import { Canned, Compose, Dashboard, Documents, Profile, Setup } from './Pages'
import { Detail, List } from './Tickets'
import { agentName, canSee, dueIn, initials } from './util'

const store = (key, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(key)); if (v) return v } catch { /* ignore */ }
  return fallback
}
const Ico = ({ d }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const NAV = [
  ['tickets', 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z', 'Tickets'],
  ['dashboard', 'M4 20V10M10 20V4M16 20v-7M22 20H2', 'Reports'],
  ['replies', 'M4 5h16v11H9l-5 4z', 'Replies'],
  ['kb', 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7', 'Documents'],
  ['settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z', 'Setup'],
]

export default function App() {
  const [tickets, setTickets] = useState(() => store('hr-desk-tickets-v4', SEED_TICKETS))
  const [canned, setCanned] = useState(() => store('hr-desk-canned-v1', CANNED))
  const [docs, setDocs] = useState(() => store('hr-desk-docs-v1', SEED_DOCS))
  const [me, setMe] = useState(() => store('hr-desk-me', 'dana'))
  const [prefs, setPrefs] = useState(() => ({ theme: 'light', notify: true, ooo: false, ...store('hr-desk-prefs', {}) }))
  const [page, setPage] = useState('tickets')
  const [openId, setOpenId] = useState(null)
  const [composing, setComposing] = useState(false)
  const [toast, setToast] = useState('')
  useEffect(() => { try { localStorage.setItem('hr-desk-tickets-v4', JSON.stringify(tickets)); localStorage.setItem('hr-desk-canned-v1', JSON.stringify(canned)); localStorage.setItem('hr-desk-me', JSON.stringify(me)); localStorage.setItem('hr-desk-docs-v1', JSON.stringify(docs)); localStorage.setItem('hr-desk-prefs', JSON.stringify(prefs)) } catch { /* ignore */ } }, [tickets, canned, me, docs, prefs])
  useEffect(() => { document.documentElement.dataset.theme = prefs.theme }, [prefs.theme])
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
            ? <Detail key={openId} ticket={tickets.find((t) => t.id === openId)} all={mine} me={me} canned={canned} update={update} transfer={transfer} merge={merge} toast={setToast} back={() => setOpenId(null)} />
            : <List tickets={mine} me={me} open={setOpenId} reset={() => { setTickets(SEED_TICKETS); setCanned(CANNED); setDocs(SEED_DOCS) }} />)}
          {page === 'dashboard' && <Dashboard tickets={mine} me={me} />}
          {page === 'replies' && <Canned canned={canned} setCanned={setCanned} />}
          {page === 'kb' && <Documents docs={docs} setDocs={setDocs} />}
          {page === 'profile' && <Profile me={me} tickets={tickets} prefs={prefs} setPrefs={setPrefs} switchUser={switchUser} toast={setToast} reset={() => { setTickets(SEED_TICKETS); setCanned(CANNED); setDocs(SEED_DOCS); setToast('Sample data reset.') }} />}
          {page === 'settings' && <Setup me={me} />}
        </div>
      </div>
      {composing && <Compose tickets={tickets} onClose={() => setComposing(false)} onCreate={onCreate} />}
      {toast && <div className="toast" role="status" onClick={() => setToast('')}>{toast}</div>}
    </div>
  )
}
