import { useState } from 'react'
import { AGENTS, HR_ADDRESS, KNOWLEDGE } from './data'
import { ackText, topicLabel, triage } from './triage'
import { agentName, dueInfo, pendingAdviceFor } from './util'

const DEPTS = ['benefits', 'payroll', 'timeoff', 'onboarding', 'relations', 'general']

export function Compose({ tickets, onClose, onCreate }) {
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
      tags: [...(r.resolved ? ['ai-resolved'] : []), ...(r.sensitive ? ['sensitive'] : [])],
      replies: [{ from: 'HR Assistant (AI)', text, at: now, email: true, ai: true }],
    })
  }
  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Simulate an incoming email</h2>
        <p className="mute small">Stands in for a real email arriving at the HR inbox ({HR_ADDRESS}). The AI agent reads it, creates the ticket, replies when it can, and assigns it to the right person.</p>
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

export function Dashboard({ tickets, me }) {
  const owned = tickets.filter((t) => t.assignee === me)
  const open = owned.filter((t) => t.status !== 'Closed')
  const ai = owned.filter((t) => t.resolvedByAI).length
  const overdue = open.filter((t) => dueInfo(t)?.cls === 'red').length
  const byTopic = DEPTS.map((d) => [d, owned.filter((t) => t.topic === d).length])
  const max = Math.max(1, ...byTopic.map((x) => x[1]))
  const stats = [['My open tickets', open.length], ['Urgent', open.filter((t) => t.urgent).length], ['Overdue', overdue], ['Advice requested', tickets.filter((t) => pendingAdviceFor(t, me).length).length], ['Resolved by AI', ai], ['Closed', owned.filter((t) => t.status === 'Closed').length]]
  return (
    <div className="dash">
      <p className="mute">Showing only {agentName(me)}'s tickets.</p>
      <div className="stats">{stats.map(([k, v]) => <div key={k} className="stat"><small>{k}</small><b>{v}</b></div>)}</div>
      <section className="panel pad"><h3>My tickets by department</h3>
        {byTopic.map(([d, n]) => <div key={d} className="bar"><span>{topicLabel(d)}</span><i style={{ width: `${(n / max) * 100}%` }} /><em>{n}</em></div>)}
      </section>
    </div>
  )
}

export function Knowledge() {
  return (
    <section className="panel pad"><h2>Knowledge base</h2>
      <p className="mute">These are the answers the AI agent can send on its own. Anything else goes to a person.</p>
      {KNOWLEDGE.map((k) => <div key={k.keys[0]} className="kb"><span className="badge grey">{topicLabel(k.topic)}</span><b>Triggers on: {k.keys.join(', ')}</b><p>{k.answer}</p></div>)}
    </section>
  )
}

export function Canned({ canned, setCanned }) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const add = (e) => {
    e.preventDefault()
    setCanned([...canned, { id: Date.now(), name, text }])
    setName(''); setText('')
  }
  return (
    <section className="panel pad"><h2>Canned replies</h2>
      <p className="mute">Saved replies you can insert into any ticket. <code>{'{name}'}</code> becomes the employee's first name and <code>{'{agent}'}</code> becomes your name.</p>
      {canned.map((c) => (
        <div key={c.id} className="kb"><div className="row between grow"><b>{c.name}</b><button className="link" onClick={() => setCanned(canned.filter((x) => x.id !== c.id))}>Delete</button></div><p className="pre">{c.text}</p></div>
      ))}
      <form className="kb" onSubmit={add}><b>Add a canned reply</b>
        <input required placeholder="Name, e.g. Interview scheduling" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea required rows={4} placeholder="Hi {name}, …" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn primary" type="submit">Save reply</button>
      </form>
    </section>
  )
}

export function Setup({ me }) {
  return (
    <>
      <section className="panel pad"><h2>Signing in (demo)</h2>
        <p>You are signed in as <b>{agentName(me)}</b>. The "Signed in as" menu at the top lets you try the team from each person's point of view, and each person only sees their own tickets and any ticket they were asked to advise on.</p>
        <p className="mute small">This is a demo: there are no real accounts or passwords yet, and tickets are stored only in this browser. Real private logins and shared tickets need a server, which is a setup step for your instructor. Team members: {AGENTS.map((a) => a.name).join(', ')}.</p>
      </section>
      <section className="panel pad"><h2>Email connection</h2>
        <p><span className="badge red">Not connected</span></p>
        <p>Right now tickets are created with the <b>Simulate email</b> button. A real HR inbox (for example a Gmail test account) can't be read by the website itself: it needs a small helper that runs on Google's side and hands each new email to this app. That is a setup step for your instructor.</p>
      </section>
    </>
  )
}
