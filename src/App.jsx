import { useEffect, useRef, useState } from 'react'
import { answerInContext, cite, CONTACTS, DOC, SUGGESTED, TICKET_TYPES } from './assistant.js'
import { SECTIONS } from './data/opsManual.js'
import { askAI, AIUnavailable } from './ai.js'
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

const titleOf = (c) => c.q
const ticketTypeFor = (section) => ({ 3: 'maintenance', 4: 'maintenance', 5: 'vendor', 6: 'access', 9: 'accounting', 11: 'fairhousing' }[section] || 'procedure')

// ---------- alerts shown before any policy text ----------
const ALERTS = {
  danger: {
    tone: 'red', title: 'If anyone is in danger, call 911 now.',
    body: 'Get to a safe place first. For fire, smoke, gas or a carbon monoxide alarm: evacuate, don\'t investigate. Once you are safe, call the emergency maintenance line at (734) 555-0199 and notify Riley Carter at (734) 555-0147.',
    source: 'Ops Manual §3.2, §10.4, §12.3',
  },
  water: {
    tone: 'red', title: 'Treat this as an emergency: call (734) 555-0199.',
    body: 'Use the 24/7 emergency maintenance line. Don\'t just send an email. For a leak, shut off the water at the fixture or unit valve if it is safe to do so, and take photos.',
    source: 'Ops Manual §3.1, §3.3, §3.4',
  },
  injury: {
    tone: 'red', title: 'If someone needs emergency care, call 911.',
    body: 'Don\'t move an injured person unless they are in danger. Don\'t admit fault or discuss insurance. Notify Operations at (734) 555-0147 right away and file an incident report within 24 hours.',
    source: 'Ops Manual §13.1, §13.3, §13.4',
  },
  concern: {
    tone: 'amber', title: 'You can report this, and you don\'t need to explain it to me first.',
    body: 'Workplace concerns go to People Operations: Morgan Ellis, people@glpg-demo.example or (734) 555-0142. If Morgan or your manager is involved, contact Jordan Patel at jordan.patel@glpg-demo.example or (734) 555-0144. Concerns about how a resident or applicant was treated go to compliance@glpg-demo.example right away. This chat is not a reporting channel and is not confidential.',
    source: 'Ops Manual §2.4, §11.1',
  },
  fraud: {
    tone: 'red', title: 'Don\'t act on it. Report it right away.',
    body: 'Call the IT Help Desk at (734) 555-0145 and email security@glpg-demo.example from a safe device. For changed bank or wire details, also call Accounting at (734) 555-0148 and verify only through a phone number already on file. Don\'t wait for an email reply.',
    source: 'Ops Manual §5.7, §15.1–15.3',
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

// Renders the AI's answer: paragraphs, "- " bullets, **bold**, links, and [§x.y] citations as small tags.
function Inline({ text }) {
  return text.split(/(\*\*[^*]+\*\*|\[§\s?\d+\.\d+(?:,\s?§?\s?\d+\.\d+)*\])/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}><Linkify text={part.slice(2, -2)} /></strong>
    if (/^\[§/.test(part)) return <span key={i} className="ref-tag">{part.slice(1, -1)}</span>
    return <Linkify key={i} text={part} />
  })
}
function AIText({ text }) {
  const blocks = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/)
    if (bullet) {
      const last = blocks[blocks.length - 1]
      if (last?.type === 'ul') last.items.push(bullet[1])
      else blocks.push({ type: 'ul', items: [bullet[1]] })
    } else blocks.push({ type: 'p', text: line.replace(/^#+\s*/, '') })
  }
  return blocks.map((b, i) => b.type === 'ul'
    ? <ul key={i} className="policy-list">{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>
    : <p key={i}><Inline text={b.text} /></p>)
}

// ---------- one assistant reply ----------
function Reply({ r, onAsk, onTicket }) {
  if (r.kind === 'welcome') {
    return (
      <div className="bubble bot">
        <p><strong>Hi! I'm Ops Help.</strong> I'm an automated tool, not a person.</p>
        <p>Ask me how to handle day-to-day operations: maintenance, emergencies, keys, vendors, leasing, rent, residents, and safety. I answer only from the approved Operations Manual and show the section each answer comes from.</p>
        <p className="muted">In an emergency, call <a href="tel:911">911</a> first.</p>
        <div className="chips">
          {SUGGESTED.map((s) => <button key={s} className="chip" onClick={() => onAsk(s, { fresh: true })}>{s}</button>)}
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
        <p>{r.thanks ? 'You\'re welcome! Anything else I can help you find?' : 'Hi! What procedure can I help you find?'}</p>
      </div>
    )
  }

  if (r.kind === 'pending') {
    return <div className="bubble bot pending" aria-label="Ops Help is answering"><span className="dots"><i /><i /><i /></span> Checking the manual…</div>
  }
  if (r.kind === 'ai') {
    return (
      <div className="bubble bot">
        {r.alerts.map((a) => <Alert key={a} kind={a} />)}
        {r.notes.map((n, i) => <p key={i} className={`note note-${n.type}`}>{n.text}</p>)}
        <div className="ai-answer"><AIText text={r.text} /></div>
        <p className="ai-label">✨ AI-generated answer based on the {DOC.short}. Check the cited sections before acting.</p>
        {r.cited.length > 0 && (
          <details className="related">
            <summary>Cited sections ({r.cited.length})</summary>
            {r.cited.map((c) => (
              <article key={c.ref} className="answer small">
                <h4><span className="sec-num">§{c.ref}</span> {c.q}</h4>
                <PolicyText text={c.text} />
                <p className="cite">📄 {cite(c)}</p>
              </article>
            ))}
          </details>
        )}
        <div className="reply-actions">
          <span className="muted">Not what you needed?</span>
          <button className="link-btn" onClick={() => onTicket(ticketTypeFor(r.cited[0]?.section))}>Ask Operations</button>
        </div>
      </div>
    )
  }

  const best = r.results[0]
  return (
    <div className="bubble bot">
      {r.alerts.map((a) => <Alert key={a} kind={a} />)}
      {r.notes.map((n, i) => <p key={i} className={`note note-${n.type}`}>{n.text}</p>)}
      {r.aiError && <p className="muted small-text">AI answers aren't available right now ({r.aiError}), so this comes from the manual search.</p>}

      {r.kind === 'alertonly' ? (
        <button className="btn-secondary" onClick={() => onTicket(r.alerts.includes('water') ? 'maintenance' : 'procedure')}>Ask Operations</button>
      ) : r.kind === 'notfound' ? (
        <>
          <p><strong>I couldn't find a clear answer to that in the Operations Manual,</strong> so I can't confirm it. Your property manager or Operations can help.</p>
          {r.suggestions?.length > 0 && (
            <>
              <p className="muted">Did you mean one of these?</p>
              <div className="chips">
                {r.suggestions.map((s) => <button key={s} className="chip" onClick={() => onAsk(s)}>{s}</button>)}
              </div>
            </>
          )}
          <button className="btn-secondary" onClick={() => onTicket('procedure')}>Ask Operations</button>
        </>
      ) : (
        <>
          {r.timeSensitive && (
            <p className="note note-time">⏱ This may be time-sensitive. If it's urgent, call <a href={`tel:${r.contact.phone.replace(/\D/g, '')}`}>{r.contact.phone}</a> ({r.contact.name}) instead of waiting.</p>
          )}
          {r.followUp && <p className="followup">↪ Following up on <strong>{r.followUp}</strong></p>}
          {r.partial && <p className="muted small-text">I didn't find an exact match. This is the closest procedure I found, so check that it fits your situation:</p>}
          <article className="answer">
            <h3>{titleOf(best)}</h3>
            <PolicyText text={best.text} />
            <p className="cite">📄 {cite(best)}</p>
          </article>

          {r.contact && (
            <p className="contact-line">
              Need help with a specific case? <strong>{r.contact.name}</strong> ({r.contact.role}) · <a href={`mailto:${r.contact.email}`}>{r.contact.email}</a>
            </p>
          )}

          {r.results.length > 1 && (
            <details className="related">
              <summary>Related procedures ({r.results.length - 1})</summary>
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
            <button className="link-btn" onClick={() => onTicket(ticketTypeFor(best.section))}>Ask Operations</button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- ticket sheet ----------
function TicketSheet({ initialType, onClose }) {
  const [type, setType] = useState(initialType || 'procedure')
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')
  const [prepared, setPrepared] = useState(false)
  const [copied, setCopied] = useState(false)
  const t = TICKET_TYPES.find((x) => x.id === type)
  const to = CONTACTS[t.to]
  const risky = /\b\d{3}-?\d{2}-?\d{4}\b|\b\d{8,17}\b|password/i.test(subject + ' ' + details)
  const body = `Category: ${t.label}\n\n${details}\n\n(Sent from Ops Help)`
  const mailto = `mailto:${to.email}?subject=${encodeURIComponent(`${t.label} — ${subject}`)}&body=${encodeURIComponent(body)}`

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ticket-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="ticket-title">Ask Operations</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {!prepared ? (
          <form onSubmit={(e) => { e.preventDefault(); setPrepared(true) }}>
            <p className="muted small-text">For a life-safety emergency call 911. For an emergency repair call (734) 555-0199. Don't use this form.</p>
            <label>Topic
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {TICKET_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </label>
            <p className="hint">Goes to <strong>{to.name}</strong> ({to.email}). {t.target}.</p>
            <label>Short subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={90} placeholder="e.g. Approval for $1,800 water heater replacement" />
            </label>
            <label>What do you need?
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} required rows={5} placeholder={t.include} />
            </label>
            <p className="hint">Helpful to include: {t.include}</p>
            {risky && <p className="note note-privacy">This looks like it may contain a password, Social Security number or account number. Please remove it. No one needs these by email.</p>}
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
  const list = ['ops', 'maint', 'emergency', 'accounting', 'broker', 'it', 'security', 'exec', 'people']
  return (
    <div className="contacts">
      <div className="alert alert-red">
        <strong>Emergency or immediate danger: call <a href="tel:911">911</a> first.</strong>
        <p>Emergency repairs (leaks, no heat, unsecured unit): call the 24/7 line at <a href="tel:7345550199">(734) 555-0199</a>.</p>
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
      <p className="muted small-text">No reply? Reply once and copy operations@glpg-demo.example. After one more business day, contact Jordan Patel.</p>
      <p className="cite">📄 {DOC.short}, {DOC.version} · §2 Contacts and Escalation</p>
      <button className="btn-primary" onClick={() => onTicket('procedure')}>Ask Operations</button>
    </div>
  )
}

// ---------- manual tab: browse the whole Operations Manual ----------
function Manual() {
  const [query, setQuery] = useState('')
  const f = query.trim().toLowerCase()
  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.map((it, i) => ({ ...it, ref: `${s.n}.${i + 1}` }))
      .filter((it) => !f || `${s.title} ${it.q} ${it.a} ${it.k || ''}`.toLowerCase().includes(f)),
  })).filter((s) => s.items.length)
  return (
    <div className="manual">
      <h2>{DOC.title}</h2>
      <p className="muted small-text">{DOC.version} · effective {DOC.effective} · owner: {DOC.owner}</p>
      <input className="manual-filter" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter the manual, e.g. keys" aria-label="Filter the manual" />
      {sections.length === 0 && <p className="muted">Nothing matches “{query}”.</p>}
      {sections.map((s) => (
        <details key={s.n} className="manual-section" open={Boolean(f)}>
          <summary><span className="sec-num">§{s.n}</span> {s.title} <span className="muted small-text">({s.items.length})</span></summary>
          {s.items.map((it) => (
            <article key={it.ref} className="answer small">
              <h4><span className="sec-num">{it.ref}</span> {it.q}</h4>
              <PolicyText text={it.a} />
            </article>
          ))}
        </details>
      ))}
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

  // remembers the last question that got a real answer, so follow-ups like "is that an emergency?" make sense
  const lastTopic = useRef(null)
  // AI status for this visit: 'unknown' until the first try, then 'on' or 'off' (falls back to search)
  const [aiMode, setAiMode] = useState('unknown')
  const aiHistory = useRef([]) // the conversation sent to the AI, so follow-ups make sense
  const ask = async (q, { fresh = false } = {}) => {
    const text = q.trim()
    if (!text) return
    setTab('ask')
    setInput('')
    if (fresh) aiHistory.current = []
    // the built-in search always runs: it supplies safety alerts and the fallback answer
    const r = answerInContext(text, fresh ? null : lastTopic.current)
    if (r.kind === 'answer') {
      const best = r.results[0]
      // follow-ups keep the original topic plus the latest detail ("lockout" + "after hours")
      lastTopic.current = r.followUp
        ? { root: lastTopic.current.root, query: `${lastTopic.current.root} ${text}`, topic: titleOf(best) }
        : { root: text, query: text, topic: titleOf(best) }
    }
    // crisis messages, greetings, and visits where the AI is off are answered locally
    if (['crisis', 'smalltalk'].includes(r.kind) || aiMode === 'off') {
      setMessages((m) => [...m, { from: 'me', text }, { from: 'bot', r }])
      return
    }
    const id = Date.now()
    setMessages((m) => [...m, { from: 'me', text }, { from: 'bot', id, r: { kind: 'pending' } }])
    const history = [...aiHistory.current, { role: 'user', content: text }]
    let reply
    try {
      const { text: answerText, cited } = await askAI(history)
      aiHistory.current = [...history, { role: 'assistant', content: answerText }]
      setAiMode('on')
      reply = { kind: 'ai', text: answerText, cited, alerts: r.alerts, notes: r.notes }
    } catch (e) {
      if (!(e instanceof AIUnavailable)) console.error(e)
      // a missing route or key won't fix itself during this visit, so stop trying
      if (/set up|key/.test(e.message)) setAiMode('off')
      reply = { ...r, aiError: e.message }
    }
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, r: reply } : msg)))
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">OH</span>
          <div>
            <h1>Ops Help</h1>
            <p>Great Lakes Property Group</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          <button className={tab === 'ask' ? 'active' : ''} onClick={() => setTab('ask')}>Ask</button>
          <button className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>Manual</button>
          <button className={tab === 'contacts' ? 'active' : ''} onClick={() => setTab('contacts')}>Contacts</button>
        </nav>
      </header>
      <p className="demo-banner">Demo prototype for Beztak. Uses a <strong>fictional</strong> sample Operations Manual ({DOC.version}, effective {DOC.effective}). <span className={`ai-status ai-${aiMode}`}>{aiMode === 'on' ? 'AI answers on' : aiMode === 'off' ? 'Search mode (AI not connected)' : ''}</span></p>

      <main className="main">
        {tab === 'ask' ? (
          <div className="chat" aria-live="polite">
            {messages.map((m, i) => m.from === 'me'
              ? <div key={i} className="bubble me">{m.text}</div>
              : <Reply key={i} r={m.r} onAsk={ask} onTicket={setTicket} />)}
            <div ref={endRef} />
          </div>
        ) : tab === 'manual' ? (
          <Manual />
        ) : (
          <Contacts onTicket={setTicket} />
        )}
      </main>

      {tab === 'ask' && (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask how to handle something…"
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
