import { Fragment, useEffect, useState } from 'react'
import { AGENTS } from './data'
import { topicLabel } from './triage'
import { suggestReply } from './aiAgent'
import { CONFIDENCE, draftFor, hasBlanks, isSensitive, needsCheck } from './drafts'
import { helperCall } from './helper'
import { FeedbackBar, LessonModal } from './Lessons'
import { agentName, ago, byUrgency, dueInfo, initials, pendingAdviceFor, priorityOf, toLocalInput } from './util'

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
// Blanks left in a reply: [like this], {like this} or TBD. A reply with blanks cannot be sent.
const BLANKS_LEFT = /\[[^\]\n]{1,120}\]|\{[^}\n]{1,120}\}|\bTBD\b/
const TAG_NAMES = { 'from-chat': 'From AI chatbot', 'asked-for-person': 'Asked for a person', 'follow-up': 'Employee follow-up', 'created-by-hr': 'Created by HR' }
const TAG_COLORS = { 'Due soon': 'red', 'Answered automatically': 'brown', 'Advice requested': 'yellow', 'Asked for a person': 'red', 'Employee follow-up': 'orange', 'AI draft: check': 'orange' }
export const VIEW_NAMES = { mine: 'My open tickets', closed: 'Closed', chat: 'From AI chatbot', all: 'All tickets' }

// "New ticket": an HR person opens a ticket themselves (a phone call, a chat in the hallway, a walk-up).
export function NewTicket({ onCreate, onClose }) {
  const [f, setF] = useState({ customer: '', email: '', subject: '', body: '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  const submit = (e) => {
    e.preventDefault()
    const v = { customer: f.customer.trim(), email: f.email.trim(), subject: f.subject.trim(), body: f.body.trim() }
    if (!v.customer || !v.subject || !v.body) { setErr('Please fill in the name, subject and details.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) { setErr('Please enter a valid email address, like name@company.com.'); return }
    onCreate(v)
  }
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal" onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-labelledby="newt-h">
        <h2 id="newt-h">New ticket</h2>
        <p className="mute small">Open a ticket for an employee yourself. It is assigned to you.</p>
        <label className="field">Employee name<input value={f.customer} onChange={set('customer')} placeholder="Example: Alex Kim" autoFocus maxLength={80} /></label>
        <label className="field">Employee email<input type="email" value={f.email} onChange={set('email')} placeholder="name@company.com" maxLength={120} /></label>
        <label className="field">Subject<input value={f.subject} onChange={set('subject')} placeholder="What is this about?" maxLength={150} /></label>
        <label className="field">Details<textarea rows={5} value={f.body} onChange={set('body')} placeholder="What did the employee ask or report?" maxLength={4000} /></label>
        {err && <p className="err small" role="alert">{err}</p>}
        <div className="row between"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary">Create ticket</button></div>
      </form>
    </div>
  )
}

export function List({ tickets, me, open, nav, setNav, onNew }) {
  // The view lives in App so it survives opening a ticket and coming back.
  const { view } = nav
  const setView = (v) => setNav({ ...nav, view: v })
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const live = (t) => t.status !== 'Closed'
  const human = tickets.filter((t) => !t.resolvedByAI)
  const owned = human.filter((t) => t.assignee === me)
  const tags = [...new Set(tickets.flatMap((t) => t.tags || []))].sort()
  const dueSoon = (t) => live(t) && dueInfo(t)?.cls === 'amber' // overdue tickets already show in red under Deadline
  // "My open tickets" holds my own open tickets plus ones where a teammate asked for my advice (tagged), split into sections.
  const mineOpen = human.filter((t) => live(t) && (t.assignee === me || pendingAdviceFor(t, me).length))
  const VIEWS = [
    ['mine', 'My open tickets', mineOpen, 'Most urgent first.'],
    ['closed', 'Closed', [...tickets.filter((t) => t.resolvedByAI), ...owned.filter((t) => !live(t) && !t.resolvedByAI)], 'Answered by the AI or closed by you.'],
    // Every Ask Beztak chat conversation is a ticket: answered ones (closed) and ones that need a person (open), newest first.
    ['chat', 'From AI chatbot', tickets.filter((t) => t.channel === 'Chat' || (t.tags || []).includes('from-chat')), 'Chats from the Ask Beztak bubble that are assigned to you, newest first: ones it answered on its own (closed) and ones that need a person (open). Open one to read the whole conversation.'],
    ['all', 'All tickets', tickets, 'Everything you can see, including tickets the AI answered.'],
  ]
  const known = VIEWS.some((v) => v[0] === view)
  const [, , list, note] = VIEWS.find((v) => v[0] === view) || VIEWS[0]
  const text = q.trim().toLowerCase()
  const rows = list
    .filter((t) => !tag || (t.tags || []).includes(tag))
    .filter((t) => !text || `${t.id} ${t.subject} ${t.customer} ${t.email} ${(t.tags || []).join(' ')}`.toLowerCase().includes(text))
    .sort(view === 'all' || view === 'closed' || view === 'chat' ? (a, b) => new Date(b.createdAt) - new Date(a.createdAt) : byUrgency)
  const checking = (t) => t.assignee === me && needsCheck(t)
  const sections = view === 'mine' || !known
    ? [['Needs your check', rows.filter(checking)], ['Other open tickets', rows.filter((t) => !checking(t))]].filter(([, r]) => r.length)
    : view === 'closed'
      ? [['AI answered', rows.filter((t) => t.resolvedByAI)], ['Closed by you', rows.filter((t) => !t.resolvedByAI)]].filter(([, r]) => r.length)
      : [['', rows]]

  return (
    <>
      <div className="nbar">
        <div className="nviews" role="tablist" aria-label="Views">
          {VIEWS.map(([k, n, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{n}<em>{l.length}</em></button>)}
        </div>
        <button className="plus" onClick={onNew} aria-label="New ticket" title="New ticket"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg></button>
      </div>
      <div className="ntools">
        <p className="mute small">{note}{view === 'mine' && <> Deadlines count team hours only.</>}</p>
        <div className="nfind">
          <select className="tagfilter" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
            <option value="">All tags</option>{tags.map((g) => <option key={g} value={g}>#{g}</option>)}
          </select>
          <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tickets" />
        </div>
      </div>
      <div className="nwrap">
        <div className="ntable" role="table" aria-label="Tickets">
          {sections.map(([title, items]) => (
            <Fragment key={title}>
              {title && <div className="nsec" role="presentation"><span>{title} <em>{items.length}</em></span></div>}
              <div className="nrow nhead" role="row">
                {['Ticket', 'Priority', 'Status', 'Employee', 'Topic', 'Tags', 'Deadline', 'Owner'].map((h) => <span key={h} role="columnheader">{h}</span>)}
              </div>
              {items.map((t) => {
            const p = priorityOf(t)
            const d = dueInfo(t)
            const adv = pendingAdviceFor(t, me).length > 0
            const tg = [...(dueSoon(t) ? ['Due soon'] : []), ...(t.resolvedByAI ? ['Answered automatically'] : []), ...(t.assignee === me && needsCheck(t) ? ['AI draft: check'] : []), ...(adv ? ['Advice requested'] : []), ...(t.tags || []).filter((g) => g !== 'ai-resolved').map((g) => TAG_NAMES[g] || g)].sort((a, b) => Number(!(a in TAG_COLORS)) - Number(!(b in TAG_COLORS)))
            return (
              <div key={t.id} className="nrow" role="row" tabIndex={0} onClick={() => open(t.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(t.id) } }}>
                <span className="ncell nfirst" role="cell"><b>{t.subject}</b><small>#{t.id}{t.escalatedAt && t.status !== 'Closed' && <> · <span className="esc">{t.escalatedBecause === 'person' ? 'Asked for a person' : 'Employee follow-up'}</span></>}</small></span>
                <span className="ncell" role="cell">{p.level === 5 ? <span className="mute">–</span> : <Label color={PRIO_COLOR[p.label]} title={p.why}>{p.label}</Label>}</span>
                <span className="ncell" role="cell"><Label color={STATUS_COLOR[t.status]}>{t.status}</Label></span>
                <span className="ncell" role="cell"><Avatar name={t.customer} />{t.customer}</span>
                <span className="ncell" role="cell"><Label color={TOPIC_COLOR[t.topic]}>{topicLabel(t.topic)}</Label></span>
                <span className="ncell ntags" role="cell">{tg.slice(0, 2).map((g) => <Label key={g} color={TAG_COLORS[g] || 'gray'}>{g}</Label>)}{tg.length > 2 && <small className="mute">+{tg.length - 2}</small>}</span>
                <span className={`ncell ndue ${d?.cls || ''}`} role="cell">{d ? d.text : '–'}</span>
                <span className="ncell" role="cell">{t.resolvedByAI ? <><Avatar name="AI agent" />AI agent</> : <><Avatar name={agentName(t.assignee)} />{t.assignee === me ? 'Me' : agentName(t.assignee)}</>}</span>
              </div>
            )
              })}
            </Fragment>
          ))}
          {rows.length === 0 && <p className="empty">{view === 'mine' || !known ? 'All caught up: you have no open tickets.' : view === 'closed' ? 'Nothing closed yet.' : 'Nothing here. You only see tickets assigned to you or where you were asked for advice.'}</p>}
        </div>
      </div>
      <p className="nfoot"><span className="mute small">{rows.length} ticket{rows.length === 1 ? '' : 's'}</span></p>
    </>
  )
}

export function Detail({ backLabel = 'Back', ticket: t, all, me, helper, update, transfer, merge, toast, back }) {
  const [text, setText] = useState('')
  const [tab, setTab] = useState('reply')
  // The desk's chat bubble can drop a manual answer into this reply ("Use in reply").
  useEffect(() => {
    const add = (e) => { setTab('reply'); setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${e.detail}` : e.detail)) }
    window.addEventListener('beztakets:use-in-reply', add)
    return () => window.removeEventListener('beztakets:use-in-reply', add)
  }, [])
  const [tag, setTag] = useState('')
  const [adviceTo, setAdviceTo] = useState('')
  const [adviceQ, setAdviceQ] = useState('')
  const [mergeId, setMergeId] = useState('')
  const [answers, setAnswers] = useState({})
  const [hideDraft, setHideDraft] = useState(false)
  const [suggestMode, setSuggestMode] = useState('draft') // 'draft' (with [blanks]) or 'complete' (no blanks)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [sending, setSending] = useState(false)
  const [lessonDraft, setLessonDraft] = useState(null)
  if (!t || !all.some((x) => x.id === t.id)) return <><p className="empty">That ticket isn't in your list.</p><button className="btn" onClick={back}>← {backLabel}</button></>

  const owner = t.assignee === me
  const thread = [{ from: t.customer, text: t.body, at: t.createdAt, inbound: true }, ...t.replies]
  const others = AGENTS.filter((a) => a.id !== me)
  const mergeTargets = all.filter((x) => x.id !== t.id && x.assignee === me && x.status !== 'Closed')
  const stamp = () => new Date().toISOString()

  // Sends an email reply (through the email helper when it is connected). Used by the reply box and by "Ready to send".
  const deliver = async (body) => {
    let threadId = t.threadId
    let emailed = false
    if (helper?.token) {
      try {
        if (t.threadId) await helperCall(helper, `/tickets/${t.threadId}/reply`, { method: 'POST', body: JSON.stringify({ text: body }) })
        else threadId = (await helperCall(helper, '/tickets/new', { method: 'POST', body: JSON.stringify({ to: t.email, name: t.customer, subject: t.subject, text: body }) })).threadId // a ticket HR opened by hand: starts the email conversation
        emailed = true
      } catch (err) { toast(`Email not sent: ${err.message}`); return false }
    }
    update(t.id, (x) => ({ ...(threadId && !x.threadId ? { threadId } : {}), replies: [...x.replies, { from: agentName(me), text: body, at: stamp(), email: true, emailed }], status: x.status === 'Open' ? 'In progress' : x.status }))
    toast(emailed ? `Email sent to ${t.email}.` : 'Saved on the ticket. It was not emailed because the email helper is not connected (see your profile).')
    return true
  }
  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    if (tab === 'reply' && BLANKS_LEFT.test(text)) { toast('Fill in every [blank] before sending. The blanks are the parts in square brackets.'); return }
    if (tab === 'note') update(t.id, (x) => ({ replies: [...x.replies, { from: agentName(me), text, at: stamp(), note: true }] }))
    else if (!(await deliver(text))) return
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
  // Human in the loop: the AI always prepares a reply, flagged "Needs verification" until a person sends one.
  // "Ready to send" sends it as is; "Edit" lets the person fix it first. Nothing is ever sent on its own, and sending
  // does not teach the AI: to do that, HR uses "Save as a lesson" on the sent reply and a second person approves it.
  const draft = owner && needsCheck(t) && !hideDraft ? draftFor(t, me) : null
  const conf = draft && CONFIDENCE[draft.kind]
  const approve = async (body) => {
    if (BLANKS_LEFT.test(body)) { toast('Fill in every [blank] before sending. The blanks are the parts in square brackets.'); setEditing(true); setEditText(body); return }
    setSending(true)
    const ok = await deliver(body)
    setSending(false)
    if (ok) setEditing(false)
  }
  // "Suggest AI reply": the AI (through the email helper, which holds the key) writes a reply from the manuals for the HR
  // person to check. Without the helper it falls back to the closest manual answer. Nothing is ever sent automatically.
  const suggest = async (mode = suggestMode) => {
    setSuggestMode(mode); setSuggesting(true)
    const input = {
      subject: t.subject, body: t.body || '', mode, customer: t.customer, agent: agentName(me),
      thread: t.replies.filter((m) => !m.event && !m.note && m.text).map((m) => ({ from: m.inbound ? 'employee' : 'hr', text: m.text })), // private notes are never included
    }
    let r = null
    if (helper?.token && helper?.url) { try { r = await helperCall(helper, '/suggest', { method: 'POST', body: JSON.stringify(input) }) } catch { r = null } }
    if (!r || typeof r.ok !== 'boolean') {
      r = await suggestReply({}, input)
      const why = 'The AI is not available right now (the email helper is not connected, or it needs updating).'
      if (r.ok) r.note = `${why} ${r.note}`; else r.reason = `${why} ${r.reason}`
    }
    setSuggestion(r); setSuggesting(false)
  }
  const useSuggestion = () => {
    if (text.trim() && !window.confirm('Replace what you have written so far?')) return
    setTab('reply'); setText(suggestion.text); setSuggestion(null)
  }

  return (
    <div className="detail">
      <div className="crumbs"><button className="link" onClick={back}>← {backLabel}</button> <span>#{t.id}</span></div>
      {!owner && <div className="banner">You're helping <b>{agentName(t.assignee)}</b> on this ticket. You can read it and answer the advice request below.</div>}
      {t.mergedInto && <div className="banner">This ticket was merged into #{t.mergedInto}.</div>}
      {t.escalatedAt && t.status !== 'Closed' && <div className="banner"><b>{t.escalatedBecause === 'person' ? 'The employee asked for a person' : 'The employee wrote back'} after the automatic answer.</b> They were emailed that you will reply by the deadline above. Please write the answer yourself: the manual answer did not settle it.</div>}
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-h col">
            <h2>{t.subject}</h2>
            <div className="row"><Status s={t.status} /><Prio t={t} /><span className="badge grey">{topicLabel(t.topic)}</span><Due t={t} />{t.resolvedByAI && <span className="badge violet">AI answered</span>}</div>
          </div>
          <div className="ai-box"><b>{t.resolvedByAI ? 'AI agent' : 'Automated triage'}</b><p>{t.note}</p>{!t.resolvedByAI && t.status !== 'Closed' && <p className="small"><b>Priority: {priorityOf(t).label}.</b> {priorityOf(t).why}.</p>}</div>
          {draft && (
            <div className="verify-box">
              <div className="verify-h">
                <span className="verify-flag">⚑ Needs verification</span>
                <Label color={conf.color}>AI confidence: {conf.label}</Label>
              </div>
              <p className="small mute">
                The AI wrote this reply but did not send it. Read it closely, then send it or edit it.
                {draft.refs.length > 0 && <> Source: manual {draft.refs.join(', ')}{draft.title ? ` (${draft.title})` : ''}.</>}
                {draft.sensitive && <> Confidential topic: the AI only wrote a careful opening. Add the next step yourself.</>}
                {!draft.sensitive && hasBlanks(draft.email) && <> Fill in the parts in [square brackets]: the AI did not know them and will not guess.</>}
              </p>
              {editing
                ? <textarea className="verify-edit" rows={10} value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Edit the AI reply" autoFocus />
                : <div className="verify-email"><small className="mute">To: {t.email}</small><p>{draft.email}</p></div>}
              <div className="row">
                {editing
                  ? <>
                    <button className="btn primary" disabled={sending || !editText.trim()} onClick={() => approve(editText)}>{sending ? 'Sending…' : 'Send edited reply'}</button>
                    <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
                  </>
                  : <>
                    <button className="btn ok" disabled={sending} onClick={() => approve(draft.email)}>{sending ? 'Sending…' : '✓ Ready to send'}</button>
                    <button className="btn" onClick={() => { setEditText(draft.email); setEditing(true) }}>✎ Edit</button>
                    <button className="link small" onClick={() => setHideDraft(true)}>Write my own instead</button>
                  </>}
              </div>
              {!isSensitive(t) && helper?.token && <small className="mute">Want the AI to use this answer next time? After you send, choose “Save as a lesson” on your reply. A second person approves it first.</small>}
            </div>
          )}
          <div className="thread">
            {thread.map((m, i) => m.event
              ? <div key={i} className="event">{m.text} · {ago(m.at)}</div>
              : (
                <article key={i} className={`msg ${m.inbound ? 'in' : m.note ? 'note' : 'out'}`}>
                  <Avatar name={m.ai && t.resolvedByAI ? 'AI agent' : m.from} />
                  <div>
                    <div className="msg-h"><b>{m.ai && t.resolvedByAI ? 'AI agent' : m.from}</b>{i === 0 && <small> &lt;{t.email}&gt;</small>}<small> · {m.note ? 'Private note' : m.inbound ? (t.channel === 'Chat' && (m.fromChat || i === 0) ? 'Asked in the chat' : t.threadId ? 'Received by email' : 'Opened by HR') : m.fromChat ? 'Chat answer from the manual' : m.ai ? (t.resolvedByAI ? 'AI agent assisted answer, sent by email' : 'Automatic acknowledgement, sent by email') : (m.emailed || (t.threadId && m.emailed === undefined) ? 'Sent by email' : 'Saved reply, not emailed')} · {ago(m.at)}</small></div>
                    <p>{m.text}</p>
                    {m.ai && t.resolvedByAI && <FeedbackBar kind="auto" ticketId={t.id} text={m.text.slice(0, 600)} helper={helper} me={me} toast={toast} />}
                    {owner && helper?.token && m.email && !m.ai && !m.inbound && !m.note && <button type="button" className="link small" onClick={() => setLessonDraft({ question: String(t.body || '').slice(0, 300), answer: m.text.replace(/^\s*(hi|hello|dear)\b[^\n]*\n+/i, '').replace(/\n+\s*(best|thanks|thank you|regards|sincerely|kind regards)[^\n]*(\n[^\n]*)?\s*$/i, '').trim().slice(0, 1200), ticketId: t.id })}>Save as a lesson</button>}
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
              </div>
              {tab === 'reply' && !suggestion && !suggesting && (
                <div className="suggest-bar">
                  <button type="button" className="btn sm" onClick={() => suggest()}>Suggest AI reply</button>
                </div>
              )}
              {(suggestion || suggesting) && (
                <div className="draft-box suggest-box" role="status">
                  <div className="row between suggest-head">
                    <b>AI suggestion: check it before sending</b>
                    <div className="seg sm" role="group" aria-label="What kind of reply">
                      <button type="button" disabled={suggesting} className={suggestMode === 'draft' ? 'on' : ''} onClick={() => suggestMode !== 'draft' && suggest('draft')}>Draft with blanks</button>
                      <button type="button" disabled={suggesting} className={suggestMode === 'complete' ? 'on' : ''} onClick={() => suggestMode !== 'complete' && suggest('complete')}>Complete message</button>
                    </div>
                  </div>
                  {suggesting
                    ? <p className="mute">The AI is writing…</p>
                    : suggestion.ok
                      ? (
                        <>
                          <small>{suggestion.note}</small>
                          {suggestion.source === 'AI' && <FeedbackBar key={suggestion.text} kind="suggest" ticketId={t.id} text={suggestion.text.slice(0, 600)} helper={helper} me={me} toast={toast} />}
                          <p className="suggest-text">{suggestion.text.split(/(\[[^\]\n]{1,120}\])/).map((p, i) => (/^\[[^\]\n]+\]$/.test(p) ? <mark key={i} className="blank">{p}</mark> : p))}</p>
                          <div className="row"><button type="button" className="btn primary sm" onClick={useSuggestion}>Use this</button><button type="button" className="btn sm" onClick={() => suggest()}>Try again</button><button type="button" className="btn sm" onClick={() => setSuggestion(null)}>Dismiss</button></div>
                        </>
                      )
                      : (
                        <>
                          <p>{suggestion.reason}</p>
                          <div className="row"><button type="button" className="btn sm" onClick={() => suggest()}>Try again</button><button type="button" className="btn sm" onClick={() => setSuggestion(null)}>Dismiss</button></div>
                        </>
                      )}
                </div>
              )}
              <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={tab === 'reply' ? `Reply to ${t.customer}${t.threadId || helper?.token ? ' (sent by email)' : ' (saved on the ticket, not emailed)'}…` : 'Only your team can see this…'} />
              <div className="row between">
                <small className="mute">{tab === 'reply' ? (t.threadId ? `To: ${t.email}` : helper?.token ? `To: ${t.email}. The first reply starts the email conversation.` : `For: ${t.email}. Saved on the ticket, not emailed (the email helper is not connected).`) : 'Not sent to the employee'}</small>
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
          <dl><dt>Owner</dt><dd>{agentName(t.assignee)}</dd><dt>Contact</dt><dd>{t.customer}<br /><small>{t.email}</small></dd><dt>Channel</dt><dd>{t.channel || 'Email'}</dd><dt>Created</dt><dd>{ago(t.createdAt)}</dd></dl>
        </aside>
      </div>
      {lessonDraft && <LessonModal initial={lessonDraft} helper={helper} me={me} toast={toast} onClose={() => setLessonDraft(null)} />}
    </div>
  )
}
