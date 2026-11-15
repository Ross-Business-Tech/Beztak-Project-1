import { useEffect, useRef, useState } from 'react'
import { askChat, handToPerson } from './chatClient'
import { HR_ADDRESS } from '../data'
import './chat.css'

// Starter questions show what the chat is for: day-to-day operations from the Beztak Operations Manual.
const STARTERS = ['When is rent due?', 'How fast must work orders be completed?', 'When do I need a purchase order?', 'How fast must on-call respond to an emergency?']

// One chat, used everywhere: the "Ask Beztak" page, the bubble on other sites, the employee view after sign-in,
// and (with mode="staff") the look-up bubble inside the HR desk.
//   mode "employee": can hand a question to a person (becomes a ticket on the desk)
//   mode "staff": no hand-off (they are the person); "Use in reply" puts an answer into the open ticket's reply
export default function Chat({ mode = 'employee', user, onUseInReply, compact = false }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [handoff, setHandoff] = useState(null) // the form for "Talk to a person"
  const endRef = useRef(null)
  const inputRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [messages, busy, handoff])

  const ask = async (q) => {
    const text = q.trim()
    if (!text || busy) return
    setInput('')
    setHandoff(null)
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
    setMessages((m) => [...m, { role: 'user', text }])
    setBusy(true)
    const res = await askChat(text, history)
    setMessages((m) => [...m, { role: 'assistant', ...res }])
    setBusy(false)
    inputRef.current?.focus()
  }
  const transcript = () => messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, text: m.text }))
  const openHandoff = () => setHandoff({ name: user?.name || '', email: user?.email || '', note: '', busy: false, error: '' })
  const sendHandoff = async (e) => {
    e.preventDefault()
    setHandoff((h) => ({ ...h, busy: true, error: '' }))
    try {
      const r = await handToPerson({ name: handoff.name, email: handoff.email, note: handoff.note, transcript: transcript() })
      setHandoff(null)
      setMessages((m) => [...m, { role: 'system', text: `Ticket submitted. ${r.assignee || 'The HR and Ops team'} will handle it${r.urgent ? ', and it is marked urgent' : ''}. They will reply by email to ${handoff.email}, and we also sent you an email to confirm.` }])
    } catch (err) {
      const offline = !err.status || err.status >= 500 || err.status === 404 || err.status === 401
      setHandoff((h) => ({ ...h, busy: false, error: offline ? `The help desk can't be reached right now. Please email your question to ${HR_ADDRESS}.` : err.message }))
    }
  }

  const lastBot = [...messages].reverse().find((m) => m.role === 'assistant')
  const canHandOff = mode === 'employee' && messages.some((m) => m.role === 'user')

  return (
    <div className={`chat${compact ? ' compact' : ''}`}>
      <div className="chat-log" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-hello">
            <p><b>Hi{user?.name ? ` ${user.name.split(' ')[0]}` : ''}! Ask me about Beztak policies and procedures.</b></p>
            <p className="mute small">{mode === 'staff' ? 'Look up anything in the Operations Manual while you work on a ticket.' : 'I answer only from the Beztak Operations Manual and show the section I used. For anything personal, I\'ll pass you to a person.'}</p>
            <div className="chat-chips">{STARTERS.map((s) => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}</div>
          </div>
        )}
        {messages.map((m, i) => (
          m.role === 'user' ? <div key={i} className="cm cm-me">{m.text}</div>
            : m.role === 'system' ? <div key={i} className="cm cm-note">{m.text}</div>
              : <Answer key={i} m={m} mode={mode} onAsk={ask} onUseInReply={onUseInReply} onHandOff={canHandOff && !handoff ? openHandoff : null} isLast={m === lastBot} />
        ))}
        {busy && <div className="cm cm-bot cm-typing" aria-label="Looking it up"><i /><i /><i /></div>}
        {handoff && (
          <form className="cm cm-handoff" onSubmit={sendHandoff}>
            <b>Submit a ticket</b>
            <p className="mute small">This creates a support ticket for the HR and Ops team with your question and this chat. A person will reply by email, usually within one business day.</p>
            <label className="field">Your name<input value={handoff.name} onChange={(e) => setHandoff({ ...handoff, name: e.target.value })} autoComplete="name" /></label>
            <label className="field">Your email (so they can reply)<input type="email" required value={handoff.email} onChange={(e) => setHandoff({ ...handoff, email: e.target.value })} autoComplete="email" /></label>
            <label className="field">Anything to add? (optional)<textarea rows={2} value={handoff.note} onChange={(e) => setHandoff({ ...handoff, note: e.target.value })} placeholder="Don't include passwords, ID or bank numbers." /></label>
            {handoff.error && <p className="chat-error" role="alert">{handoff.error}</p>}
            <div className="row"><button className="btn primary" disabled={handoff.busy}>{handoff.busy ? 'Submitting…' : 'Submit ticket'}</button><button type="button" className="btn" onClick={() => setHandoff(null)}>Cancel</button></div>
          </form>
        )}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" aria-label="Your question" maxLength={1000} />
        <button className="btn primary" disabled={busy || !input.trim()}>Ask</button>
      </form>
      {mode === 'employee' && canHandOff && !handoff && <button className="chat-person link" onClick={openHandoff}>Talk to a person</button>}
    </div>
  )
}

// In the desk the people asking ARE the people tickets go to, so the chat never offers to "pass it to a person" there.
const forStaff = (text) => text
  .replace(/,? or I can pass your question to a person\./, '.')
  .replace(/I can pass your question to a person\./, 'This looks like a gap in the manual: check with your manager or the Operations team, and consider adding it to the Manual gaps list.')
  .replace(/ I can pass it to the HR and Ops team\./, ' Handle it as a ticket rather than a manual look-up.')

function Answer({ m, mode, onAsk, onUseInReply, onHandOff, isLast }) {
  const lines = (mode === 'staff' ? forStaff(m.text) : m.text).split('\n').map((l) => l.trim()).filter(Boolean)
  const bullets = lines.filter((l) => /^[-•]\s/.test(l))
  return (
    <div className={`cm cm-bot cm-${m.kind}${m.urgent ? ' cm-urgent' : ''}`}>
      {lines.map((l, i) => (/^[-•]\s/.test(l) ? null : <p key={i}>{l}</p>))}
      {bullets.length > 0 && <ul>{bullets.map((l, i) => <li key={i}>{l.replace(/^[-•]\s/, '')}</li>)}</ul>}
      {m.refs?.length > 0 && <div className="cm-refs">{m.refs.map((r) => <span key={r.ref} className="cm-ref" title={r.title}>{r.ref} · {r.title}</span>)}</div>}
      {m.kind === 'answer' && <p className="cm-src">{m.source === 'AI' ? 'Written by AI from the Beztak Operations Manual and checked against the sections above.' : 'From the Beztak Operations Manual.'}</p>}
      {m.related?.length > 0 && isLast && <div className="chat-chips">{m.related.map((r) => <button key={r.ref} className="chip" onClick={() => onAsk(r.title)}>{r.title}</button>)}</div>}
      <div className="cm-actions">
        {mode === 'staff' && m.kind === 'answer' && onUseInReply && <button className="link" onClick={() => onUseInReply(m.text)}>Use in reply</button>}
        {mode === 'employee' && (m.kind === 'person' || m.kind === 'unknown') && isLast && onHandOff && <button className="btn primary small-btn" onClick={onHandOff}>Pass to a person</button>}
      </div>
    </div>
  )
}
