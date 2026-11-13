import { useState } from 'react'
import { AGENTS, ESCALATIONS, HR_ADDRESS, KNOWLEDGE, TOPIC_LABELS } from './data'
import { ackText, topicLabel } from './triage'
import { BROWSER_AI, decide, FOOTER } from './aiAgent'
import { MANUAL, SECTIONS } from './data/beztakManual.js'
import { ago, agent, agentName, dueInfo, initials, pendingAdviceFor } from './util'

const DEPTS = ['benefits', 'payroll', 'timeoff', 'onboarding', 'relations', 'general']

export function Compose({ tickets, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const answerable = [
    ['How does PTO work?', 'Hi, how many vacation days do I get per year?'],
    ['When is payday?', 'When do I get paid this month? What is the pay schedule?'],
    ['Paid holidays', 'Which holidays are paid?'],
    ['Calling in sick', 'I need to call in sick tomorrow, what do I do?'],
    ['Dress code', 'What is the dress code?'],
  ]
  const personal = ESCALATIONS.map((e) => [e.example, e.example])
  const submit = async (e) => {
    e.preventDefault()
    // Same decision the email helper makes for real emails (safety rules, then answers or a person).
    if (busy) return
    setBusy(true)
    const r = await decide(BROWSER_AI, subject, body)
    setBusy(false)
    const now = new Date().toISOString()
    const text = r.resolved ? r.answer + FOOTER : ackText(name, agentName(r.assignee), r.urgent, r.sensitive, r.extra)
    onCreate({
      id: Math.max(1000, ...tickets.map((x) => x.id)) + 1, subject, body, customer: name || 'Employee',
      email: email || 'employee@examplecompany.com', status: r.resolved ? 'Closed' : 'Open', urgent: r.urgent,
      topic: r.topic, assignee: r.assignee, createdAt: now, resolvedByAI: r.resolved, channel: 'Email', note: r.note, draft: r.draft || undefined,
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
        <div className="row between"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" type="submit" disabled={busy}>{busy ? 'The AI is reading the email…' : 'Create ticket'}</button></div>
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
  const stats = [['My open tickets', open.length], ['Urgent', open.filter((t) => t.urgent).length], ['Overdue', overdue], ['Advice requested', tickets.filter((t) => pendingAdviceFor(t, me).length).length], ['AI answered', ai], ['Closed', owned.filter((t) => t.status === 'Closed').length]]
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
        <p className="mute">Documents stored in Egnyte will be listed here once the connection is set up. The assistant does not read uploaded documents yet: it answers only from the answer bank below.</p>
      </section>
      <section className="panel pad"><h3>Never answered automatically</h3>
        <p className="mute">These always go to a person, with the reason recorded on the ticket.</p>
        {ESCALATIONS.map((e) => <div key={e.id} className="kb"><b>{e.example}</b><span className="mute small">{e.reason}</span></div>)}
      </section>
      <section className="panel pad"><h3>What the assistant answers from</h3>
        <p className="mute">The assistant only answers from these, and cites the entry it used. Anything else goes to a person.</p>
        <details className="bank" open><summary><b>HR answers</b> <span className="nl blue">{KNOWLEDGE.length} answers</span> <span className="mute small">Short answers to common questions, used even when the AI is not connected</span></summary>
          {KNOWLEDGE.map((k, i) => <div key={k.keys[0]} className="kb"><span className="nl gray">HR-{i + 1} · {topicLabel(k.topic)}</span><p>{k.answer}</p></div>)}
        </details>
        <details className="bank"><summary><b>{MANUAL.title}</b> <span className="nl purple">{SECTIONS.reduce((n, x) => n + x.items.length, 0)} answers</span> <span className="mute small">{MANUAL.version}. Used when the AI is connected, and for suggested replies</span></summary>
          {SECTIONS.map((sec) => (
            <details key={sec.n} className="bank-sec"><summary>{sec.n}. {sec.title} <span className="mute small">({sec.items.length})</span></summary>
              {sec.items.map((it, i) => <div key={it.q} className="kb"><span className="nl gray">{sec.n}.{i + 1}</span><b>{it.q}</b><p className="pre">{it.a}</p></div>)}
            </details>
          ))}
        </details>
      </section>
    </>
  )
}

export function Setup({ me, openGuardrails }) {
  return (
    <>
      <section className="panel pad"><h2>For the project team: AI guardrails</h2>
        <p>The checks that prove the AI assistant only answers what it safely can, and hands everything else to a person. This is a back-office page, so it is not in the main menu.</p>
        <button className="btn primary" onClick={openGuardrails}>Open guardrails checks</button>
      </section>
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

export function Profile({ helper, setHelper, helperStatus, checkNow, me, tickets, prefs, setPrefs, switchUser, reset, toast }) {
  const a = agent(me)
  const mineAll = tickets.filter((t) => t.assignee === me)
  const open = mineAll.filter((t) => t.status !== 'Closed').length
  const email = `${a.name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.')}@examplecompany.com`
  const set = (patch) => { setPrefs({ ...prefs, ...patch }); toast('Saved.') }
  const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match my device']]
  return (
    <>
      <section className="panel pad">
        <div className="profile-head">
          <div className="profile-sq" aria-hidden="true">{initials(a.name)}</div>
          <div><h2>{a.name}</h2><p className="mute">{a.skill} specialist, HR team</p><p><span className="badge grey">{prefs.ooo ? 'Out of office' : 'Available'}</span></p></div>
        </div>
        <dl className="kv">
          <dt>Email</dt><dd>{email}</dd>
          <dt>Team</dt><dd>Beztakets HR team</dd>
          <dt>Handles</dt><dd className="chips">{a.topics.map((t) => <span key={t} className="badge violet">{TOPIC_LABELS[t]}</span>)}</dd>
          <dt>Tickets</dt><dd>{open} open, {mineAll.length - open} closed</dd>
        </dl>
      </section>
      <section className="panel pad"><h2>Settings</h2>
        <div className="setrow"><div><b>Appearance</b><p className="mute small">Light is the default.</p></div>
          <div className="choice" role="group" aria-label="Appearance">{THEMES.map(([k, l]) => <button key={k} className={prefs.theme === k ? 'on' : ''} aria-pressed={prefs.theme === k} onClick={() => set({ theme: k })}>{l}</button>)}</div></div>
        <div className="setrow"><div><b>Email notifications</b><p className="mute small">Get an email when a ticket is assigned to you.</p></div>
          <label><input type="checkbox" checked={prefs.notify} onChange={(e) => set({ notify: e.target.checked })} /> On</label></div>
        <div className="setrow"><div><b>Out of office</b><p className="mute small">Lets teammates know you are away.</p></div>
          <label><input type="checkbox" checked={prefs.ooo} onChange={(e) => set({ ooo: e.target.checked })} /> On</label></div>
        <p className="mute small">These are saved on this device only (demo).</p>
      </section>
      <section className="panel pad"><h2>Email connection</h2>
        <p className="mute small">Connects Beztakets to the email helper so emails become tickets and replies go out by email. The password is saved only in this browser.</p>
        <label className="field">Helper address<input value={helper.url} onChange={(e) => setHelper({ ...helper, url: e.target.value.trim(), connectedAt: undefined })} /></label>
        <label className="field">Helper password<input type="password" autoComplete="off" value={helper.token} onChange={(e) => setHelper({ ...helper, token: e.target.value.trim(), connectedAt: undefined })} placeholder="Paste the helper password" /></label>
        <p><span className={`badge ${helper.token ? 'violet' : 'red'}`}>{helper.token ? 'Connected: new emails become tickets' : 'Not connected'}</span></p>
        {helper.token && (
          <div className="helper-status" role="status">
            {!helperStatus
              ? <p className="mute small">Checking the helper…</p>
              : helperStatus.ok
                ? <>
                  <p className="small"><b>The helper answered</b> at {new Date(helperStatus.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}. It has {helperStatus.remote} email conversation{helperStatus.remote === 1 ? '' : 's'}; {helperStatus.imported} new here just now.</p>
                  {(() => {
                    const mail = tickets.filter((t) => t.threadId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    if (!mail.length) return null
                    const last = mail[0]
                    const by = {}
                    mail.forEach((t) => { by[agentName(t.assignee)] = (by[agentName(t.assignee)] || 0) + 1 })
                    return (
                      <>
                        <p className="small"><b>Latest email ticket:</b> “{last.subject}” from {last.customer}, {ago(last.createdAt)}. {last.resolvedByAI ? 'Answered automatically.' : <>Assigned to <b>{agentName(last.assignee)}</b>{last.assignee === me ? ' (you).' : `. Switch “Signed in as” to ${agentName(last.assignee)} to see it.`}</>}</p>
                        <p className="mute small">Email tickets on this site, by person: {Object.entries(by).map(([n, c]) => `${n} ${c}`).join(', ')}. You only see your own tickets.</p>
                      </>
                    )
                  })()}
                  {helperStatus.newest && <p className="small"><b>Newest conversation in the helper:</b> “{helperStatus.newest.subject}” from {helperStatus.newest.customer.replace(/\s*<.*>/, '')}, {ago(helperStatus.newest.at)}.</p>}
                  {helperStatus.hidden > 0 && <p className="mute small">{helperStatus.hidden} conversation{helperStatus.hidden === 1 ? ' is' : 's are'} from automatic senders (no-reply, delivery notices) and {helperStatus.hidden === 1 ? 'is' : 'are'} not shown as tickets.</p>}
                  {(() => {
                    const m = helperStatus.mail
                    if (!m) return null
                    if (m.oldHelper) return <p className="small gr-prob"><b>The helper in Cloudflare is an old version</b> (it cannot report what it is doing). Paste the newest <code>worker.js</code> into Cloudflare and Deploy: that update is what stops it reading old mail.</p>
                    if (m.never) return <p className="small gr-prob"><b>The helper has never checked Gmail yet.</b> In Cloudflare, open the worker, go to Settings, Triggers, and make sure the schedule (cron) “* * * * *” is there.</p>
                    const mins = m.mins ?? 0
                    return (
                      <>
                        <p className={`small ${m.ok ? '' : 'gr-prob'}`}><b>The helper last checked Gmail {mins < 1 ? 'less than a minute' : `${mins} minute${mins === 1 ? '' : 's'}`} ago</b>{m.ok ? '.' : <>, and it <b>failed</b>: {m.error}</>}</p>
                        {m.ok && mins > 5 && <p className="small gr-prob">That is too long ago: it should check every minute. In Cloudflare, open the worker, go to Settings, Triggers, and check the schedule “* * * * *” is there.</p>}
                        {m.ok && <p className="mute small">It only looks at email that arrived after {new Date(m.startedAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. Last check: {m.listed} email{m.listed === 1 ? '' : 's'} in the inbox since then: {m.newTickets} new ticket{m.newTickets === 1 ? '' : 's'}, {m.followUps} follow-up{m.followUps === 1 ? '' : 's'}, {m.seenBefore} already handled{m.own + m.automatic + m.alreadyAnswered + m.older > 0 ? `, ${m.own + m.automatic + m.alreadyAnswered + m.older} skipped (${[m.own && `${m.own} sent by the inbox itself`, m.automatic && `${m.automatic} automatic`, m.alreadyAnswered && `${m.alreadyAnswered} already answered by someone`, m.older && `${m.older} older`].filter(Boolean).join(', ')})` : ''}.</p>}
                      </>
                    )
                  })()}
                  {helperStatus.older > 0 && <p className="mute small">{helperStatus.older} older conversation{helperStatus.older === 1 ? ' was' : 's were'} not added because {helperStatus.older === 1 ? 'it' : 'they'} arrived before you connected.</p>}
                  {helperStatus.remote === 0 && <p className="mute small">The helper has not turned any email into a ticket yet. Check that the email went to the helper's inbox (not Spam) and was sent from a different address.</p>}
                </>
                : <p className="small gr-prob"><b>Problem:</b> {helperStatus.error}</p>}
            <button type="button" className="btn" onClick={checkNow}>Check for new emails now</button>
          </div>
        )}
      </section>
      <section className="panel pad"><h2>Account</h2>
        <p className="mute small">Switch to another team member to see the desk from their point of view (demo).</p>
        <div className="choice">{AGENTS.filter((x) => x.id !== me).map((x) => <button key={x.id} onClick={() => switchUser(x.id)}>{x.name}</button>)}</div>
        <div className="setrow"><div><b>Reset sample data</b><p className="mute small">Puts tickets, replies and documents back to the starting examples.</p></div><button className="btn" onClick={reset}>Reset</button></div>
      </section>
    </>
  )
}
