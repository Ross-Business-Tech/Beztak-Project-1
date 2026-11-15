import { useEffect, useRef, useState } from 'react'
import { AGENTS, SEED_DOCS, SEED_TICKETS, agentForAccount } from './data'
import { Dashboard, Documents, Profile, Setup } from './Pages'
import GapTracker from './GapTracker'
import Guardrails from './Guardrails'
import { Detail, List, VIEW_NAMES } from './Tickets'
import { clearFiles } from './fileStore'
import { DEFAULT_HELPER_URL, helperCall } from './helper'
import { followUp } from './escalate'
import { setActiveManualTitles } from './activeManual'
import { ackText, triage } from './triage'
import { agentName, canSee, dueIn, initials } from './util'

const store = (key, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(key)); if (v) return v } catch { /* ignore */ }
  return fallback
}
const Ico = ({ d }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const NAV = [
  ['tickets', 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z', 'Tickets'],
  ['dashboard', 'M4 20V10M10 20V4M16 20v-7M22 20H2', 'Reports'],
  ['gaps', 'M12 3l9 16H3zM12 10v4M12 17h.01', 'Gaps'],
  ['kb', 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7', 'Documents'],
  ['settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z', 'Setup'],
]

export default function App({ account, signOut }) {
  // Who you are comes from the account you signed in with. A login that is not linked to an HR person (the shared team login)
  // views the desk as the first team member, and Profile says so.
  const linked = agentForAccount(account)
  const me = (linked || AGENTS[0]).id
  const [tickets, setTickets] = useState(() => store('hr-desk-tickets-v5', SEED_TICKETS))
  const [docs, setDocs] = useState(() => store('hr-desk-docs-v2', SEED_DOCS))
  const [prefs, setPrefs] = useState(() => ({ theme: 'light', notify: true, ooo: false, ...store('hr-desk-prefs', {}) }))
  const [helper, setHelper] = useState(() => ({ url: DEFAULT_HELPER_URL, token: '', ...store('hr-desk-helper', {}) }))
  const [nav, setNav] = useState({ view: 'mine' })
  // Guardrails is a back-office page for the project team: not in the menu, opened from Setup or /#guardrails.
  const [page, setPage] = useState(() => (location.hash === '#guardrails' ? 'guardrails' : 'tickets'))
  useEffect(() => { if (page !== 'guardrails' && location.hash === '#guardrails') history.replaceState(null, '', location.pathname + location.search) }, [page])
  const [openId, setOpenId] = useState(null)
  useEffect(() => { const f = () => { if (location.hash === '#guardrails') { setPage('guardrails'); setOpenId(null) } }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  const [toast, setToast] = useState('')
  useEffect(() => { try { localStorage.setItem('hr-desk-tickets-v5', JSON.stringify(tickets)); localStorage.setItem('hr-desk-docs-v2', JSON.stringify(docs)); localStorage.setItem('hr-desk-prefs', JSON.stringify(prefs)); localStorage.setItem('hr-desk-helper', JSON.stringify(helper)) } catch { /* ignore */ } }, [tickets, docs, prefs, helper])
  useEffect(() => { document.documentElement.dataset.theme = prefs.theme }, [prefs.theme])
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id) }, [toast])

  const ticketsRef = useRef(tickets)
  useEffect(() => { ticketsRef.current = tickets }, [tickets])
  const syncing = useRef(false)
  const runNow = useRef(null)
  const [manualAt, setManualAt] = useState('') // changes when the assistant's manual changes, so the Manual gaps page names sections right
  const [helperStatus, setHelperStatus] = useState(null) // what the last inbox check found, shown in the profile
  // Every 30 seconds: pull new emails from the helper, turn them into tickets, let the
  // AI agent answer what it can (sent by email), and attach customer follow-ups.
  useEffect(() => {
    if (!helper.token || !helper.url) return
    const parse = (from) => { const m = from.match(/^\s*"?([^"<]*?)"?\s*<(.+)>\s*$/); return m ? { name: m[1] || m[2], email: m[2] } : { name: from, email: from } }
    const run = async (force) => {
      if (syncing.current) return
      syncing.current = true
      try {
        // Only emails that arrive after this browser was connected become tickets (with a few minutes of slack),
        // so connecting never re-imports the old inbox. Reconnecting starts the clock again.
        let since = helper.connectedAt
        if (!since) { since = new Date().toISOString(); setHelper((h) => (h.connectedAt ? h : { ...h, connectedAt: since })) }
        const cutoff = new Date(since).getTime() - 10 * 60000
        let older = 0
        let hidden = 0
        // What the helper itself reports about its last look at Gmail (an older helper has no such page).
        const readStatus = async () => {
          try { const s = await helperCall(helper, '/status'); if (s.at) s.mins = Math.round((Date.now() - new Date(s.at)) / 60000); return s } catch (e) { return e.message === 'Not found' ? { oldHelper: true } : null }
        }
        let mail = await readStatus()
        try { const mi = await helperCall(helper, '/manual'); setActiveManualTitles(mi.custom ? mi.sectionTitles : null); setManualAt(mi.custom ? mi.at : '') } catch { /* an older helper has no manual page */ }
        // The helper checks Gmail by itself every minute. If it has gone quiet (its schedule is missing in Cloudflare, say),
        // or the button was pressed, ask it to check right now. A failure is then shown in the profile instead of staying hidden.
        const quiet = !mail || mail.never || (mail.mins ?? 0) > 3
        const remote = await helperCall(helper, force || quiet ? '/tickets?refresh=1' : '/tickets')
        if (force || quiet) mail = (await readStatus()) || mail
        const newest = remote.map((r) => ({ subject: r.subject, customer: r.customer, at: r.createdAt })).sort((a, b) => new Date(b.at) - new Date(a.at))[0] || null
        const cur = ticketsRef.current
        const created = []
        const follow = {}
        let nextId = Math.max(1000, ...cur.map((x) => x.id))
        for (const r of [...remote].reverse()) {
          const inbound = r.replies.filter((m) => m.inbound)
          const local = cur.find((x) => x.threadId === r.id)
          if (local) {
            const known = new Set(local.replies.map((m) => m.messageId).filter(Boolean))
            const fresh = inbound.filter((m) => m.messageId !== local.firstMessageId && !known.has(m.messageId))
            if (fresh.length) follow[local.id] = fresh
          } else if (inbound[0] && !/no-?reply|mailer-daemon/i.test(r.customer) && new Date(inbound[0].at).getTime() < cutoff) {
            older++
          } else if (!inbound[0] || /no-?reply|mailer-daemon/i.test(r.customer)) {
            hidden++
          } else {
            const { name, email } = parse(r.customer)
            // The helper already decided and sent the automatic email. Tickets without that decision use
            // the simple rules here. The website never sends an automatic email itself: only the helper does.
            const res = r.triage || triage(r.subject, inbound[0].text)
            const reply = r.triage?.replyText || (res.resolved ? res.answer : ackText(name, agentName(res.assignee), res.urgent, res.sensitive, res.extra))
            const now = new Date().toISOString()
            created.unshift({
              id: ++nextId, threadId: r.id, firstMessageId: inbound[0].messageId, subject: r.subject, body: inbound[0].text, customer: name, email,
              status: res.resolved ? 'Closed' : 'Open', urgent: res.urgent, topic: res.topic, assignee: res.assignee, createdAt: inbound[0].at, dueAt: dueIn(res.urgent, inbound[0].at),
              resolvedByAI: res.resolved, channel: 'Email', note: res.note, advice: [], draft: res.draft || undefined,
              tags: [...(res.resolved ? ['ai-resolved'] : []), ...(res.tags || (res.sensitive ? ['sensitive'] : []))],
              replies: [{ from: 'HR Assistant (automated)', text: reply, at: now, email: true, ai: true }, ...inbound.slice(1).map((m) => ({ inbound: true, from: name, text: m.text, at: m.at, messageId: m.messageId }))],
            })
          }
        }
        const ids = Object.keys(follow)
        setHelperStatus({ at: new Date().toISOString(), ok: true, remote: remote.length, imported: created.length, older, hidden, newest, mail })
        // An employee wrote back after the AI answered: a person gets it if they asked for one (or asked something new),
        // and the employee gets an email saying who will reply and when. A plain "thanks" leaves the ticket closed.
        const when = new Date()
        for (const id of ids) {
          const t = cur.find((x) => x.id === Number(id))
          if (!t?.resolvedByAI) continue
          const { confirmation } = followUp(t, follow[id], when)
          if (confirmation && t.threadId) { try { await helperCall(helper, `/tickets/${t.threadId}/reply`, { method: 'POST', body: JSON.stringify({ text: confirmation }) }) } catch { /* the ticket is still escalated */ } }
        }
        if (created.length || ids.length) {
          setTickets((p) => [...created.filter((c) => !p.some((x) => x.threadId === c.threadId)), ...p.map((t) => {
            const f = follow[t.id]
            if (!f) return t
            if (t.resolvedByAI) return { ...t, ...followUp(t, f, when).patch }
            const reopen = t.status === 'Closed'
            return { ...t, status: reopen ? 'Open' : t.status, resolvedByAI: reopen ? false : t.resolvedByAI, tags: reopen ? t.tags.filter((g) => g !== 'ai-resolved') : t.tags,
              note: reopen ? 'The employee replied after the automatic answer, so a person needs to look at it.' : t.note,
              replies: [...t.replies, ...f.map((m) => ({ inbound: true, from: t.customer, text: m.text, at: m.at, messageId: m.messageId }))] }
          })])
          setToast(`${created.length ? `${created.length} new email ticket${created.length > 1 ? 's' : ''}` : ''}${created.length && ids.length ? ' and ' : ''}${ids.length ? `${ids.length} customer repl${ids.length > 1 ? 'ies' : 'y'}` : ''}.`)
        }
      } catch (e) { setHelperStatus({ at: new Date().toISOString(), ok: false, error: e.message === 'Failed to fetch' ? 'Could not reach the helper. Check the helper address, and that the helper is deployed in Cloudflare.' : e.message }) /* try again next time */ }
      syncing.current = false
    }
    runNow.current = run
    run()
    const id = setInterval(() => run(), 30000)
    return () => clearInterval(id)
  }, [helper])

  const mine = tickets.filter((t) => canSee(t, me))
  const update = (id, patch) => setTickets((p) => p.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)))
  const event = (t, text) => ({ event: true, text, at: new Date().toISOString() })

  const transfer = (t, to) => {
    update(t.id, (x) => ({ assignee: to, replies: [...x.replies, event(x, `${agentName(me)} transferred this ticket to ${agentName(to)}`)] }))
    setOpenId(null)
    setToast(`Ticket #${t.id} transferred to ${agentName(to)}. It is now in their list.`)
  }
  const merge = (src, target) => {
    setTickets((p) => p.map((t) => {
      if (t.id === target.id) return { ...t, tags: [...new Set([...t.tags, ...src.tags])], replies: [...t.replies, event(t, `Ticket #${src.id} was merged into this ticket`), { inbound: true, from: src.customer, text: `(from #${src.id}: ${src.subject})\n${src.body}`, at: src.createdAt }, ...src.replies] }
      if (t.id === src.id) return { ...t, status: 'Closed', mergedInto: target.id, replies: [...t.replies, event(t, `Merged into ticket #${target.id}`)] }
      return t
    }))
    setOpenId(target.id)
    setToast(`Ticket #${src.id} merged into #${target.id}.`)
  }
  const go = (k) => { setPage(k); setOpenId(null) }

  return (
    <div className="shell">
      <aside className="rail">
        <button className={`brand${page === 'profile' ? ' on' : ''}`} onClick={() => go('profile')} aria-label="My profile" title="My profile">{initials(agentName(me))}</button>
        {NAV.map(([k, d, label]) => (
          <button key={k} className={page === k ? 'on' : ''} onClick={() => go(k)} aria-label={label}><Ico d={d} /><small>{label}</small></button>
        ))}
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="profile-top" onClick={() => go('profile')} aria-label="My profile">{initials(agentName(me))}</button>
          <b className="title">Beztakets</b>
        </header>
        <div className="content">
          {page === 'tickets' && (openId
            ? <Detail backLabel={VIEW_NAMES[nav.view] || 'All tickets'} key={openId} ticket={tickets.find((t) => t.id === openId)} all={mine} me={me} helper={helper} update={update} transfer={transfer} merge={merge} toast={setToast} back={() => setOpenId(null)} />
            : <List nav={nav} setNav={setNav} tickets={mine} me={me} open={setOpenId} reset={() => { setTickets(SEED_TICKETS); setDocs(SEED_DOCS); clearFiles().catch(() => {}) }} />)}
          {page === 'dashboard' && <Dashboard tickets={mine} me={me} />}
          {page === 'gaps' && <GapTracker tickets={tickets} theme={prefs.theme} manualAt={manualAt} />}
          {page === 'guardrails' && <Guardrails />}
          {page === 'kb' && <Documents docs={docs} setDocs={setDocs} helper={helper} />}
          {page === 'profile' && <Profile helper={helper} setHelper={setHelper} helperStatus={helperStatus} checkNow={() => runNow.current?.(true)} me={me} tickets={tickets} prefs={prefs} setPrefs={setPrefs} account={account} linked={Boolean(linked)} signOut={signOut} toast={setToast} reset={() => { setTickets(SEED_TICKETS); setDocs(SEED_DOCS); clearFiles().catch(() => {}); setToast('Sample data reset.') }} />}
          {page === 'settings' && <Setup me={me} account={account} linked={Boolean(linked)} openGuardrails={() => go('guardrails')} />}
        </div>
      </div>
      {toast && <div className="toast" role="status" onClick={() => setToast('')}>{toast}</div>}
    </div>
  )
}
