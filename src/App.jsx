import { useEffect, useState } from 'react'
import { AGENTS, HR_ADDRESS, KNOWLEDGE, SEED_TICKETS } from './data'
import { ackText, topicLabel, triage } from './triage'

const KEY = 'hr-desk-tickets-v2'
const load = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) return v } catch { /* ignore */ }
  return SEED_TICKETS
}
const agent = (id) => AGENTS.find((a) => a.id === id)
const agentName = (id) => agent(id)?.name ?? 'Unassigned'
const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
const ago = (iso) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}
const STATUSES = ['Open', 'In progress', 'On hold', 'Closed']
const PRIORITIES = ['Urgent', 'Normal']
const DEPTS = Object.keys({ benefits: 1, payroll: 1, timeoff: 1, onboarding: 1, relations: 1, general: 1 })

const NAV = [['tickets', '🎫', 'Tickets'], ['dashboard', '📊', 'Dashboard'], ['kb', '📚', 'Knowledge'], ['settings', '⚙️', 'Setup']]

export default function App() {
  const [tickets, setTickets] = useState(load)
  const [page, setPage] = useState('tickets')
  const [openId, setOpenId] = useState(null)
  const [composing, setComposing] = useState(false)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(tickets)) } catch { /* ignore */ } }, [tickets])

  const update = (id, patch) => setTickets((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const addTicket = (t) => { setTickets((p) => [t, ...p]); setOpenId(t.id); setPage('tickets') }
  const openCount = tickets.filter((t) => t.status !== 'Closed').length

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">HR</div>
        {NAV.map(([k, icon, label]) => (
          <button key={k} className={page === k ? 'on' : ''} onClick={() => { setPage(k); setOpenId(null) }} aria-label={label}>
            <span>{icon}</span><small>{label}</small>
          </button>
        ))}
      </aside>
      <div className="main">
        <header className="topbar">
          <b className="title">HR Desk <span className="ai-tag">AI</span></b>
          <button className="btn primary" onClick={() => setComposing(true)}>＋ <span className="hide-s">Simulate incoming </span>email</button>
        </header>
        <div className="content">
          {page === 'tickets' && (openId
            ? <Detail ticket={tickets.find((t) => t.id === openId)} update={update} back={() => setOpenId(null)} />
            : <List tickets={tickets} open={setOpenId} reset={() => setTickets(SEED_TICKETS)} />)}
          {page === 'dashboard' && <Dashboard tickets={tickets} />}
          {page === 'kb' && <Knowledge />}
          {page === 'settings' && <Setup openCount={openCount} />}
        </div>
      </div>
      {composing && <Compose tickets={tickets} onClose={() => setComposing(false)} onCreate={(t) => { addTicket(t); setComposing(false) }} />}
    </div>
  )
}

const Prio = ({ urgent }) => <span className={`badge ${urgent ? 'red' : 'grey'}`}>{urgent ? '● Urgent' : 'Normal'}</span>
const Status = ({ s }) => <span className={`badge st-${s.replace(' ', '')}`}>{s}</span>
const Avatar = ({ name }) => <span className="avatar">{initials(name)}</span>

function List({ tickets, open, reset }) {
  const [view, setView] = useState('all')
  const [q, setQ] = useState('')
  const views = [
    ['all', 'All tickets', tickets.length],
    ['open', 'Open', tickets.filter((t) => t.status === 'Open').length],
    ['urgent', 'Urgent', tickets.filter((t) => t.urgent && t.status !== 'Closed').length],
    ['ai', 'Resolved by AI', tickets.filter((t) => t.resolvedByAI).length],
    ['closed', 'Closed', tickets.filter((t) => t.status === 'Closed').length],
    ...AGENTS.map((a) => [a.id, a.name, tickets.filter((t) => t.assignee === a.id && t.status !== 'Closed').length]),
  ]
  const match = (t) => view === 'all' ? true : view === 'open' ? t.status === 'Open' : view === 'urgent' ? t.urgent && t.status !== 'Closed' : view === 'ai' ? t.resolvedByAI : view === 'closed' ? t.status === 'Closed' : t.assignee === view
  const text = q.trim().toLowerCase()
  const rows = tickets.filter(match)
    .filter((t) => !text || `${t.id} ${t.subject} ${t.customer} ${t.email}`.toLowerCase().includes(text))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const label = views.find((v) => v[0] === view)[1]

  return (
    <div className="split">
      <nav className="views">
        <div className="views-h">Views</div>
        {views.slice(0, 5).map(([k, n, c]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{n}<em>{c}</em></button>)}
        <div className="views-h">Agents</div>
        {views.slice(5).map(([k, n, c]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{n}<em>{c}</em></button>)}
        <button className="reset" onClick={reset}>Reset sample data</button>
      </nav>
      <section className="panel grow">
        <div className="panel-h">
          <h2>{label} <span className="count">{rows.length}</span></h2>
          <input className="search" placeholder="Search tickets, people…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table">
          <div className="tr th"><span>Ticket</span><span>Contact</span><span>Status</span><span>Priority</span><span>Owner</span><span>Created</span></div>
          {rows.length === 0 && <p className="empty">No tickets in this view.</p>}
          {rows.map((t) => (
            <button key={t.id} className="tr" onClick={() => open(t.id)}>
              <span className="subj"><b>{t.subject}</b><small>#{t.id} · {topicLabel(t.topic)}{t.resolvedByAI ? ' · 🤖 AI replied' : ''}</small></span>
              <span className="contact"><Avatar name={t.customer} />{t.customer}</span>
              <span><Status s={t.status} /></span>
              <span><Prio urgent={t.urgent} /></span>
              <span className="owner">{agentName(t.assignee)}</span>
              <span className="when">{ago(t.createdAt)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function Detail({ ticket: t, update, back }) {
  const [text, setText] = useState('')
  const [tab, setTab] = useState('reply')
  if (!t) return <button className="btn" onClick={back}>← Back to tickets</button>
  const thread = [{ from: t.customer, text: t.body, at: t.createdAt, inbound: true }, ...t.replies]

  const send = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    const m = tab === 'note'
      ? { from: agentName(t.assignee), text, at: new Date().toISOString(), note: true }
      : { from: agentName(t.assignee), text, at: new Date().toISOString(), email: true }
    update(t.id, { replies: [...t.replies, m], status: tab === 'reply' && t.status === 'Open' ? 'In progress' : t.status })
    setText('')
  }

  return (
    <div className="detail">
      <div className="crumbs"><button className="link" onClick={back}>← All tickets</button> <span>#{t.id}</span></div>
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-h col">
            <h2>{t.subject}</h2>
            <div className="row"><Status s={t.status} /><Prio urgent={t.urgent} /><span className="badge grey">{topicLabel(t.topic)}</span>{t.resolvedByAI && <span className="badge violet">🤖 Resolved by AI</span>}</div>
          </div>
          <div className="ai-box"><b>🤖 AI agent</b><p>{t.note}</p></div>
          <div className="thread">
            {thread.map((m, i) => (
              <article key={i} className={`msg ${m.inbound ? 'in' : m.note ? 'note' : 'out'}`}>
                <Avatar name={m.from} />
                <div>
                  <div className="msg-h"><b>{m.from}</b>{m.inbound && <small> &lt;{t.email}&gt;</small>}<small> · {m.note ? '🔒 Private note' : m.inbound ? '✉️ Received by email' : m.ai ? '✉️ Sent by AI by email' : '✉️ Sent by email'} · {ago(m.at)}</small></div>
                  <p>{m.text}</p>
                </div>
              </article>
            ))}
          </div>
          <form className="editor" onSubmit={send}>
            <div className="tabs">
              <button type="button" className={tab === 'reply' ? 'on' : ''} onClick={() => setTab('reply')}>Reply</button>
              <button type="button" className={tab === 'note' ? 'on' : ''} onClick={() => setTab('note')}>Private note</button>
            </div>
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={tab === 'reply' ? `Reply to ${t.customer} (sent by email)…` : 'Only your team can see this…'} />
            <div className="row between">
              <small className="mute">{tab === 'reply' ? `To: ${t.email}` : 'Not sent to the employee'}</small>
              <button className="btn primary" type="submit">{tab === 'reply' ? 'Send' : 'Add note'}</button>
            </div>
          </form>
        </section>

        <aside className="panel props">
          <h3>Ticket properties</h3>
          <label>Status<select value={t.status} onChange={(e) => update(t.id, { status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Priority<select value={t.urgent ? 'Urgent' : 'Normal'} onChange={(e) => update(t.id, { urgent: e.target.value === 'Urgent' })}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Ticket owner<select value={t.assignee} onChange={(e) => update(t.id, { assignee: e.target.value })}>{AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Department<select value={t.topic} onChange={(e) => update(t.id, { topic: e.target.value })}>{DEPTS.map((d) => <option key={d} value={d}>{topicLabel(d)}</option>)}</select></label>
          <dl>
            <dt>Contact</dt><dd>{t.customer}<br /><small>{t.email}</small></dd>
            <dt>Channel</dt><dd>Email</dd>
            <dt>Created</dt><dd>{ago(t.createdAt)}</dd>
          </dl>
        </aside>
      </div>
    </div>
  )
}

function Compose({ tickets, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const examples = [
    ['How many vacation days do I get?', 'Hi, how many vacation days do I get per year?'],
    ['Missing overtime pay', 'I have not been paid for my overtime last week. Please fix this asap.'],
    ['Issue with my manager', 'My manager has been treating me unfairly and I would like to talk to someone confidentially.'],
  ]
  const submit = (e) => {
    e.preventDefault()
    const r = triage(subject, body)
    const now = new Date().toISOString()
    const text = r.resolved ? r.answer : ackText(name, agentName(r.assignee), r.urgent, r.sensitive)
    onCreate({
      id: Math.max(1000, ...tickets.map((x) => x.id)) + 1, subject, body, customer: name || 'Employee',
      email: email || 'employee@examplecompany.com', status: r.resolved ? 'Closed' : 'Open', urgent: r.urgent,
      topic: r.topic, assignee: r.assignee, createdAt: now, resolvedByAI: r.resolved, channel: 'Email', note: r.note,
      replies: [{ from: 'HR Assistant (AI)', text, at: now, email: true, ai: true }],
    })
  }
  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Simulate an incoming email</h2>
        <p className="mute small">Stands in for a real email arriving at the HR inbox ({HR_ADDRESS}). The AI agent reads it, creates the ticket and replies when it can.</p>
        <div className="row">{examples.map(([s, b]) => <button key={s} type="button" className="chip" onClick={() => { setSubject(s); setBody(b) }}>{s}</button>)}</div>
        <label>From (name)<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Kim" /></label>
        <label>From (email)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex.kim@examplecompany.com" /></label>
        <label>Subject<input required value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label>Message<textarea required rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <div className="row between"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" type="submit">Create ticket</button></div>
      </form>
    </div>
  )
}

function Dashboard({ tickets }) {
  const open = tickets.filter((t) => t.status !== 'Closed')
  const ai = tickets.filter((t) => t.resolvedByAI).length
  const byTopic = DEPTS.map((d) => [d, tickets.filter((t) => t.topic === d).length])
  const max = Math.max(1, ...byTopic.map((x) => x[1]))
  const stats = [['Open tickets', open.length], ['Urgent', open.filter((t) => t.urgent).length], ['Resolved by AI', ai], ['AI resolution rate', tickets.length ? `${Math.round((ai / tickets.length) * 100)}%` : '–']]
  return (
    <div className="dash">
      <div className="stats">{stats.map(([k, v]) => <div key={k} className="stat"><small>{k}</small><b>{v}</b></div>)}</div>
      <section className="panel pad"><h3>Tickets by department</h3>
        {byTopic.map(([d, n]) => <div key={d} className="bar"><span>{topicLabel(d)}</span><i style={{ width: `${(n / max) * 100}%` }} /><em>{n}</em></div>)}
      </section>
      <section className="panel pad"><h3>Open tickets by owner</h3>
        {AGENTS.map((a) => <div key={a.id} className="bar"><span>{a.name}</span><i style={{ width: `${(open.filter((t) => t.assignee === a.id).length / Math.max(1, open.length)) * 100}%` }} /><em>{open.filter((t) => t.assignee === a.id).length}</em></div>)}
      </section>
    </div>
  )
}

function Knowledge() {
  return (
    <section className="panel pad"><h2>Knowledge base</h2>
      <p className="mute">These are the answers the AI agent can send on its own. Anything else goes to a person.</p>
      {KNOWLEDGE.map((k) => <div key={k.keys[0]} className="kb"><span className="badge grey">{topicLabel(k.topic)}</span><b>Triggers on: {k.keys.join(', ')}</b><p>{k.answer}</p></div>)}
    </section>
  )
}

function Setup({ openCount }) {
  return (
    <section className="panel pad"><h2>Email connection</h2>
      <p><span className="badge red">Not connected</span></p>
      <p>Right now tickets are created with the <b>Simulate incoming email</b> button. A real HR inbox (for example a Gmail test account) can't be read by the website itself: it needs a small helper that runs on Google's side and hands each new email to this app. That is a setup step for your instructor.</p>
      <p className="mute small">{openCount} tickets are currently open. Sample data only.</p>
    </section>
  )
}
