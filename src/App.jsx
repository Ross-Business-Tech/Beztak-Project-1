import { useEffect, useRef, useState } from 'react'
import { answer, cite, CONTACTS, DOC, SUGGESTED, TICKET_TYPES } from './assistant.js'
import './App.css'

// ---------- small helpers ----------
const LINK_RE = /([\w.+-]+@glpg-demo\.example|\(\d{3}\) \d{3}-\d{4}|\b911\b|\b988\b)/g

function Linkify({ text }) {
  return text.split(LINK_RE).map((part, i) => {
    if (i % 2 === 0) return part
    if (part.includes('@')) return <a key={i} href={`mailto:${part}`}>{part}</a>
    return <a key={i} href={`tel:${part.replace(/\D/g, '')}`}>{part}</a>
  })
}

function PolicyText({ text }) {
  const lines = text.split('\n').map((l) => l.replace(/^•\s*/, '').trim()).filter(Boolean)
  if (lines.length === 1) return <p><Linkify text={lines[0]} /></p>
  return (
    <ul className="policy-list">
      {lines.map((l, i) => <li key={i}><Linkify text={l} /></li>)}
    </ul>
  )
}

const titleOf = (c) => (c.q ? c.q.replace(/\?\s.*$/, '?') : c.sub || c.sectionTitle)
const ticketTypeFor = (section) => ({ 10: 'payroll', 7: 'payroll', 12: 'payroll', 16: 'benefits', 6: 'leave', 13: 'leave', 14: 'leave', 15: 'leave', 5: 'relations', 28: 'relations', 8: 'records' }[section] || 'policy')

// ---------- alerts shown before any policy text ----------
const ALERTS = {
  danger: {
    tone: 'red', title: 'If you are in immediate danger, call 911 now.',
    body: 'Move to a safe place first. When you are safe, tell your manager and People Operations (Morgan Ellis, (734) 555-0142). For a property emergency, also call Operations at (734) 555-0147.',
    source: 'Employee Handbook §25 and §29',
  },
  injury: {
    tone: 'red', title: 'If you need emergency care, call 911.',
    body: 'As soon as you are safe, notify your manager and People Operations at people@glpg-demo.example, and submit an incident report within 24 hours, even if the injury seems minor.',
    source: 'Employee Handbook §17, p. 15',
  },
  concern: {
    tone: 'amber', title: 'You can report this, and you don\'t need to explain it to me first.',
    body: 'Contact Morgan Ellis at people@glpg-demo.example or (734) 555-0142. If Morgan or your manager is involved, contact Jordan Patel directly at jordan.patel@glpg-demo.example or (734) 555-0144. You can also report anonymously through the employee portal reporting form. Retaliation for reporting is prohibited. This chat is not a reporting channel and is not confidential.',
    source: 'Employee Handbook §5, p. 7 · §3, p. 6',
  },
  fraud: {
    tone: 'red', title: 'Don\'t act on it. Report it right away.',
    body: 'Call the IT Help Desk at (734) 555-0145 and email security@glpg-demo.example from a safe device. For changed wire instructions, also call the Managing Broker at (734) 555-0146. Don\'t wait for a ticket response.',
    source: 'Employee Handbook §21, pp. 17–18 · §33, p. 26',
  },
}

function Alert({ kind }) {
  const a = ALERTS[kind]
  return (
    <div className={`alert alert-${a.tone}`} role="alert">
      <strong>{a.title}</strong>
      <p><Linkify text={a.body} /></p>
      <span className="alert-source">Source: {a.source}</span>
    </div>
  )
}

// ---------- one assistant reply ----------
function Reply({ r, onAsk, onTicket }) {
  if (r.kind === 'welcome') {
    return (
      <div className="bubble bot">
        <p><strong>Hi! I'm the HR help assistant.</strong> I'm an automated tool, not a person in HR.</p>
        <p>Ask me about pay, time off, benefits, leave, or workplace rules. I answer only from the approved Employee Handbook and show where each answer comes from.</p>
        <p className="muted">In an emergency, call <a href="tel:911">911</a> first.</p>
        <div className="chips">
          {SUGGESTED.map((s) => <button key={s} className="chip" onClick={() => onAsk(s)}>{s}</button>)}
        </div>
      </div>
    )
  }
  if (r.kind === 'crisis') {
    return (
      <div className="bubble bot">
        <div className="alert alert-red" role="alert">
          <strong>I'm really sorry you're going through this. You deserve support right now.</strong>
          <p>If you might act on these thoughts or are in danger, call <a href="tel:911">911</a>. You can also call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline, US) any time. It's free and confidential.</p>
          <p>When you're ready, People Operations can help with time away or support at work: Morgan Ellis, <a href="tel:7345550142">(734) 555-0142</a>.</p>
        </div>
      </div>
    )
  }
  if (r.kind === 'smalltalk') {
    return (
      <div className="bubble bot">
        <p>{r.thanks ? 'You\'re welcome! Anything else I can help you find?' : 'Hi! What HR question can I help you with?'}</p>
      </div>
    )
  }

  const best = r.results[0]
  return (
    <div className="bubble bot">
      {r.alerts.map((a) => <Alert key={a} kind={a} />)}
      {r.notes.map((n, i) => <p key={i} className={`note note-${n.type}`}>{n.text}</p>)}

      {r.kind === 'alertonly' ? (
        <button className="btn-secondary" onClick={() => onTicket(r.alerts.includes('concern') ? 'relations' : 'policy')}>Ask HR directly</button>
      ) : r.kind === 'notfound' ? (
        <>
          <p><strong>I couldn't find a clear answer to that in the handbook,</strong> so I can't confirm it. People Operations can help.</p>
          {r.suggestions?.length > 0 && (
            <>
              <p className="muted">Did you mean one of these?</p>
              <div className="chips">
                {r.suggestions.map((s) => <button key={s} className="chip" onClick={() => onAsk(s)}>{s}</button>)}
              </div>
            </>
          )}
          <button className="btn-secondary" onClick={() => onTicket('policy')}>Ask HR directly</button>
        </>
      ) : (
        <>
          {r.condolence && <p>I'm so sorry for your loss. Here's what the handbook says about bereavement leave.</p>}
          {r.timeSensitive && (
            <p className="note note-time">⏱ This may be time-sensitive. If it's urgent, contact {r.contact.name} directly at <a href={`tel:${r.contact.phone.replace(/\D/g, '')}`}>{r.contact.phone}</a> instead of waiting.</p>
          )}
          {r.partial && <p className="muted small-text">I didn't find an exact match. This is the closest policy I found, so check that it fits your situation:</p>}
          <article className="answer">
            <h3>{titleOf(best)}</h3>
            <PolicyText text={best.text} />
            <p className="cite">📄 {cite(best)}</p>
          </article>

          {r.contact && (
            <p className="contact-line">
              Questions about your own situation? <strong>{r.contact.name}</strong> ({r.contact.role}) · <a href={`mailto:${r.contact.email}`}>{r.contact.email}</a>
            </p>
          )}

          {r.results.length > 1 && (
            <details className="related">
              <summary>Related policies ({r.results.length - 1})</summary>
              {r.results.slice(1).map((c) => (
                <article key={c.id} className="answer small">
                  <h4>{titleOf(c)}</h4>
                  <PolicyText text={c.text} />
                  <p className="cite">📄 {cite(c)}</p>
                </article>
              ))}
            </details>
          )}
          <div className="reply-actions">
            <span className="muted">Not what you needed?</span>
            <button className="link-btn" onClick={() => onTicket(ticketTypeFor(best.section))}>Ask HR directly</button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- ticket sheet ----------
function TicketSheet({ initialType, onClose }) {
  const [type, setType] = useState(initialType || 'policy')
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')
  const [prepared, setPrepared] = useState(false)
  const [copied, setCopied] = useState(false)
  const t = TICKET_TYPES.find((x) => x.id === type)
  const to = CONTACTS[t.to]
  const risky = /\b\d{3}-?\d{2}-?\d{4}\b|\b\d{8,17}\b|password/i.test(subject + ' ' + details)
  const body = `Category: ${t.label}\n\n${details}\n\n(Sent from the HR help assistant)`
  const mailto = `mailto:${to.email}?subject=${encodeURIComponent(`${t.label} — ${subject}`)}&body=${encodeURIComponent(body)}`

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ticket-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="ticket-title">Ask HR directly</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {!prepared ? (
          <form onSubmit={(e) => { e.preventDefault(); setPrepared(true) }}>
            <p className="muted small-text">For an emergency or threat, call 911 first. Don't use this form.</p>
            <label>Topic
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {TICKET_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </label>
            <p className="hint">Goes to <strong>{to.name}</strong> ({to.email}). {t.target}.</p>
            <label>Short subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={90} placeholder="e.g. Missing 4 hours on Oct 30 pay statement" />
            </label>
            <label>What do you need?
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} required rows={5} placeholder={t.include} />
            </label>
            <p className="hint">Helpful to include: {t.include}</p>
            {risky && <p className="note note-privacy">This looks like it may contain a password, Social Security number or account number. Please remove it. HR will never need these by email.</p>}
            <button className="btn-primary" type="submit" disabled={risky}>Review</button>
          </form>
        ) : (
          <div className="prepared">
            <p className="note note-time"><strong>Not sent yet.</strong> This demo isn't connected to a ticket system. Tap below to send it from your email app.</p>
            <dl>
              <dt>To</dt><dd>{to.name}: {to.email}</dd>
              <dt>Subject</dt><dd>{t.label}: {subject}</dd>
              <dt>Message</dt><dd className="pre">{details}</dd>
              <dt>Response target</dt><dd>{t.target} (internal target, not a guarantee)</dd>
            </dl>
            <a className="btn-primary" href={mailto}>Open in my email app</a>
            <div className="row">
              <button className="btn-secondary" onClick={() => setPrepared(false)}>Edit</button>
              <button className="btn-secondary" onClick={() => {
                navigator.clipboard?.writeText(`To: ${to.email}\nSubject: ${t.label}: ${subject}\n\n${body}`).then(() => setCopied(true), () => {})
              }}>{copied ? 'Copied ✓' : 'Copy text'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- contacts tab ----------
function Contacts({ onTicket }) {
  const list = ['people', 'payroll', 'benefits', 'leave', 'broker', 'ops', 'it', 'security', 'exec']
  return (
    <div className="contacts">
      <div className="alert alert-red">
        <strong>Emergency or immediate danger: call <a href="tel:911">911</a> first.</strong>
        <p>Then tell your manager and People Operations when you are safe.</p>
      </div>
      <h2>Who to contact</h2>
      <ul className="contact-list">
        {list.map((k) => {
          const c = CONTACTS[k]
          return (
            <li key={k}>
              <div className="contact-name"><strong>{c.name}</strong> <span className="muted">· {c.role}</span></div>
              <div className="muted small-text">{c.handles}</div>
              <div className="contact-links">
                <a href={`mailto:${c.email}`}>{c.email}</a>
                <a href={`tel:${c.phone.replace(/\D/g, '')}`}>{c.phone}</a>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="muted small-text">If your concern involves Morgan Ellis or your manager, contact Jordan Patel directly. Anonymous reports: employee portal, Report form.</p>
      <p className="cite">📄 {DOC.short}, {DOC.version} · §3 Contacts, Service Standards, and Escalation · p. 5 · Appendix A, p. 29</p>
      <button className="btn-primary" onClick={() => onTicket('policy')}>Ask HR directly</button>
    </div>
  )
}

// ---------- app ----------
export default function App() {
  const [tab, setTab] = useState('ask')
  const [messages, setMessages] = useState([{ from: 'bot', r: { kind: 'welcome' } }])
  const [input, setInput] = useState('')
  const [ticket, setTicket] = useState(null)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages])

  const ask = (q) => {
    const text = q.trim()
    if (!text) return
    setTab('ask')
    setMessages((m) => [...m, { from: 'me', text }, { from: 'bot', r: answer(text) }])
    setInput('')
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">HR</span>
          <div>
            <h1>HR Help</h1>
            <p>Great Lakes Property Group</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          <button className={tab === 'ask' ? 'active' : ''} onClick={() => setTab('ask')}>Ask</button>
          <button className={tab === 'contacts' ? 'active' : ''} onClick={() => setTab('contacts')}>Contacts</button>
        </nav>
      </header>
      <p className="demo-banner">Demo prototype for Beztak. Uses a <strong>fictional</strong> sample handbook ({DOC.version}, effective {DOC.effective}).</p>

      <main className="main">
        {tab === 'ask' ? (
          <div className="chat" aria-live="polite">
            {messages.map((m, i) => m.from === 'me'
              ? <div key={i} className="bubble me">{m.text}</div>
              : <Reply key={i} r={m.r} onAsk={ask} onTicket={setTicket} />)}
            <div ref={endRef} />
          </div>
        ) : (
          <Contacts onTicket={setTicket} />
        )}
      </main>

      {tab === 'ask' && (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask an HR question…"
            aria-label="Your question"
            maxLength={300}
          />
          <button type="submit" disabled={!input.trim()}>Ask</button>
        </form>
      )}

      {ticket && <TicketSheet initialType={ticket} onClose={() => setTicket(null)} />}
    </div>
  )
}
