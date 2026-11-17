import { useCallback, useEffect, useState } from 'react'
import { helperCall } from './helper'
import { agentName, ago } from './util'
import { A_MAX, Q_MAX, checkLesson } from './lessons'
import { pendingFor, reviewerFor } from './lessonOwner'

const Label = ({ color = 'gray', children }) => <span className={`nl ${color}`}>{children}</span>

// A form for writing one lesson. Used from the Learned page and from "Save as a lesson" on a ticket reply.
export function LessonModal({ initial = {}, helper, me, toast, onClose, onSaved }) {
  const [f, setF] = useState({ question: initial.question || '', answer: initial.answer || '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  const submit = async (e) => {
    e.preventDefault()
    const c = checkLesson(f)
    if (!c.ok) { setErr(c.error); return }
    setBusy(true)
    setErr('')
    try {
      const saved = await helperCall(helper, '/lessons', { method: 'POST', body: JSON.stringify({ ...c, by: agentName(me), ticketId: initial.ticketId }) })
      toast(`Lesson saved. It is assigned to ${reviewerFor({ ...saved, addedBy: agentName(me) }).name} to approve before the agent uses it.`)
      onSaved?.()
      onClose()
    } catch (x) { setErr(x.message); setBusy(false) }
  }
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal" onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-labelledby="les-h">
        <h2 id="les-h">Teach the agent</h2>
        <p className="mute small">Write the question the way any employee might ask it, and an answer that is right for everyone. A teammate is assigned to approve it before the agent uses it.</p>
        <label className="field">Question<textarea rows={2} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} maxLength={Q_MAX + 50} placeholder="Example: Does Beztak cover moving costs for a transfer?" autoFocus /></label>
        <label className="field">Answer<textarea rows={5} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} maxLength={A_MAX + 100} placeholder="The answer the agent may give, only facts you are sure of." /></label>
        <p className="mute small">Remove names, ID numbers and anything about one person. The agent will quote this lesson to employees. It can never override the safety rules.</p>
        {err && <p className="err small" role="alert">{err}</p>}
        <div className="row between"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save lesson'}</button></div>
      </form>
    </div>
  )
}

// 👍 / 👎 under an AI answer. A 👎 asks what was wrong. Feedback is kept for review; it never changes the agent by itself.
export function FeedbackBar({ kind, ticketId, text, helper, me, toast }) {
  const [state, setState] = useState('idle') // idle | down | done
  const [note, setNote] = useState('')
  if (!helper?.token) return null
  const send = async (up, n = '') => {
    try {
      await helperCall(helper, '/feedback', { method: 'POST', body: JSON.stringify({ kind, ticketId, up, note: n, text, by: agentName(me) }) })
      setState('done')
    } catch (e) { toast(`Feedback not saved: ${e.message}`) }
  }
  if (state === 'done') return <small className="mute fb">Thanks, your feedback was saved for the team to review.</small>
  if (state === 'down') {
    return (
      <div className="fb row nowrap">
        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(false, note) } }} placeholder="What was wrong, or what should it say?" maxLength={500} autoFocus />
        <button type="button" className="btn sm primary" onClick={() => send(false, note)}>Send</button><button type="button" className="btn sm" onClick={() => setState('idle')}>Cancel</button>
      </div>
    )
  }
  return (
    <div className="fb row">
      <small className="mute">Was this helpful?</small>
      <button type="button" className="btn sm" onClick={() => send(true)} aria-label="Helpful">👍</button>
      <button type="button" className="btn sm" onClick={() => setState('down')} aria-label="Not helpful">👎</button>
    </div>
  )
}

const STATUS = { pending: ['yellow', 'Waiting for approval'], approved: ['green', 'In use'], off: ['gray', 'Turned off'] }

// "What the agent has learned": every lesson, who taught it, who approved it, how often it was used, with off and delete buttons.
export default function Learned({ helper, me, toast, onPending }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(null) // null or the starting text of a new lesson
  const you = agentName(me)
  const connected = Boolean(helper?.token)
  const load = useCallback(async () => {
    try { const d = await helperCall(helper, '/lessons'); setData(d); setErr(''); onPending?.(pendingFor(d.lessons || [], me).length) } catch (e) { setErr(e.message) }
  }, [helper, me, onPending])
  useEffect(() => { if (connected) load() }, [connected, load])

  const act = async (fn, done) => {
    try { await fn(); if (done) toast(done); await load() } catch (e) { toast(e.message) }
  }
  const post = (l, action) => helperCall(helper, `/lessons/${l.id}`, { method: 'POST', body: JSON.stringify({ action, by: you }) })
  const del = (l) => { if (window.confirm('Delete this lesson? The agent stops using it right away. This cannot be undone.')) act(() => helperCall(helper, `/lessons/${l.id}`, { method: 'DELETE' }), 'Lesson deleted.') }

  if (!connected) return <div className="panel pad"><h2>What the agent has learned</h2><p className="mute">Lessons are kept in the email helper, so the whole team shares them. Connect the helper in your profile first.</p></div>
  const lessons = data?.lessons || []
  const feedback = data?.feedback || []
  const group = (st) => lessons.filter((l) => l.status === st).sort((a, b) => (st === 'pending' ? Number(reviewerFor(b).id === me) - Number(reviewerFor(a).id === me) : 0)) // the ones for you first

  const Card = ({ l }) => {
    const reviewer = l.status === 'pending' ? reviewerFor(l) : null
    const mine = reviewer?.id === me
    return (
    <div className="lesson">
      <div className="row between"><b>{l.question}</b><Label color={STATUS[l.status][0]}>{STATUS[l.status][1]}</Label></div>
      <p>{l.answer}</p>
      <small className="mute">
        Taught by {l.addedBy} · {ago(l.addedAt)}{reviewer ? <> · assigned to {mine ? 'you' : reviewer.name}</> : null}{l.ticketId ? <> · from ticket #{l.ticketId}</> : null}
        {l.approvedBy ? <> · approved by {l.approvedBy}</> : null}
        {l.status !== 'pending' ? <> · used {l.uses || 0} time{l.uses === 1 ? '' : 's'}{l.lastUsedAt ? `, last ${ago(l.lastUsedAt)}` : ''}</> : null}
      </small>
      <div className="row">
        {l.status === 'pending' && mine && <button className="btn sm primary" onClick={() => act(() => post(l, 'approve'), 'Approved. The agent can use this lesson now.')}>Approve</button>}
        {l.status === 'pending' && !mine && <small className="mute">{l.addedBy === you ? `You wrote this one, so ${reviewer.name} will approve it.` : `Waiting for ${reviewer.name} to approve it.`}</small>}
        {l.status === 'approved' && <button className="btn sm" onClick={() => act(() => post(l, 'off'), 'Turned off. The agent no longer uses it.')}>Turn off</button>}
        {l.status === 'off' && <button className="btn sm" onClick={() => act(() => post(l, 'on'), 'Turned back on.')}>Turn on</button>}
        <button className="btn sm danger" onClick={() => del(l)}>Delete</button>
      </div>
    </div>
    )
  }

  return (
    <>
      <div className="panel pad">
        <div className="row between">
          <h2>What the agent has learned</h2>
          <button className="btn primary" onClick={() => setAdding({})}>Teach the agent</button>
        </div>
        <p className="mute small">The agent never changes on its own. It only knows the manuals plus the lessons below: short answers someone on the team wrote and a second person approved. Turn off or delete a lesson and the agent stops using it immediately. Lessons can never override the safety rules.</p>
      </div>
      {err && <p className="err small" role="alert">Could not load lessons: {err}</p>}
      {!data && !err && <p className="mute">Loading…</p>}
      {data && (
        <>
          {[['pending', 'Waiting for approval'], ['approved', 'In use'], ['off', 'Turned off']].map(([st, title]) => (group(st).length > 0 || st === 'approved') && (
            <div key={st} className="panel pad">
              <h3>{title} <span className="count">{group(st).length}</span></h3>
              {group(st).length === 0 && <p className="mute small">Nothing yet. Open a ticket you answered and click “Save as a lesson” under your reply, or use “Teach the agent”.</p>}
              {group(st).map((l) => <Card key={l.id} l={l} />)}
            </div>
          ))}
          <div className="panel pad">
            <h3>Feedback on AI replies <span className="count">{feedback.length}</span></h3>
            <p className="mute small">👍 and 👎 clicks from the team. They are only for review: they do not change the agent. To fix something it got wrong, turn a 👎 into a lesson.</p>
            {feedback.length === 0 && <p className="mute small">No feedback yet.</p>}
            {feedback.map((f) => (
              <div key={f.id} className="lesson">
                <div className="row between"><b>{f.up ? '👍 Helpful' : '👎 Not helpful'}</b><small className="mute">{f.by} · {ago(f.at)}{f.ticketId ? ` · ticket #${f.ticketId}` : ''} · {f.kind === 'auto' ? 'automatic answer' : 'suggested reply'}</small></div>
                {f.note && <p>“{f.note}”</p>}
                {f.text && <small className="mute">{f.text}</small>}
                <div className="row">
                  {!f.up && <button className="btn sm" onClick={() => setAdding({ question: '', answer: f.note || '', ticketId: f.ticketId })}>Teach the agent</button>}
                  <button className="btn sm" onClick={() => act(() => helperCall(helper, `/feedback/${f.id}`, { method: 'DELETE' }))}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {adding && <LessonModal initial={adding} helper={helper} me={me} toast={toast} onClose={() => setAdding(null)} onSaved={load} />}
    </>
  )
}
