import { useEffect, useRef, useState } from 'react'
import { askChat, handToPerson } from './chatClient'
import { HR_ADDRESS } from '../data'
import './chat.css'

// Starter questions show what the chat is for: day-to-day operations from the Beztak Operations Manual.
const STARTERS = ['When is rent due?', 'How fast must work orders be completed?', 'When do I need a purchase order?', 'How fast must on-call respond to an emergency?']

// Name and email are asked once and remembered on this device (never sent anywhere except with the chat's ticket).
const CONTACT_KEY = 'ask-beztak-contact'
const readContact = () => { try { return JSON.parse(localStorage.getItem(CONTACT_KEY)) || {} } catch { return {} } }
const saveContact = (c) => { try { localStorage.setItem(CONTACT_KEY, JSON.stringify(c)) } catch { /* private window: asked again next time */ } }
const validEmail = (e) => /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(String(e || '').trim())
// Keeps each bubble to its own answer: a paragraph that repeats an earlier answer in this chat (same manual section, or
// mostly the same words) is left out, as long as something new is left to show.
const wordsOf = (t) => new Set(String(t).toLowerCase().replace(/\[[^\]]*\]/g, ' ').match(/[a-z0-9$.:]+/g) || [])
const refsOf = (t) => [...String(t).matchAll(/\[([A-Z0-9][\w.-]*)\]/g)].map((x) => x[1])
function withoutRepeats(res, earlier) {
  const before = earlier.filter((m) => m.role === 'assistant' && m.kind === 'answer')
  if (res.kind !== 'answer' || !before.length) return res
  const oldRefs = new Set(before.flatMap((m) => [...(m.refs || []).map((r) => r.ref), ...refsOf(m.text)]))
  const oldWords = wordsOf(before.map((m) => m.text).join(' '))
  const repeats = (p) => {
    const refs = refsOf(p)
    if (refs.length && refs.every((r) => oldRefs.has(r))) return true
    const w = [...wordsOf(p)]
    return w.length >= 4 && w.filter((x) => oldWords.has(x)).length / w.length >= 0.8
  }
  const paras = String(res.text).split(/\n+/)
  const kept = paras.filter((p) => !repeats(p))
  if (!kept.length || kept.length === paras.length) return res
  const text = kept.join('\n')
  const used = new Set(refsOf(text))
  return { ...res, text, refs: (res.refs || []).filter((r) => used.has(r.ref) || !oldRefs.has(r.ref)) }
}
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`)

// One chat, the same everywhere: the "Ask Beztak" page, the bubble on other sites, the employee view after sign-in,
// and the bubble inside the HR and Ops desk. Every conversation is saved as one ticket for the HR and Ops team:
// answered chats are filed as "AI answered", anything that needs a person lands in the team's ticket list.
// `user` fills in the name and email for people who are signed in. `onUseInReply` (desk only) adds an answer to the open ticket.
// `alwaysAsk` (the desk's bubble) asks for a name and email every time a chat starts and does not remember them.
export default function Chat({ user, onUseInReply, compact = false, alwaysAsk = false }) {
  const [contact, setContact] = useState(() => {
    if (alwaysAsk) return { name: '', email: '' }
    const saved = readContact()
    return { name: user?.name || saved.name || '', email: user?.email || saved.email || '' }
  })
  const [ready, setReady] = useState(() => Boolean(contact.name.trim() && validEmail(contact.email)))
  const [conversationId] = useState(newId)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [handoff, setHandoff] = useState(null) // the "Submit a ticket" form
  const endRef = useRef(null)
  const inputRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [messages, busy, handoff, ready])

  const start = (e) => {
    e.preventDefault()
    const c = { name: contact.name.trim(), email: contact.email.trim() }
    if (!c.name || !validEmail(c.email)) return
    setContact(c)
    if (!user?.email && !alwaysAsk) saveContact(c)
    setReady(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  const ask = async (q) => {
    const text = q.trim()
    if (!text || busy || !ready) return
    setInput('')
    setHandoff(null)
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
    setMessages((m) => [...m, { role: 'user', text }])
    setBusy(true)
    let res = withoutRepeats(await askChat(text, history, { conversationId, ...contact }), history)
    // "I've created a ticket" is only said when the help desk really saved one
    if (res.handoff && !(res.via === 'helper' && res.ticket)) res = { ...res, text: `I can't answer that one, and I couldn't reach the help desk to create a ticket. Please email your question to ${HR_ADDRESS}, or try again in a few minutes.` }
    setMessages((m) => [...m, { role: 'assistant', ...res }])
    setBusy(false)
    inputRef.current?.focus()
  }
  const transcript = () => messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, text: m.text }))
  const openHandoff = () => setHandoff({ note: '', busy: false, error: '' })
  const sendHandoff = async (e) => {
    e.preventDefault()
    setHandoff((h) => ({ ...h, busy: true, error: '' }))
    try {
      const r = await handToPerson({ conversationId, ...contact, note: handoff.note, transcript: transcript() })
      setHandoff(null)
      setMessages((m) => [...m, { role: 'system', text: `Ticket submitted. ${r.assignee || 'The HR and Ops team'} will handle it${r.urgent ? ', and it is marked urgent' : ''}. They will reply by email to ${contact.email}, and we also sent you an email to confirm.` }])
    } catch (err) {
      const offline = !err.status || err.status >= 500 || err.status === 404 || err.status === 401
      setHandoff((h) => ({ ...h, busy: false, error: offline ? `The help desk can't be reached right now. Please email your question to ${HR_ADDRESS}.` : err.message }))
    }
  }

  const lastBot = [...messages].reverse().find((m) => m.role === 'assistant')
  const asked = messages.some((m) => m.role === 'user')

  return (
    <div className={`chat${compact ? ' compact' : ''}`}>
      <div className="chat-log" aria-live="polite">
        {!ready ? (
          <form className="chat-hello chat-start" onSubmit={start}>
            <p><b>Hi! Ask me about Beztak policies and procedures.</b></p>
            <p className="mute small">I answer only from the Beztak Operations Manual. Each chat is saved as a ticket so the HR and Ops team can follow up, so first tell us who you are.{alwaysAsk ? '' : " We'll remember it on this device."}</p>
            <label className="field">Your name<input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} autoComplete="name" required /></label>
            <label className="field">Your email<input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} autoComplete="email" required /></label>
            <button className="btn primary" disabled={!contact.name.trim() || !validEmail(contact.email)}>Start chat</button>
          </form>
        ) : messages.length === 0 && (
          <div className="chat-hello">
            <p><b>Hi {contact.name.split(' ')[0]}! Ask me about Beztak policies and procedures.</b></p>
            <p className="mute small">I answer only from the Beztak Operations Manual and show the section I used. This chat is saved as a ticket for the HR and Ops team, and for anything personal I'll pass you to a person. <button type="button" className="link small" onClick={() => setReady(false)}>Not {contact.name.split(' ')[0]}?</button></p>
            <div className="chat-chips">{STARTERS.map((s) => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}</div>
          </div>
        )}
        {messages.map((m, i) => (
          m.role === 'user' ? <div key={i} className="cm cm-me">{m.text}</div>
            : m.role === 'system' ? <div key={i} className="cm cm-note">{m.text}</div>
              : <Answer key={i} m={m} onAsk={ask} onUseInReply={onUseInReply} isLast={m === lastBot} />
        ))}
        {busy && <div className="cm cm-bot cm-typing" aria-label="Looking it up"><i /><i /><i /></div>}
        {handoff && (
          <form className="cm cm-handoff" onSubmit={sendHandoff}>
            <b>Submit a ticket</b>
            <p className="mute small">This sends your question and this chat to the HR and Ops team as a support ticket. A person will reply by email to <b>{contact.email}</b>, usually within one business day.</p>
            <label className="field">Anything to add? (optional)<textarea rows={2} value={handoff.note} onChange={(e) => setHandoff({ ...handoff, note: e.target.value })} placeholder="Don't include passwords, ID or bank numbers." /></label>
            {handoff.error && <p className="chat-error" role="alert">{handoff.error}</p>}
            <div className="row"><button className="btn primary" disabled={handoff.busy}>{handoff.busy ? 'Submitting…' : 'Submit ticket'}</button><button type="button" className="btn" onClick={() => setHandoff(null)}>Cancel</button></div>
          </form>
        )}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder={ready ? 'Ask a question…' : 'Enter your name and email first'} aria-label="Your question" maxLength={1000} disabled={!ready} />
        <button className="btn primary" disabled={busy || !ready || !input.trim()}>Ask</button>
      </form>
      {ready && asked && !handoff && <button className="chat-person link" onClick={openHandoff}>Talk to a person</button>}
    </div>
  )
}

function Answer({ m, onAsk, onUseInReply, isLast }) {
  const lines = m.text.split('\n').map((l) => l.trim()).filter(Boolean)
  const bullets = lines.filter((l) => /^[-•]\s/.test(l))
  return (
    <div className={`cm cm-bot cm-${m.kind}${m.urgent ? ' cm-urgent' : ''}`}>
      {lines.map((l, i) => (/^[-•]\s/.test(l) ? null : <p key={i}>{l}</p>))}
      {bullets.length > 0 && <ul>{bullets.map((l, i) => <li key={i}>{l.replace(/^[-•]\s/, '')}</li>)}</ul>}
      {m.refs?.length > 0 && <div className="cm-refs">{m.refs.map((r) => <span key={r.ref} className="cm-ref" title={r.title}>{r.ref} · {r.title}</span>)}</div>}
      {m.related?.length > 0 && isLast && <div className="chat-chips">{m.related.map((r) => <button key={r.ref} className="chip" onClick={() => onAsk(r.title)}>{r.title}</button>)}</div>}
      <div className="cm-actions">
        {m.kind === 'answer' && onUseInReply && <button className="link" onClick={() => onUseInReply(m.text)}>Use in reply</button>}
      </div>
    </div>
  )
}
