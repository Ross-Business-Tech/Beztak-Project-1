import { useState } from 'react'
import { AGENTS, ESCALATIONS, HR_ADDRESS, KNOWLEDGE } from './data'
import { ackText, topicLabel, triage } from './triage'
import { agentName, dueInfo, pendingAdviceFor } from './util'

const DEPTS = ['benefits', 'payroll', 'timeoff', 'onboarding', 'relations', 'general']

export function Compose({ tickets, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const answerable = [
    ['How many vacation days do I get?', 'Hi, how many vacation days do I get per year?'],
    ['When is payday?', 'When do I get paid this month? What is the pay schedule?'],
    ['401(k) match', 'Does the company match 401k contributions?'],
    ['Open enrollment dates', 'When is open enrollment for health insurance?'],
    ['Dress code', 'What is the dress code and the work from home policy?'],
  ]
  const personal = ESCALATIONS.map((e) => [e.example, e.example])
  const submit = (e) => {
    e.preventDefault()
    const r = triage(subject, body)
    const now = new Date().toISOString()
    const text = r.resolved ? r.answer : ackText(name, agentName(r.assignee), r.urgent, r.sensitive, r.extra)
    onCreate({
      id: Math.max(1000, ...tickets.map((x) => x.id)) + 1, subject, body, customer: name || 'Employee',
      email: email || 'employee@examplecompany.com', status: r.resolved ? 'Closed' : 'Open', urgent: r.urgent,
      topic: r.topic, assignee: r.assignee, createdAt: now, resolvedByAI: r.resolved, channel: 'Email', note: r.note,
      tags: [...(r.resolved ? ['ai-resolved'] : []), ...(r.tags || (r.sensitive ? ['sensitive'] : []))],
      replies: [{ from: 'HR Assistant (automated)', text, at: now, email: true, ai: true }],
    })
  }
  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Simulate an incoming email</h2>
        <p className="mute small">Stands in for a real email arriving at the HR inbox ({HR_ADDRESS}). The automated assistant reads it, creates the ticket, replies when it can, and assigns it to the right person.</p>
        <label>Load a sample question
          <select value="" onChange={(e) => { const all = [...answerable, ...personal]; const x = all[Number(e.target.value)]; if (x) { setSubject(x[0]); setBody(x[1]) } }}>
            <option value="">Choose a sample…</option>
            <optgroup label="Assistant should answer">{answerable.map((x, i) => <option key={x[0]} value={i}>{x[0]}</option>)}</optgroup>
            <optgroup label="Must go to a person">{personal.map((x, i) => <option key={x[0]} value={answerable.length + i}>{x[0]}</option>)}</optgroup>
          </select></label>
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
  const stats = [['My open tickets', open.length], ['Urgent', open.filter((t) => t.urgent).length], ['Overdue', overdue], ['Advice requested', tickets.filter((t) => pendingAdviceFor(t, me).length).length], ['Resolved automatically', ai], ['Closed', owned.filter((t) => t.status === 'Closed').length]]
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

export function Documents({ docs, setDocs }) {
  const [msg, setMsg] = useState('')
  const [viewing, setViewing] = useState(null)
  const upload = (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    files.forEach((f) => {
      if (!/\.(txt|md|csv)$/i.test(f.name)) { setMsg(`"${f.name}" was not added. For now only .txt, .md and .csv files can be read here. PDF and Word files need the full connection.`); return }
      if (f.size > 200000) { setMsg(`"${f.name}" is too large (limit 200 KB).`); return }
      const r = new FileReader()
      r.onload = () => { setDocs((p) => [{ id: Date.now() + Math.random(), name: f.name, size: f.size, addedAt: new Date().toISOString(), source: 'Uploaded', text: String(r.result) }, ...p]); setMsg(`Added "${f.name}".`) }
      r.readAsText(f)
    })
  }
  const open = docs.find((d) => d.id === viewing)
  return (
    <>
      <section className="panel pad"><div className="row between"><h2>Documents</h2>
        <label className="btn primary upload">Upload document<input type="file" multiple accept=".txt,.md,.csv" onChange={upload} hidden /></label></div>
        <p className="mute">Policy documents the HR team keeps for reference. Use sample text only.</p>
        {msg && <p className="note-line">{msg}</p>}
        <div className="table docs">
          <div className="tr th"><span>Name</span><span>Source</span><span>Added</span><span>Size</span><span /></div>
          {docs.length === 0 && <p className="empty">No documents yet.</p>}
          {docs.map((d) => (
            <div key={d.id} className="tr"><button className="linkish" onClick={() => setViewing(d.id)}>{d.name}</button><span>{d.source}</span><span>{new Date(d.addedAt).toLocaleDateString()}</span><span>{Math.max(1, Math.round(d.size / 1024))} KB</span><button className="link" onClick={() => { setDocs(docs.filter((x) => x.id !== d.id)); if (viewing === d.id) setViewing(null) }}>Delete</button></div>
          ))}
        </div>
        {open && <div className="docview"><div className="row between"><b>{open.name}</b><button className="link" onClick={() => setViewing(null)}>Close</button></div><pre>{open.text}</pre></div>}
      </section>
      <section className="panel pad"><h3>Egnyte</h3>
        <p><span className="badge red">Not connected</span></p>
        <p className="mute">Documents stored in Egnyte will be listed here once the connection is set up. Until then the assistant does not read uploaded documents: its replies come from the fixed answers below.</p>
      </section>
      <section className="panel pad"><h3>Never answered automatically</h3>
        <p className="mute">These always go to a person, with the reason recorded on the ticket.</p>
        {ESCALATIONS.map((e) => <div key={e.id} className="kb"><b>{e.example}</b><span className="mute small">{e.reason}</span></div>)}
      </section>
      <section className="panel pad"><h3>Fixed answers used for automatic replies</h3>
        {KNOWLEDGE.map((k) => <div key={k.keys[0]} className="kb"><span className="badge grey">{topicLabel(k.topic)}</span><b>Triggers on: {k.keys.join(', ')}</b><p>{k.answer}</p></div>)}
      </section>
    </>
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
