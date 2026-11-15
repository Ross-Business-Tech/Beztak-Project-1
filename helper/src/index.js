// Beztakets email helper. Turns emails sent to the burner Gmail into tickets, lets the AI agent
// answer what it safely can (and sends that answer by email), and sends ticket replies.
// All keys come from Cloudflare secrets.
import { BUILTIN_MANUAL, buildCorpus, decide, FOOTER, suggestReply } from '../../src/aiAgent.js'
import { checkLesson } from '../../src/lessons.js'
import { ackText } from '../../src/triage.js'
import { AGENTS } from '../../src/data.js'

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS' }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors } })
const b64u = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))

async function accessToken(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('Google sign-in failed: ' + (d.error_description || d.error))
  return d.access_token
}
const gmail = async (env, token, path, init) => {
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, { ...init, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } })
  if (!r.ok) throw new Error(`Gmail ${path} failed (${r.status})`)
  return r.json()
}
const header = (m, name) => m.payload.headers.find((h) => h.name.toLowerCase() === name)?.value || ''
const bodyText = (part) => {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return unb64u(part.body.data)
  for (const p of part.parts || []) { const t = bodyText(p); if (t) return t }
  return ''
}
// Drop quoted earlier messages so a ticket thread stays readable.
const stripQuote = (t) => t.split(/\r?\n(?:On .+ wrote:|-{2,} ?Original Message)/)[0].trim()

async function getTicket(env, id) { return env.TICKETS.get('t:' + id, 'json') }
async function saveTicket(env, t) {
  await env.TICKETS.put('t:' + t.id, JSON.stringify(t))
  const index = (await env.TICKETS.get('index', 'json')) || []
  if (!index.includes(t.id)) await env.TICKETS.put('index', JSON.stringify([t.id, ...index]))
}

// The helper only ever looks at email that arrives AFTER it was first switched on. The moment of its
// first check is saved (minus a few minutes, so an email sent right while it was being switched on
// is not missed), and anything older is ignored, so the old inbox is never read or answered.
const START_SLACK = 5 * 60 * 1000
async function startedAt(env) {
  let s = await env.TICKETS.get('startedAt')
  if (!s) { s = String(Date.now() - START_SLACK); await env.TICKETS.put('startedAt', s) }
  return Number(s)
}

// True when this address already wrote in the thread before `internalDate` (a person, or an earlier
// automatic answer, already replied). The helper never answers those a second time.
async function alreadyRepliedIn(env, token, threadId, me, internalDate) {
  try {
    const th = await gmail(env, token, `threads/${threadId}?format=metadata&metadataHeaders=From`)
    return (th.messages || []).some((x) => +x.internalDate < internalDate && header(x, 'from').toLowerCase().includes(me))
  } catch { return false } // if Gmail will not say, treat it as a new question: better answered than dropped
}

// ---- The Operations Manual the assistant reads ----
// Normally the built-in manual. A team member can instead choose a PDF on the Documents page: the website reads its text,
// splits it into sections and sends them here (POST /manual), and every answer and suggestion then uses it, with the same
// safety checks. DELETE /manual goes back to the built-in manual.
const MANUAL_MAX_CHARS = 350000
let corpusCache = { key: null, corpus: undefined }
// The manual the AI reads: the built-in one or an uploaded PDF, plus the team lessons that are approved.
async function activeCorpus(env) {
  const m = await env.TICKETS.get('manual', 'json')
  const lessons = ((await env.TICKETS.get('lessons', 'json')) || []).filter((l) => l.status === 'approved')
  if (!m && !lessons.length) return undefined // the built-in manual alone
  const key = `${m?.at || 'built-in'}|${lessons.map((l) => `${l.id}:${l.changedAt}`).join(',')}`
  if (corpusCache.key !== key) corpusCache = { key, corpus: buildCorpus(m || BUILTIN_MANUAL, lessons) }
  return corpusCache.corpus
}

// ---- team lessons and feedback (kept here so the whole team shares them) ----
const getLessons = async (env) => (await env.TICKETS.get('lessons', 'json')) || []
const putLessons = (env, list) => env.TICKETS.put('lessons', JSON.stringify(list))
const who = (x) => String(x ?? '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 60) || 'Someone on the team'
// Remember which lessons the AI used, so the team can see which ones matter. refs are citations like "L-3".
async function noteUses(env, refs) {
  const ids = (refs || []).filter((r) => /^L-\d+$/.test(r)).map((r) => Number(r.slice(2)))
  if (!ids.length) return
  const list = await getLessons(env)
  let changed = false
  for (const l of list) if (ids.includes(l.id)) { l.uses = (l.uses || 0) + 1; l.lastUsedAt = new Date().toISOString(); changed = true }
  if (changed) await putLessons(env, list)
}
async function lessonRoute(env, req, url) {
  const parts = url.pathname.split('/').filter(Boolean) // ['lessons'] or ['lessons', id] or ['feedback', id]
  if (parts[0] === 'lessons') {
    const list = await getLessons(env)
    if (parts.length === 1 && req.method === 'GET') return json({ lessons: list, feedback: (await env.TICKETS.get('feedback', 'json')) || [] })
    if (parts.length === 1 && req.method === 'POST') {
      const b = await req.json()
      const c = checkLesson(b)
      if (!c.ok) return json({ error: c.error }, 400)
      if (list.length >= 300) return json({ error: 'There are already 300 lessons. Delete some first.' }, 400)
      const now = new Date().toISOString()
      const lesson = { id: Math.max(0, ...list.map((l) => l.id)) + 1, question: c.question, answer: c.answer, status: 'pending', addedBy: who(b.by), addedAt: now, changedAt: now, ticketId: Number(b.ticketId) || null, uses: 0 }
      await putLessons(env, [...list, lesson])
      return json(lesson)
    }
    const l = list.find((x) => String(x.id) === parts[1])
    if (!l) return json({ error: 'Lesson not found' }, 404)
    if (parts.length === 2 && req.method === 'DELETE') { await putLessons(env, list.filter((x) => x !== l)); return json({ deleted: l.id }) }
    if (parts.length === 2 && req.method === 'POST') {
      const { action, by } = await req.json()
      const name = who(by)
      if (action === 'approve') {
        if (l.status !== 'pending') return json({ error: 'That lesson is not waiting for approval.' }, 400)
        if (name === l.addedBy) return json({ error: 'A second person has to approve it: you wrote this lesson.' }, 400)
        Object.assign(l, { status: 'approved', approvedBy: name, approvedAt: new Date().toISOString() })
      } else if (action === 'off') {
        if (l.status !== 'approved') return json({ error: 'That lesson is not in use.' }, 400)
        l.status = 'off'
      } else if (action === 'on') {
        if (l.status !== 'off') return json({ error: 'That lesson is not turned off.' }, 400)
        l.status = 'approved'
      } else return json({ error: 'Unknown action' }, 400)
      l.changedAt = new Date().toISOString()
      await putLessons(env, list)
      return json(l)
    }
  }
  if (parts[0] === 'feedback') {
    const list = (await env.TICKETS.get('feedback', 'json')) || []
    if (parts.length === 1 && req.method === 'POST') {
      const b = await req.json()
      const f = { id: Date.now(), kind: b.kind === 'auto' ? 'auto' : 'suggest', ticketId: Number(b.ticketId) || null, up: Boolean(b.up), note: String(b.note ?? '').trim().slice(0, 500), text: String(b.text ?? '').trim().slice(0, 600), by: who(b.by), at: new Date().toISOString() }
      await env.TICKETS.put('feedback', JSON.stringify([f, ...list].slice(0, 300)))
      return json(f)
    }
    if (parts.length === 2 && req.method === 'DELETE') { await env.TICKETS.put('feedback', JSON.stringify(list.filter((x) => String(x.id) !== parts[1]))); return json({ deleted: parts[1] }) }
  }
  return json({ error: 'Not found' }, 404)
}

function cleanManual(input) {
  if (!input || typeof input !== 'object') throw new Error('No manual was sent.')
  const line = (x, n) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
  const block = (x, n) => String(x ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n)
  let chars = 0
  const sections = (Array.isArray(input.sections) ? input.sections : []).slice(0, 400)
    .map((s) => ({ title: line(s?.title, 200), items: (Array.isArray(s?.items) ? s.items : []).slice(0, 600).map((it) => ({ q: line(it?.q, 300), a: block(it?.a, 4000) })).filter((it) => it.q && it.a) }))
    .filter((s) => s.title && s.items.length)
    .map((s, i) => ({ n: i + 1, title: s.title, items: s.items }))
  for (const s of sections) for (const it of s.items) chars += it.q.length + it.a.length
  if (!sections.length) throw new Error('The manual had no readable sections.')
  if (chars > MANUAL_MAX_CHARS) throw new Error(`The manual is too long for the assistant (about ${Math.round(chars / 1000)},000 characters; the limit is ${MANUAL_MAX_CHARS / 1000},000).`)
  const name = line(input.name, 200) || 'Uploaded manual'
  return { title: line(input.title, 120) || name.replace(/\.pdf$/i, ''), version: line(input.version, 80) || 'uploaded PDF', name, pages: Math.max(0, Math.floor(Number(input.pages) || 0)), sections, at: new Date().toISOString() }
}
const manualInfo = (m) => (m
  ? { custom: true, title: m.title, version: m.version, name: m.name, pages: m.pages, at: m.at, sections: m.sections.length, entries: m.sections.reduce((n, s) => n + s.items.length, 0), sectionTitles: m.sections.map((s) => ({ n: s.n, title: s.title })) }
  : { custom: false })

export async function pollInbox(env) {
  // Only one check at a time: the schedule and the website can both ask, and two checks at once answered the same email twice.
  // Each check writes its own tag on the lock, waits a moment, and carries on only if its tag is still the one there.
  if (await env.TICKETS.get('lock')) return
  const mine = crypto.randomUUID()
  await env.TICKETS.put('lock', mine, { expirationTtl: 60 })
  await new Promise((r) => setTimeout(r, 200))
  if ((await env.TICKETS.get('lock')) !== mine) return
  // What this check found is saved, so the website can show it (and show any error, which would otherwise be invisible).
  const stats = { at: new Date().toISOString(), ok: true, listed: 0, seenBefore: 0, older: 0, own: 0, automatic: 0, alreadyAnswered: 0, newTickets: 0, followUps: 0 }
  try { await pollOnce(env, stats) } catch (e) { stats.ok = false; stats.error = String(e.message || e); throw e } finally {
    try { await env.TICKETS.put('status', JSON.stringify(stats)) } catch { /* status is only for display */ }
    if ((await env.TICKETS.get('lock')) === mine) await env.TICKETS.delete('lock')
  }
}

async function pollOnce(env, stats) {
  const floor = await startedAt(env)
  const corpus = await activeCorpus(env)
  stats.startedAt = new Date(floor).toISOString()
  const token = await accessToken(env)
  const me = env.BURNER_EMAIL.toLowerCase()
  const list = await gmail(env, token, 'messages?q=' + encodeURIComponent(`in:inbox after:${Math.floor(floor / 1000)}`) + '&maxResults=25')
  stats.listed = (list.messages || []).length
  for (const { id: msgId } of (list.messages || []).reverse()) {
    if (await env.TICKETS.get('seen:' + msgId)) { stats.seenBefore++; continue }
    const m = await gmail(env, token, `messages/${msgId}?format=full`)
    const from = header(m, 'from')
    await env.TICKETS.put('seen:' + msgId, '1', { expirationTtl: 60 * 60 * 24 * 30 })
    if (+m.internalDate < floor) { stats.older++; continue } // older than the helper itself
    if (from.toLowerCase().includes(me)) { stats.own++; continue }
    const auto = header(m, 'auto-submitted').toLowerCase()
    if ((auto && auto !== 'no') || /^(bulk|junk|list)$/i.test(header(m, 'precedence'))) { stats.automatic++; continue } // out-of-office and bulk mail: never answer
    const entry = { inbound: true, from, text: stripQuote(bodyText(m.payload)) || m.snippet, at: new Date(+m.internalDate).toISOString(), messageId: header(m, 'message-id') }
    let t = await getTicket(env, m.threadId)
    if (t) { t.replies.push(entry); stats.followUps++; if (t.status === 'Closed') t.status = 'Open' }
    else {
      if (await alreadyRepliedIn(env, token, m.threadId, me, +m.internalDate)) { stats.alreadyAnswered++; continue } // already answered by someone: leave it alone
      stats.newTickets++
      t = { id: m.threadId, subject: header(m, 'subject') || '(no subject)', customer: from, status: 'Open', createdAt: entry.at, replies: [entry] }
      if (!/no-?reply|mailer-daemon/i.test(from)) {
        // New conversation: decide who answers, then send the automatic email.
        const res = await decide(env, t.subject, entry.text, { corpus })
        await noteUses(env, res.refs)
        const name = (from.match(/^\s*"?([^"<]*?)"?\s*</) || [])[1] || from
        const agent = AGENTS.find((a) => a.id === res.assignee)
        const reply = res.resolved ? res.answer + FOOTER : ackText(name, agent.name, res.urgent, res.sensitive, res.extra)
        t.triage = { ...res, replyText: reply }
        await saveTicket(env, t)
        try { await sendReply(env, t.id, reply, true) } catch { /* the ticket still exists; a person can reply */ }
        continue
      }
    }
    await saveTicket(env, t)
  }
}

export async function sendReply(env, id, text, auto = false) {
  const t = await getTicket(env, id)
  if (!t) return null
  // The automatic answer is only ever sent once per ticket, even if several browsers ask.
  if (auto && t.autoReplied) return t
  if (auto) { t.autoReplied = true; await saveTicket(env, t) }
  const last = [...t.replies].reverse().find((r) => r.inbound)
  const to = (t.customer.match(/<(.+)>/) || [null, t.customer])[1]
  const subject = /^re:/i.test(t.subject) ? t.subject : 'Re: ' + t.subject
  const lines = [`To: ${to}`, `Subject: ${subject.replace(/[\r\n]/g, ' ')}`, 'Content-Type: text/plain; charset=UTF-8']
  if (last?.messageId) lines.push(`In-Reply-To: ${last.messageId}`, `References: ${last.messageId}`)
  const token = await accessToken(env)
  await gmail(env, token, 'messages/send', { method: 'POST', body: JSON.stringify({ raw: b64u(lines.join('\r\n') + '\r\n\r\n' + text), threadId: id }) })
  t.replies.push({ outbound: true, text, at: new Date().toISOString() })
  await saveTicket(env, t)
  return t
}

// Starts a NEW email conversation for a ticket an HR person opened by hand. The conversation is saved as a ticket here too,
// so when the employee writes back, their reply joins the same ticket instead of making a new one.
const NEW_PER_DAY = 25 // a safety limit on emails started from the website per day
const clean = (v, max) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[<>",;]/g, '').trim().slice(0, max)
export async function startConversation(env, input = {}) {
  const email = String(input.to ?? '').trim().toLowerCase()
  const name = clean(input.name, 80)
  const subject = clean(input.subject, 150)
  const text = String(input.text ?? '').trim()
  if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(email) || email.length > 120) throw Object.assign(new Error('That email address does not look right.'), { status: 400 })
  if (email === env.BURNER_EMAIL.toLowerCase()) throw Object.assign(new Error('That is the help desk\'s own address.'), { status: 400 })
  if (!subject || !text || text.length > 10000) throw Object.assign(new Error('A subject and a message are required.'), { status: 400 })
  const day = 'newsent:' + new Date().toISOString().slice(0, 10)
  const used = Number(await env.TICKETS.get(day)) || 0
  if (used >= NEW_PER_DAY) throw Object.assign(new Error(`Today's limit of ${NEW_PER_DAY} new emails from the website has been reached.`), { status: 429 })
  await env.TICKETS.put(day, String(used + 1), { expirationTtl: 60 * 60 * 48 })
  const encoded = /^[\x20-\x7e]*$/.test(subject) ? subject : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(subject)))}?=`
  const lines = [`To: ${email}`, `Subject: ${encoded}`, 'Content-Type: text/plain; charset=UTF-8']
  const token = await accessToken(env)
  const sent = await gmail(env, token, 'messages/send', { method: 'POST', body: JSON.stringify({ raw: b64u(lines.join('\r\n') + '\r\n\r\n' + text) }) })
  const at = new Date().toISOString()
  await saveTicket(env, { id: sent.threadId, subject, customer: name ? `${name} <${email}>` : email, status: 'Open', createdAt: at, autoReplied: true, replies: [{ outbound: true, text, at }] })
  return { threadId: sent.threadId }
}

export default {
  async scheduled(_e, env, ctx) { ctx.waitUntil(pollInbox(env)) },
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
    if (req.headers.get('authorization') !== 'Bearer ' + env.HELPER_TOKEN) return json({ error: 'Not allowed' }, 401)
    const url = new URL(req.url)
    try {
      if (url.pathname === '/tickets' && req.method === 'GET') {
        if (url.searchParams.get('refresh')) await pollInbox(env)
        const ids = (await env.TICKETS.get('index', 'json')) || []
        return json((await Promise.all(ids.map((i) => getTicket(env, i)))).filter(Boolean))
      }
      // "Suggest AI reply" on a ticket: the website sends the ticket text, the AI (key kept here) writes a suggestion for HR to check.
      if (url.pathname === '/suggest' && req.method === 'POST') {
        const input = await req.json()
        if (!input || typeof input !== 'object') return json({ error: 'Nothing to suggest a reply for' }, 400)
        const out = await suggestReply(env, input, { corpus: await activeCorpus(env) })
        await noteUses(env, out.refs)
        return json(out)
      }
      if (url.pathname === '/manual') {
        if (req.method === 'GET') return json(manualInfo(await env.TICKETS.get('manual', 'json')))
        if (req.method === 'DELETE') { await env.TICKETS.delete('manual'); return json({ custom: false }) }
        if (req.method === 'POST') {
          let m
          try { m = cleanManual(await req.json()) } catch (e) { return json({ error: e.message }, 400) }
          await env.TICKETS.put('manual', JSON.stringify(m))
          return json(manualInfo(m))
        }
      }
      if (/^\/(lessons|feedback)(\/|$)/.test(url.pathname)) return lessonRoute(env, req, url)
      if (url.pathname === '/status' && req.method === 'GET') return json((await env.TICKETS.get('status', 'json')) || { never: true })
      if (url.pathname === '/tickets/new' && req.method === 'POST') {
        try { return json(await startConversation(env, await req.json())) } catch (e) { return json({ error: e.message }, e.status || 500) }
      }
      const m = url.pathname.match(/^\/tickets\/([^/]+)\/reply$/)
      if (m && req.method === 'POST') {
        const { text, auto } = await req.json()
        if (!text || text.length > 10000) return json({ error: 'Reply text is required' }, 400)
        const t = await sendReply(env, m[1], text, Boolean(auto))
        return t ? json(t) : json({ error: 'Ticket not found' }, 404)
      }
      return json({ error: 'Not found' }, 404)
    } catch (e) { return json({ error: e.message }, 500) }
  },
}
