import { useState } from 'react'
import { AGENTS } from './data'
import { topicLabel } from './triage'
import { manualDraft } from './aiAgent'
import { WORK } from './hours'
import { helperCall } from './helper'
import { agentName, ago, byUrgency, dueInfo, fill, initials, pendingAdviceFor, priorityOf, toLocalInput } from './util'

const STATUSES = ['Open', 'In progress', 'On hold', 'Closed']
const DEPTS = ['benefits', 'payroll', 'timeoff', 'onboarding', 'relations', 'general']

export const Prio = ({ t }) => { const p = priorityOf(t); return <span className={`nl ${({ Critical: 'red solid', High: 'red', Medium: 'orange' })[p.label] || 'gray'}`} title={p.why}>{p.label}</span> }
export const Status = ({ s }) => <span className={`nl ${({ Open: 'blue', 'In progress': 'yellow', 'On hold': 'gray', Closed: 'green' })[s] || 'gray'}`}>{s}</span>
export const Avatar = ({ name }) => <span className="avatar">{initials(name)}</span>
const Due = ({ t }) => { const d = dueInfo(t); return d ? <span className={`badge ${d.cls}`}>{d.text}</span> : <span className="mute">–</span> }

const TOPIC_COLOR = { benefits: 'purple', payroll: 'green', timeoff: 'blue', onboarding: 'orange', relations: 'pink', general: 'gray' }
const STATUS_COLOR = { Open: 'blue', 'In progress': 'yellow', 'On hold': 'gray', Closed: 'green' }
const PRIO_COLOR = { Critical: 'red solid', High: 'red', Medium: 'orange', Normal: 'gray', Closed: 'gray' }
export const Label = ({ color = 'gray', children, title }) => <span className={`nl ${color}`} title={title}>{children}</span>

// The ticket list as one Notion-style table. Views are a single row of tabs (no side menu).
export const VIEW_NAMES = { mine: 'My open tickets', due: 'Due soon', advice: 'Advice requested', closed: 'Closed', ai: 'Answered automatically', all: 'All tickets' }

export function List({ tickets, me, open, reset, nav, setNav }) {
  // The view lives in App so it survives opening a ticket and coming back.
  const { view } = nav
  const setView = (v) => setNav({ ...nav, view: v })
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const live = (t) => t.status !== 'Closed'
  const human = tickets.filter((t) => !t.resolvedByAI)
  const owned = human.filter((t) => t.assignee === me)
  const tags = [...new Set(tickets.flatMap((t) => t.tags || []))].sort()
  const VIEWS = [
    ['mine', 'My open tickets', owned.filter(live), 'Tickets a person needs to answer, most urgent first.'],
    ['due', 'Due soon', owned.filter((t) => live(t) && ['red', 'amber'].includes(dueInfo(t)?.cls)), 'Overdue or due within 4 work hours.'],
    ['advice', 'Advice requested', human.filter((t) => pendingAdviceFor(t, me).length), 'Teammates asked for your advice on these.'],
    ['closed', 'Closed', owned.filter((t) => !live(t)), 'Tickets you have closed.'],
    ['ai', 'Answered automatically', tickets.filter((t) => t.resolvedByAI), 'Answered automatically from the Beztak manual (by the AI when it is connected) and closed. Open one to read the reply that was sent.'],
    ['all', 'All tickets', tickets, 'Everything you can see, including tickets the AI answered.'],
  ]
  const [, , list, note] = VIEWS.find((v) => v[0] === view) || VIEWS[0]
  const text = q.trim().toLowerCase()
  const rows = list
    .filter((t) => !tag || (t.tags || []).includes(tag))
    .filter((t) => !text || `${t.id} ${t.subject} ${t.customer} ${t.email} ${(t.tags || []).join(' ')}`.toLowerCase().includes(text))
    .sort(view === 'ai' || view === 'all' ? (a, b) => new Date(b.createdAt) - new Date(a.createdAt) : byUrgency)

  return (
    <>
      <div className="nviews" role="tablist" aria-label="Views">
        {VIEWS.map(([k, n, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{n}<em>{l.length}</em></button>)}
      </div>
      <div className="ntools">
        <p className="mute small">{note}{view !== 'ai' && view !== 'all' && <> Deadlines count only team hours ({WORK.label}).</>}</p>
        <div className="row">
          <select className="tagfilter" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
            <option value="">All tags</option>{tags.map((g) => <option key={g} value={g}>#{g}</option>)}
          </select>
          <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tickets" />
        </div>
      </div>
      <div className="nwrap">
        <div className="ntable" role="table" aria-label="Tickets">
          <div className="nrow nhead" role="row">
            {['Ticket', 'Priority', 'Status', 'Employee', 'Topic', 'Tags', 'Deadline', 'Owner'].map((h) => <span key={h} role="columnheader">{h}</span>)}
          </div>
          {rows.length === 0 && <p className="empty">{view === 'ai' ? 'No tickets have been answered automatically yet.' : 'Nothing here. You only see tickets assigned to you or where you were asked for advice.'}</p>}
          {rows.map((t) => {
            const p = priorityOf(t)
            const d = dueInfo(t)
            const adv = pendingAdviceFor(t, me).length > 0
            const tg = [...(t.resolvedByAI ? ['Answered automatically'] : []), ...(adv ? ['Advice requested'] : []), ...(t.tags || []).filter((g) => g !== 'ai-resolved')]
            return (
              <button key={t.id} className="nrow" role="row" onClick={() => open(t.id)}>
                <span className="ncell nfirst" role="cell"><b>{t.subject}</b><small>#{t.id}</small></span>
                <span className="ncell" role="cell">{p.level === 5 ? <span className="mute">–</span> : <Label color={PRIO_COLOR[p.label]} title={p.why}>{p.label}</Label>}</span>
                <span className="ncell" role="cell"><Label color={STATUS_COLOR[t.status]}>{t.status}</Label></span>
                <span className="ncell" role="cell"><Avatar name={t.customer} />{t.customer}</span>
                <span className="ncell" role="cell"><Label color={TOPIC_COLOR[t.topic]}>{topicLabel(t.topic)}</Label></span>
                <span className="ncell ntags" role="cell">{tg.slice(0, 2).map((g) => <Label key={g} color={g === 'Answered automatically' ? 'brown' : g === 'Advice requested' ? 'yellow' : 'gray'}>{g}</Label>)}{tg.length > 2 && <small className="mute">+{tg.length - 2}</small>}</span>
                <span className={`ncell ndue ${d?.cls || ''}`} role="cell">{d ? d.text : '–'}</span>
                <span className="ncell" role="cell">{t.resolvedByAI ? <><Avatar name="AI agent" />AI agent</> : <><Avatar name={agentName(t.assignee)} />{t.assignee === me ? 'Me' : agentName(t.assignee)}</>}</span>
              </button>
            )
          })}
        </div>
      </div>
      <p className="nfoot"><span className="mute small">{rows.length} ticket{rows.length === 1 ? '' : 's'}</span><button className="link small" onClick={reset}>Reset sample data</button></p>
    </>
  )
}

export function Detail({ backLabel = 'Back', ticket: t, all, me, canned, helper, update, transfer, merge, toast, back }) {
  const [text, setText] = useState('')
  const [tab, setTab] = useState('reply')
  const [tag, setTag] = useState('')
  const [adviceTo, setAdviceTo] = useState('')
  const [adviceQ, setAdviceQ] = useState('')
  const [mergeId, setMergeId] = useState('')
  const [answers, setAnswers] = useState({})
  const [hideDraft, setHideDraft] = useState(false)
  if (!t || !all.some((x) => x.id === t.id)) return <><p className="empty">That ticket isn't in your list.</p><button className="btn" onClick={back}>← {backLabel}</button></>

  const owner = t.assignee === me
  const thread = [{ from: t.customer, text: t.body, at: t.createdAt, inbound: true }, ...t.replies]
  const others = AGENTS.filter((a) => a.id !== me)
  const mergeTargets = all.filter((x) => x.id !== t.id && x.assignee === me && x.status !== 'Closed')
  const stamp = () => new Date().toISOString()

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    if (tab === 'reply' && t.threadId && helper?.token) {
      try { await helperCall(helper, `/tickets/${t.threadId}/reply`, { method: 'POST', body: JSON.stringify({ text }) }) } catch (err) { toast(`Email not sent: ${err.message}`); return }
    }
    const m = { from: agentName(me), text, at: stamp(), ...(tab === 'note' ? { note: true } : { email: true }) }
    update(t.id, (x) => ({ replies: [...x.replies, m], status: tab === 'reply' && x.status === 'Open' ? 'In progress' : x.status }))
    setText('')
  }
  const addTag = (e) => {
    e.preventDefault()
    const g = tag.trim().toLowerCase().replace(/\s+/g, '-')
    if (g && !t.tags.includes(g)) update(t.id, { tags: [...t.tags, g] })
    setTag('')
  }
  const askAdvice = (e) => {
    e.preventDefault()
    if (!adviceTo || !adviceQ.trim()) return
    update(t.id, (x) => ({ advice: [...x.advice, { id: Date.now(), from: me, to: adviceTo, question: adviceQ, at: stamp(), answer: '' }] }))
    toast(`Advice request sent to ${agentName(adviceTo)}.`)
    setAdviceQ('')
  }
  const answer = (a) => {
    const v = (answers[a.id] || '').trim()
    if (!v) return
    update(t.id, (x) => ({ advice: x.advice.map((y) => (y.id === a.id ? { ...y, answer: v, answeredAt: stamp() } : y)) }))
  }
  const mt = mergeTargets.find((x) => String(x.id) === mergeId)
  // Human in the loop: a suggested reply the HR person checks, edits and sends. Never sent on its own.
  const personReplied = t.replies.some((m) => m.email && !m.ai && !m.inbound)
  const draft = owner && !t.resolvedByAI && t.status !== 'Closed' && !personReplied && !hideDraft ? (t.draft || manualDraft(t.subject, t.body)) : null
  const useDraft = () => { setTab('reply'); setText(fill(`Hi {name},\n\n${draft.text.replace(/\s*\[[^\]]+\]/g, '')}\n\nBest,\n{agent}`, t.customer, me)) }

  return (
    <div className="detail">
      <div className="crumbs"><button className="link" onClick={back}>← {backLabel}</button> <span>#{t.id}</span></div>
      {!owner && <div className="banner">You're helping <b>{agentName(t.assignee)}</b> on this ticket. You can read it and answer the advice request below.</div>}
      {t.mergedInto && <div className="banner">This ticket was merged into #{t.mergedInto}.</div>}
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-h col">
            <h2>{t.subject}</h2>
            <div className="row"><Status s={t.status} /><Prio t={t} /><span className="badge grey">{topicLabel(t.topic)}</span><Due t={t} />{t.resolvedByAI && <span className="badge violet">AI answered</span>}</div>
          </div>
          <div className="ai-box"><b>{t.resolvedByAI ? 'AI agent' : 'Automated triage'}</b><p>{t.note}</p>{!t.resolvedByAI && t.status !== 'Closed' && <p className="small"><b>Priority: {priorityOf(t).label}.</b> {priorityOf(t).why}.</p>}</div>
          {draft && (
            <div className="draft-box">
              <b>Suggested reply: check it before sending</b>
              <small>{draft.source === 'AI' ? 'Written by the AI' : 'Closest answer'} from the manuals ({draft.refs.join(', ')}{draft.title ? `: ${draft.title}` : ''}). Nothing is sent until you send it. Make sure it fits this person's question.</small>
              <p>{draft.text}</p>
              <div className="row"><button className="btn primary" onClick={useDraft}>Use this draft</button><button className="btn" onClick={() => setHideDraft(true)}>Dismiss</button></div>
            </div>
          )}
          <div className="thread">
            {thread.map((m, i) => m.event
              ? <div key={i} className="event">{m.text} · {ago(m.at)}</div>
              : (
                <article key={i} className={`msg ${m.inbound ? 'in' : m.note ? 'note' : 'out'}`}>
                  <Avatar name={m.ai && t.resolvedByAI ? 'AI agent' : m.from} />
                  <div>
                    <div className="msg-h"><b>{m.ai && t.resolvedByAI ? 'AI agent' : m.from}</b>{i === 0 && <small> &lt;{t.email}&gt;</small>}<small> · {m.note ? 'Private note' : m.inbound ? 'Received by email' : m.ai ? (t.resolvedByAI ? 'AI agent assisted answer, sent by email' : 'Automatic acknowledgement, sent by email') : 'Sent by email'} · {ago(m.at)}</small></div>
                    <p>{m.text}</p>
                  </div>
                </article>
              ))}
          </div>

          {t.advice.length > 0 && (
            <div className="advice">
              <h3>Team advice</h3>
              {t.advice.map((a) => (
                <div key={a.id} className="adv">
                  <div><b>{agentName(a.from)}</b> asked <b>{a.to === me ? 'you' : agentName(a.to)}</b> · {ago(a.at)}</div>
                  <p className="q">“{a.question}”</p>
                  {a.answer
                    ? <p className="a"><b>{agentName(a.to)}:</b> {a.answer}</p>
                    : a.to === me
                      ? <div className="row grow"><textarea rows={2} placeholder="Your advice…" value={answers[a.id] || ''} onChange={(e) => setAnswers({ ...answers, [a.id]: e.target.value })} /><button className="btn primary" onClick={() => answer(a)}>Send advice</button></div>
                      : <small className="mute">Waiting for {agentName(a.to)}</small>}
                </div>
              ))}
            </div>
          )}

          {owner && (
            <form className="editor" onSubmit={send}>
              <div className="row between">
                <div className="tabs">
                  <button type="button" className={tab === 'reply' ? 'on' : ''} onClick={() => setTab('reply')}>Reply</button>
                  <button type="button" className={tab === 'note' ? 'on' : ''} onClick={() => setTab('note')}>Private note</button>
                </div>
                <select className="canned" value="" onChange={(e) => { const c = canned.find((x) => String(x.id) === e.target.value); if (c) { setTab('reply'); setText(fill(c.text, t.customer, me)) } }}>
                  <option value="">Insert canned reply…</option>
                  {canned.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={tab === 'reply' ? `Reply to ${t.customer} (sent by email)…` : 'Only your team can see this…'} />
              <div className="row between">
                <small className="mute">{tab === 'reply' ? `To: ${t.email}` : 'Not sent to the employee'}</small>
                <button className="btn primary" type="submit">{tab === 'reply' ? 'Send' : 'Add note'}</button>
              </div>
            </form>
          )}
        </section>

        <aside className="panel props">
          <h3>Ticket properties</h3>
          <label>Status<select disabled={!owner} value={t.status} onChange={(e) => update(t.id, { status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Priority<select disabled={!owner} value={t.urgent ? 'Urgent' : 'Normal'} onChange={(e) => update(t.id, { urgent: e.target.value === 'Urgent' })}><option>Urgent</option><option>Normal</option></select></label>
          <label>Department<select disabled={!owner} value={t.topic} onChange={(e) => update(t.id, { topic: e.target.value })}>{DEPTS.map((d) => <option key={d} value={d}>{topicLabel(d)}</option>)}</select></label>
          <label>Deadline <Due t={t} /><input type="datetime-local" disabled={!owner} value={toLocalInput(t.dueAt)} onChange={(e) => e.target.value && update(t.id, { dueAt: new Date(e.target.value).toISOString() })} /></label>
          <div className="field"><b>Tags</b>
            <div className="row">{t.tags.map((g) => <span key={g} className="chip">#{g}{owner && <button className="x" aria-label={`Remove ${g}`} onClick={() => update(t.id, { tags: t.tags.filter((y) => y !== g) })}>×</button>}</span>)}{t.tags.length === 0 && <small className="mute">No tags</small>}</div>
            {owner && <form className="row nowrap" onSubmit={addTag}><input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add a tag" /><button className="btn" type="submit">Add</button></form>}
          </div>

          {owner && (
            <>
              <hr />
              <label>Transfer ticket to<select value="" onChange={(e) => e.target.value && transfer(t, e.target.value)}><option value="">Choose a teammate…</option>{others.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.skill}</option>)}</select></label>
              <form className="field" onSubmit={askAdvice}><b>Ask for advice</b>
                <select value={adviceTo} onChange={(e) => setAdviceTo(e.target.value)}><option value="">Choose a teammate…</option>{others.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.skill}</option>)}</select>
                <textarea rows={3} placeholder="What do you need help with?" value={adviceQ} onChange={(e) => setAdviceQ(e.target.value)} />
                <button className="btn" type="submit">Send request</button>
              </form>
              <div className="field"><b>Merge duplicate</b>
                <select value={mergeId} onChange={(e) => setMergeId(e.target.value)}><option value="">Merge another ticket into this…</option>{mergeTargets.map((x) => <option key={x.id} value={x.id}>#{x.id} {x.subject} ({x.customer})</option>)}</select>
                {mt && <button className="btn" onClick={() => merge(mt, t)}>Merge #{mt.id} into #{t.id}</button>}
              </div>
            </>
          )}
          <hr />
          <dl><dt>Owner</dt><dd>{agentName(t.assignee)}</dd><dt>Contact</dt><dd>{t.customer}<br /><small>{t.email}</small></dd><dt>Channel</dt><dd>Email</dd><dt>Created</dt><dd>{ago(t.createdAt)}</dd></dl>
        </aside>
      </div>
    </div>
  )
}
