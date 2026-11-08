import { useState } from 'react'
import { AGENTS } from './data'
import { topicLabel } from './triage'
import { agentName, ago, dueInfo, fill, initials, pendingAdviceFor, toLocalInput } from './util'

const STATUSES = ['Open', 'In progress', 'On hold', 'Closed']
const DEPTS = ['benefits', 'payroll', 'timeoff', 'onboarding', 'relations', 'general']

export const Prio = ({ urgent }) => <span className={`badge ${urgent ? 'red' : 'grey'}`}>{urgent ? '● Urgent' : 'Normal'}</span>
export const Status = ({ s }) => <span className={`badge st-${s.replace(' ', '')}`}>{s}</span>
export const Avatar = ({ name }) => <span className="avatar">{initials(name)}</span>
const Due = ({ t }) => { const d = dueInfo(t); return d ? <span className={`badge ${d.cls}`}>⏱ {d.text}</span> : <span className="mute">–</span> }

export function List({ tickets, me, open, reset }) {
  const [view, setView] = useState('mine')
  const [q, setQ] = useState('')
  const owned = tickets.filter((t) => t.assignee === me)
  const live = (t) => t.status !== 'Closed'
  const tags = [...new Set(tickets.flatMap((t) => t.tags || []))].sort()
  const views = [
    ['mine', 'My open tickets', owned.filter(live), true],
    ['advice', 'Advice requested', tickets.filter((t) => pendingAdviceFor(t, me).length)],
    ['due', 'Due soon / overdue', owned.filter((t) => live(t) && ['red', 'amber'].includes(dueInfo(t)?.cls))],
    ['urgent', 'Urgent', owned.filter((t) => live(t) && t.urgent)],
    ['ai', 'Resolved by AI', owned.filter((t) => t.resolvedByAI)],
    ['closed', 'Closed', owned.filter((t) => !live(t))],
    ['all', 'All my tickets', tickets],
  ]
  const tagView = view.startsWith('tag:') ? view.slice(4) : null
  const current = tagView ? tickets.filter((t) => (t.tags || []).includes(tagView)) : views.find((v) => v[0] === view)[2]
  const label = tagView ? `Tag: ${tagView}` : views.find((v) => v[0] === view)[1]
  const text = q.trim().toLowerCase()
  const rows = current.filter((t) => !text || `${t.id} ${t.subject} ${t.customer} ${t.email} ${(t.tags || []).join(' ')}`.toLowerCase().includes(text))
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt) || b.id - a.id)
    .sort((a, b) => Number(live(b)) - Number(live(a)))

  return (
    <div className="split">
      <nav className="views">
        <div className="views-h">My views</div>
        {views.map(([k, n, list]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{n}<em>{list.length}</em></button>)}
        {tags.length > 0 && <div className="views-h">Tags</div>}
        {tags.map((g) => <button key={g} className={view === `tag:${g}` ? 'on' : ''} onClick={() => setView(`tag:${g}`)}># {g}</button>)}
        <button className="reset" onClick={reset}>Reset sample data</button>
      </nav>
      <section className="panel grow">
        <div className="panel-h">
          <h2>{label} <span className="count">{rows.length}</span></h2>
          <input className="search" placeholder="Search my tickets…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table">
          <div className="tr th"><span>Ticket</span><span>Contact</span><span>Status</span><span>Priority</span><span>Deadline</span><span>Owner</span></div>
          {rows.length === 0 && <p className="empty">Nothing here. You only see tickets assigned to you or where you were asked for advice.</p>}
          {rows.map((t) => {
            const adv = pendingAdviceFor(t, me).length > 0
            return (
              <button key={t.id} className="tr" onClick={() => open(t.id)}>
                <span className="subj"><b>{t.subject}</b>
                  <small>#{t.id} · {topicLabel(t.topic)}{t.resolvedByAI ? ' · 🤖 AI replied' : ''}{adv ? ' · 💡 advice requested' : ''}{(t.tags || []).map((g) => ` #${g}`).join('')}</small></span>
                <span className="contact"><Avatar name={t.customer} />{t.customer}</span>
                <span><Status s={t.status} /></span>
                <span><Prio urgent={t.urgent} /></span>
                <span className="duecol"><Due t={t} /></span>
                <span className="owner">{t.assignee === me ? 'Me' : agentName(t.assignee)}</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export function Detail({ ticket: t, all, me, canned, update, transfer, merge, toast, back }) {
  const [text, setText] = useState('')
  const [tab, setTab] = useState('reply')
  const [tag, setTag] = useState('')
  const [adviceTo, setAdviceTo] = useState('')
  const [adviceQ, setAdviceQ] = useState('')
  const [mergeId, setMergeId] = useState('')
  const [answers, setAnswers] = useState({})
  if (!t || !all.some((x) => x.id === t.id)) return <><p className="empty">That ticket isn't in your list.</p><button className="btn" onClick={back}>← Back to tickets</button></>

  const owner = t.assignee === me
  const thread = [{ from: t.customer, text: t.body, at: t.createdAt, inbound: true }, ...t.replies]
  const others = AGENTS.filter((a) => a.id !== me)
  const mergeTargets = all.filter((x) => x.id !== t.id && x.assignee === me && x.status !== 'Closed')
  const stamp = () => new Date().toISOString()

  const send = (e) => {
    e.preventDefault()
    if (!text.trim()) return
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

  return (
    <div className="detail">
      <div className="crumbs"><button className="link" onClick={back}>← All tickets</button> <span>#{t.id}</span></div>
      {!owner && <div className="banner">You're helping <b>{agentName(t.assignee)}</b> on this ticket. You can read it and answer the advice request below.</div>}
      {t.mergedInto && <div className="banner">This ticket was merged into #{t.mergedInto}.</div>}
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-h col">
            <h2>{t.subject}</h2>
            <div className="row"><Status s={t.status} /><Prio urgent={t.urgent} /><span className="badge grey">{topicLabel(t.topic)}</span><Due t={t} />{t.resolvedByAI && <span className="badge violet">🤖 Resolved by AI</span>}</div>
          </div>
          <div className="ai-box"><b>🤖 AI agent</b><p>{t.note}</p></div>
          <div className="thread">
            {thread.map((m, i) => m.event
              ? <div key={i} className="event">{m.text} · {ago(m.at)}</div>
              : (
                <article key={i} className={`msg ${m.inbound ? 'in' : m.note ? 'note' : 'out'}`}>
                  <Avatar name={m.from} />
                  <div>
                    <div className="msg-h"><b>{m.from}</b>{i === 0 && <small> &lt;{t.email}&gt;</small>}<small> · {m.note ? '🔒 Private note' : m.inbound ? '✉️ Received by email' : m.ai ? '✉️ Sent by AI by email' : '✉️ Sent by email'} · {ago(m.at)}</small></div>
                    <p>{m.text}</p>
                  </div>
                </article>
              ))}
          </div>

          {t.advice.length > 0 && (
            <div className="advice">
              <h3>🤝 Team advice</h3>
              {t.advice.map((a) => (
                <div key={a.id} className="adv">
                  <div><b>{agentName(a.from)}</b> asked <b>{a.to === me ? 'you' : agentName(a.to)}</b> · {ago(a.at)}</div>
                  <p className="q">“{a.question}”</p>
                  {a.answer
                    ? <p className="a"><b>{agentName(a.to)}:</b> {a.answer}</p>
                    : a.to === me
                      ? <div className="row grow"><textarea rows={2} placeholder="Your advice…" value={answers[a.id] || ''} onChange={(e) => setAnswers({ ...answers, [a.id]: e.target.value })} /><button className="btn primary" onClick={() => answer(a)}>Send advice</button></div>
                      : <small className="mute">⏳ Waiting for {agentName(a.to)}</small>}
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
                  <option value="">💬 Insert canned reply…</option>
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
