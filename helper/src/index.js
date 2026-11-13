// Beztakets email helper. Turns emails sent to the burner Gmail into tickets, lets the AI agent
// answer what it safely can (and sends that answer by email), and sends ticket replies.
// All keys come from Cloudflare secrets.
import { decide, FOOTER } from '../../src/aiAgent.js'
import { ackText } from '../../src/triage.js'
import { AGENTS } from '../../src/data.js'

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
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
// first check is saved, and anything older is ignored, so the old inbox is never read or answered.
async function startedAt(env) {
  let s = await env.TICKETS.get('startedAt')
  if (!s) { s = String(Date.now()); await env.TICKETS.put('startedAt', s) }
  return Number(s)
}

// True when this address already wrote in the thread before `internalDate` (a person, or an earlier
// automatic answer, already replied). The helper never answers those a second time.
async function alreadyRepliedIn(env, token, threadId, me, internalDate) {
  const th = await gmail(env, token, `threads/${threadId}?format=metadata&metadataHeaders=From`)
  return (th.messages || []).some((x) => +x.internalDate < internalDate && header(x, 'from').toLowerCase().includes(me))
}

export async function pollInbox(env) {
  // Only one check at a time: the schedule and the website can both ask, and two checks at once answered the same email twice.
  // Each check writes its own tag on the lock, waits a moment, and carries on only if its tag is still the one there.
  if (await env.TICKETS.get('lock')) return
  const mine = crypto.randomUUID()
  await env.TICKETS.put('lock', mine, { expirationTtl: 60 })
  await new Promise((r) => setTimeout(r, 200))
  if ((await env.TICKETS.get('lock')) !== mine) return
  try { await pollOnce(env) } finally { if ((await env.TICKETS.get('lock')) === mine) await env.TICKETS.delete('lock') }
}

async function pollOnce(env) {
  const floor = await startedAt(env)
  const token = await accessToken(env)
  const me = env.BURNER_EMAIL.toLowerCase()
  const list = await gmail(env, token, 'messages?q=' + encodeURIComponent(`in:inbox after:${Math.floor(floor / 1000)}`) + '&maxResults=25')
  for (const { id: msgId } of (list.messages || []).reverse()) {
    if (await env.TICKETS.get('seen:' + msgId)) continue
    const m = await gmail(env, token, `messages/${msgId}?format=full`)
    const from = header(m, 'from')
    await env.TICKETS.put('seen:' + msgId, '1', { expirationTtl: 60 * 60 * 24 * 30 })
    if (+m.internalDate < floor) continue // older than the helper itself
    if (from.toLowerCase().includes(me)) continue
    const auto = header(m, 'auto-submitted').toLowerCase()
    if ((auto && auto !== 'no') || /^(bulk|junk|list)$/i.test(header(m, 'precedence'))) continue // out-of-office and bulk mail: never answer
    const entry = { inbound: true, from, text: stripQuote(bodyText(m.payload)) || m.snippet, at: new Date(+m.internalDate).toISOString(), messageId: header(m, 'message-id') }
    let t = await getTicket(env, m.threadId)
    if (t) { t.replies.push(entry); if (t.status === 'Closed') t.status = 'Open' }
    else {
      if (await alreadyRepliedIn(env, token, m.threadId, me, +m.internalDate)) continue // already answered by someone: leave it alone
      t = { id: m.threadId, subject: header(m, 'subject') || '(no subject)', customer: from, status: 'Open', createdAt: entry.at, replies: [entry] }
      if (!/no-?reply|mailer-daemon/i.test(from)) {
        // New conversation: decide who answers, then send the automatic email.
        const res = await decide(env, t.subject, entry.text)
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
