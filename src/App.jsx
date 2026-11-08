import { useEffect, useState } from 'react'
import { AGENTS, HR_ADDRESS, SEED_TICKETS } from './data'
import { ackText, topicLabel, triage } from './triage'

const KEY = 'hr-helpdesk-tickets-v1'
const load = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) return v } catch { /* ignore */ }
  return SEED_TICKETS
}
const agentName = (id) => AGENTS.find((a) => a.id === id)?.name ?? 'Unassigned'
const ago = (iso) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}

export default function App() {
  const [tickets, setTickets] = useState(load)
  const [view, setView] = useState('customer')
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(tickets)) } catch { /* ignore */ } }, [tickets])

  const add = (t) => setTickets((p) => [t, ...p])
  const update = (id, patch) => setTickets((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const reset = () => setTickets(SEED_TICKETS)

  return (
    <div className="app">
      <header className="top">
        <div className="logo">🎧 HR Desk <span>AI</span></div>
        <nav>
          <button className={view === 'customer' ? 'on' : ''} onClick={() => setView('customer')}>Send an email</button>
          <button className={view === 'agent' ? 'on' : ''} onClick={() => setView('agent')}>
            Agent desk{tickets.filter((t) => t.status === 'Open').length ? ` (${tickets.filter((t) => t.status === 'Open').length})` : ''}
          </button>
        </nav>
      </header>
      <main>
        {view === 'customer'
          ? <Customer tickets={tickets} add={add} goAgent={() => setView('agent')} />
          : <Desk tickets={tickets} update={update} reset={reset} />}
      </main>
    </div>
  )
}

function Customer({ tickets, add, goAgent }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [result, setResult] = useState(null)
  const examples = [
    ['How many vacation days do I get?', 'Hi, how many vacation days do I get per year?'],
    ['Missing overtime pay', 'I have not been paid for my overtime last week. Please fix this asap.'],
    ['Issue with my manager', 'My manager has been treating me unfairly and I would like to talk to someone confidentially.'],
  ]

  const submit = (e) => {
    e.preventDefault()
    const r = triage(subject, body)
    const who = agentName(r.assignee)
    const reply = r.resolved
      ? { from: 'HR Assistant (AI)', text: r.answer, at: new Date().toISOString(), email: true }
      : { from: 'HR Assistant (AI)', text: ackText(name, who, r.urgent, r.sensitive), at: new Date().toISOString(), email: true }
    const t = {
      id: Math.max(1000, ...tickets.map((x) => x.id)) + 1, subject, body,
      customer: name || 'Employee', email: email || 'employee@examplecompany.com',
      status: r.resolved ? 'Closed' : 'Open', urgent: r.urgent, topic: r.topic,
      assignee: r.assignee, createdAt: new Date().toISOString(), by: 'AI', resolvedByAI: r.resolved,
      note: r.note, replies: [reply],
    }
    add(t)
    setResult({ ticket: t, reply, resolved: r.resolved })
  }
  const again = () => { setResult(null); setSubject(''); setBody('') }

  if (result) {
    const { ticket, reply, resolved } = result
    return (
      <section className="card narrow">
        <h2>📤 Email sent to HR</h2>
        <p className="mute">A ticket was created automatically (#{ticket.id}). Here is what the AI agent did:</p>
        <div className="row">
          <Pill urgent={ticket.urgent} /><span className="chip">{topicLabel(ticket.topic)}</span>
          <span className="chip">{resolved ? 'Resolved by AI' : `Assigned to ${agentName(ticket.assignee)}`}</span>
        </div>
        <p className="ai-note">🤖 {ticket.note}</p>
        <div className="mail">
          <div className="mail-head"><b>From:</b> HR Assistant (AI) &lt;{HR_ADDRESS}&gt;<br /><b>To:</b> {ticket.email}<br /><b>Subject:</b> Re: {ticket.subject}</div>
          <p>{reply.text}</p>
        </div>
        <button className="link" onClick={goAgent}>See it in the HR desk →</button>
        <button className="primary" onClick={again}>Write another email</button>
      </section>
    )
  }

  return (
    <section className="card narrow">
      <h2>✉️ Email HR</h2>
      <p className="mute">This simulates an employee emailing {HR_ADDRESS}. Each email becomes a ticket. The AI replies by email if it can answer; otherwise it sends the ticket to the right HR person.</p>
      <form onSubmit={submit}>
        <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Kim" /></label>
        <label>Your email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex.kim@examplecompany.com" /></label>
        <label>Subject<input required value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label>Message<textarea required rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <button className="primary" type="submit">Send email</button>
      </form>
      <p className="mute small">Try an example:</p>
      <div className="row">
        {examples.map(([s, b]) => <button key={s} className="chip btn" type="button" onClick={() => { setSubject(s); setBody(b) }}>{s}</button>)}
      </div>
    </section>
  )
}

const Pill = ({ urgent }) => <span className={`pill ${urgent ? 'urgent' : 'normal'}`}>{urgent ? '🔥 Urgent' : 'Normal'}</span>

function Desk({ tickets, update, reset }) {
  const [filter, setFilter] = useState('all')
  const [who, setWho] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [reply, setReply] = useState('')

  const list = tickets
    .filter((t) => (filter === 'all' ? true : filter === 'urgent' ? t.urgent && t.status !== 'Closed' : filter === 'ai' ? t.resolvedByAI : t.status === filter))
    .filter((t) => who === 'all' || t.assignee === who)
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || new Date(b.createdAt) - new Date(a.createdAt))
  const sel = tickets.find((t) => t.id === openId)

  const send = (e) => {
    e.preventDefault()
    if (!reply.trim()) return
    update(sel.id, { status: sel.status === 'Open' ? 'In progress' : sel.status, replies: [...sel.replies, { from: agentName(sel.assignee), text: reply, at: new Date().toISOString(), email: true }] })
    setReply('')
  }

  return (
    <div className="desk">
      <section className={`card list ${sel ? 'hide-m' : ''}`}>
        <div className="row between">
          <h2>HR tickets</h2>
          <button className="link" onClick={reset}>Reset sample data</button>
        </div>
        <div className="row">
          {['all', 'urgent', 'Open', 'In progress', 'Closed', 'ai'].map((f) => (
            <button key={f} className={`chip btn ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'urgent' ? '🔥 Urgent' : f === 'ai' ? '🤖 Resolved by AI' : f}</button>
          ))}
        </div>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by agent">
          <option value="all">All agents</option>
          {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.skill}</option>)}
        </select>
        {list.length === 0 && <p className="mute">No tickets here.</p>}
        {list.map((t) => (
          <button key={t.id} className={`ticket ${t.id === openId ? 'sel' : ''}`} onClick={() => setOpenId(t.id)}>
            <div className="row between"><b>#{t.id} {t.subject}</b><Pill urgent={t.urgent} /></div>
            <div className="mute small">{t.customer} · {agentName(t.assignee)} · {t.status} · {ago(t.createdAt)}</div>
          </button>
        ))}
      </section>

      <section className={`card detail ${sel ? '' : 'hide-m'}`}>
        {!sel ? <p className="mute">Pick a ticket to see it.</p> : (
          <>
            <button className="link back" onClick={() => setOpenId(null)}>← All tickets</button>
            <h2>#{sel.id} {sel.subject}</h2>
            <div className="row"><Pill urgent={sel.urgent} /><span className="chip">{topicLabel(sel.topic)}</span><span className="chip">{sel.status}</span></div>
            <p className="ai-note">🤖 AI triage: {sel.note}</p>
            <p className="msg"><b>{sel.customer}</b> &lt;{sel.email}&gt;<br />{sel.body}</p>
            {sel.replies.map((r, i) => <p key={i} className="msg agent"><b>{r.from}</b> · {ago(r.at)}{r.email ? ' · ✉️ emailed to ' + sel.customer : ''}<br />{r.text}</p>)}
            <div className="row">
              <label className="inline">Assigned to
                <select value={sel.assignee} onChange={(e) => update(sel.id, { assignee: e.target.value })}>
                  {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.skill}</option>)}
                </select>
              </label>
              <label className="inline">Status
                <select value={sel.status} onChange={(e) => update(sel.id, { status: e.target.value })}>
                  {['Open', 'In progress', 'Closed'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <button className="chip btn" onClick={() => update(sel.id, { urgent: !sel.urgent })}>{sel.urgent ? 'Mark not urgent' : 'Mark urgent'}</button>
            </div>
            <form onSubmit={send}>
              <textarea rows={3} placeholder="Write a reply (sent to the employee by email)…" value={reply} onChange={(e) => setReply(e.target.value)} />
              <button className="primary" type="submit">Send reply</button>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
