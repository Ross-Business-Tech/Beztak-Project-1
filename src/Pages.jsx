import SharedFiles from './SharedFiles'
import { useEffect, useState } from 'react'
import PdfViewer from './PdfViewer'
import { deleteFile, getFile, putFile } from './fileStore'
import { AGENTS, ESCALATIONS, KNOWLEDGE, TOPIC_LABELS } from './data'
import { topicLabel } from './triage'
import { MANUAL, SECTIONS } from './data/beztakManual.js'
import { ago, agent, agentName, dueInfo, initials, pendingAdviceFor } from './util'

const DEPTS = ['benefits', 'payroll', 'timeoff', 'onboarding', 'relations', 'general']

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

// Documents that come with the site as a real PDF file (by document id). The built-in manual entry was saved before
// PDFs could be opened, so it is matched by id and not by a flag stored with it.
const BUILTIN_PDFS = { 1: { file: 'docs/beztak-operations-manual.pdf', note: 'This is a text copy of the manual the assistant answers from, made for reading here. To read the original, upload the PDF.' } }
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

// Opens one document: a real PDF page by page, or the plain text of a text file.
function DocView({ doc }) {
  const builtin = BUILTIN_PDFS[doc.id]
  const [file, setFile] = useState(undefined) // undefined = looking, null = not found, otherwise the saved PDF
  useEffect(() => {
    let dead = false
    if (doc.kind === 'pdf') getFile(doc.id).then((f) => { if (!dead) setFile(f || null) }).catch(() => { if (!dead) setFile(null) })
    return () => { dead = true }
  }, [doc.id, doc.kind])
  if (doc.kind === 'pdf') {
    if (file === undefined) return <p className="mute">Opening…</p>
    if (file === null) return <p className="pdf-err">This PDF is no longer saved in this browser (browsers can clear saved files). Please upload it again.</p>
    return <PdfViewer key={doc.id} file={file} name={doc.name} />
  }
  if (builtin) return <><PdfViewer key={doc.id} url={`${import.meta.env.BASE_URL}${builtin.file}`} name={doc.name} /><p className="mute small">{builtin.note}</p></>
  return <pre>{doc.text}</pre>
}

export function Documents({ docs, setDocs }) {
  const [msg, setMsg] = useState('')
  const [viewing, setViewing] = useState(null)
  const upload = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    for (const f of files) {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        if (f.size > 25000000) { setMsg(`"${f.name}" is too large (limit 25 MB).`); continue }
        const head = new TextDecoder().decode(await f.slice(0, 5).arrayBuffer())
        if (head !== '%PDF-') { setMsg(`"${f.name}" does not look like a real PDF file, so it was not added.`); continue }
        const id = Date.now() + Math.random()
        try { await putFile(id, f) } catch (err) { setMsg(`"${f.name}" could not be saved in this browser: ${err.message}`); continue }
        setDocs((p) => [{ id, name: f.name, size: f.size, addedAt: new Date().toISOString(), source: 'Uploaded', kind: 'pdf' }, ...p])
        setMsg(`Added "${f.name}". Click its name to read it.`)
        continue
      }
      if (!/\.(txt|md|csv)$/i.test(f.name)) { setMsg(`"${f.name}" was not added. Only PDF, .txt, .md and .csv files can be added for now. Word files are not supported yet.`); continue }
      if (f.size > 200000) { setMsg(`"${f.name}" is too large (limit 200 KB for text files).`); continue }
      const text = await f.text()
      setDocs((p) => [{ id: Date.now() + Math.random(), name: f.name, size: f.size, addedAt: new Date().toISOString(), source: 'Uploaded', text }, ...p])
      setMsg(`Added "${f.name}".`)
    }
  }
  const remove = (d) => {
    if (d.kind === 'pdf') deleteFile(d.id).catch(() => {})
    setDocs(docs.filter((x) => x.id !== d.id))
    if (viewing === d.id) setViewing(null)
  }
  const open = docs.find((d) => d.id === viewing)
  return (
    <>
      <SharedFiles />
      <section className="panel pad"><div className="row between"><h2>Documents</h2>
        <label className="btn primary upload">Upload document<input type="file" multiple accept=".pdf,application/pdf,.txt,.md,.csv" onChange={upload} hidden /></label></div>
        <p className="mute">Policy documents the HR team keeps for reference. PDFs open right here. Uploaded files are kept in this browser only, so use sample documents.</p>
        {msg && <p className="note-line" role="status">{msg}</p>}
        <div className="table docs">
          <div className="tr th"><span>Name</span><span>Source</span><span>Added</span><span>Size</span><span /></div>
          {docs.length === 0 && <p className="empty">No documents yet.</p>}
          {docs.map((d) => (
            <div key={d.id} className="tr"><button className="linkish" onClick={() => setViewing(d.id)}>{d.name}</button><span>{d.source}</span><span>{new Date(d.addedAt).toLocaleDateString()}</span><span>{fmtSize(d.size)}</span><button className="link" onClick={() => remove(d)}>Delete</button></div>
          ))}
        </div>
        {open && <div className="docview"><div className="row between"><b>{open.name}</b><button className="link" onClick={() => setViewing(null)}>Close</button></div><DocView key={open.id} doc={open} /></div>}
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

export function Setup({ me, account, linked, openGuardrails }) {
  return (
    <>
      <section className="panel pad"><h2>For the project team: AI guardrails</h2>
        <p>The checks that prove the AI assistant only answers what it safely can, and hands everything else to a person. This is a back-office page, so it is not in the main menu.</p>
        <button className="btn primary" onClick={openGuardrails}>Open guardrails checks</button>
      </section>
      <section className="panel pad"><h2>Signing in</h2>
        <p>You signed in as <b>{account}</b>, so you are <b>{agentName(me)}</b>{linked ? '' : ' (this login is not linked to an HR team member, so the desk is shown from the first team member\'s point of view)'}. Each person only sees their own tickets and any ticket they were asked to advise on.</p>
        <p className="mute small">A login belongs to an HR team member when the start of the email matches their name (for example <b>omar@…</b> or <b>omar.haddad@…</b>). Team members: {AGENTS.map((a) => a.name).join(', ')}. Tickets are still stored only in this browser.</p>
      </section>
      <section className="panel pad"><h2>Email connection</h2>
        <p><span className="badge red">Not connected</span></p>
        <p>Tickets are created from real emails. A small helper reads the HR inbox (for example a Gmail test account) and hands each new email to this app. Connect it in your profile.</p>
      </section>
    </>
  )
}

export function Profile({ helper, setHelper, helperStatus, checkNow, me, tickets, prefs, setPrefs, account, linked, signOut, reset, toast }) {
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
        <div className="setrow"><div><b>Signed in as {account}</b><p className="mute small">You are {agentName(me)}{linked ? '' : '. This login is not linked to an HR team member, so you see the desk as the first team member. Sign in with your own account to see your own tickets.'}</p></div><button className="btn" onClick={signOut}>Sign out</button></div>
        <div className="setrow"><div><b>Reset sample data</b><p className="mute small">Puts tickets, replies and documents back to the starting examples.</p></div><button className="btn" onClick={reset}>Reset</button></div>
      </section>
    </>
  )
}
