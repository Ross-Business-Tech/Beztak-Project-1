// The Ops Help "brain": safety checks first, then a search of the approved Operations Manual.
// It never makes up procedures: every answer is a passage from the manual, with its section number.
import { MANUAL, ENTRIES } from './data/opsManual.js'

export const DOC = MANUAL

export const CONTACTS = {
  ops: { name: 'Riley Carter', role: 'Property Operations Lead', email: 'operations@glpg-demo.example', phone: '(734) 555-0147', handles: 'Procedures, keys, vendors, residents, field safety' },
  maint: { name: 'Sam Rivera', role: 'Maintenance Coordinator', email: 'maintenance@glpg-demo.example', phone: '(734) 555-0150', handles: 'Work orders, preventive maintenance, pests, snow' },
  emergency: { name: 'Emergency maintenance line', role: '24/7 on-call technician', email: 'maintenance@glpg-demo.example', phone: '(734) 555-0199', handles: 'Leaks, no heat, gas or fire damage, lockouts after hours' },
  accounting: { name: 'Taylor Nguyen', role: 'Accounting', email: 'accounting@glpg-demo.example', phone: '(734) 555-0148', handles: 'Rent, deposits, payment plans, vendor invoices' },
  broker: { name: 'Avery Chen', role: 'Managing Broker', email: 'compliance@glpg-demo.example', phone: '(734) 555-0146', handles: 'Leasing compliance, Fair Housing, accommodations' },
  it: { name: 'IT Help Desk', role: 'Shared service', email: 'helpdesk@glpg-demo.example', phone: '(734) 555-0145', handles: 'Passwords, PMS access, devices' },
  security: { name: 'IT Security', role: 'Shared service', email: 'security@glpg-demo.example', phone: '(734) 555-0145', handles: 'Phishing, lost devices, wire or payment fraud' },
  people: { name: 'Morgan Ellis', role: 'People Operations (HR)', email: 'people@glpg-demo.example', phone: '(734) 555-0142', handles: 'HR questions and workplace concerns' },
  exec: { name: 'Jordan Patel', role: 'Managing Member', email: 'jordan.patel@glpg-demo.example', phone: '(734) 555-0144', handles: 'Escalations and spending over $2,500' },
}

// "Ask Ops" routing (Ops Manual §2)
export const TICKET_TYPES = [
  { id: 'procedure', label: 'Procedure question', to: 'ops', target: 'Acknowledged within 1 business day; answered within 3 business days', include: 'The manual section, your exact question, and what you are trying to do.' },
  { id: 'maintenance', label: 'Maintenance / work order', to: 'maint', target: 'Acknowledged within 1 business day. For emergencies call (734) 555-0199 instead', include: 'Property and unit, the problem, priority, work order number if you have one.' },
  { id: 'vendor', label: 'Vendor or spending approval', to: 'ops', target: 'Acknowledged within 1 business day', include: 'Vendor, work order number, amount, quotes attached.' },
  { id: 'accounting', label: 'Rent, deposit, or invoice', to: 'accounting', target: 'Acknowledged within 1 business day', include: 'Property and unit or vendor, amount, dates. Never include full bank-account numbers.' },
  { id: 'fairhousing', label: 'Fair Housing / accommodation', to: 'broker', target: 'Forward the same business day', include: 'What was requested and when. Keep medical details out.' },
  { id: 'access', label: 'Keys or property access', to: 'ops', target: 'Lost keys: call (734) 555-0147 now', include: 'Property, which key or code, when it was last seen.' },
]

const sectionContact = (s) => ({ 2: 'ops', 3: 'emergency', 4: 'maint', 5: 'ops', 6: 'ops', 7: 'broker', 8: 'ops', 9: 'accounting', 10: 'ops', 11: 'broker', 12: 'ops', 13: 'ops', 14: 'ops', 15: 'security' }[s] || 'ops')

// ---------- search ----------
const STOP = new Set('a an and are as at be by can do does for from get got have how i if in is it its me my of on or our should so that the this to was we what when where which who why will with you your am im any about there their them take tomorrow today tonight next week need want help know please tell just much many happen happens policy policies procedure procedures job rule rules really still also would off long could like question ask supposed someone something has had into new'.split(' '))
const SYN = {
  tenant: 'resident', tenants: 'resident', renter: 'resident', occupant: 'resident', neighbor: 'resident neighbor', neighbors: 'resident neighbor',
  apartment: 'unit', apt: 'unit', house: 'unit property', building: 'property building', site: 'property',
  fix: 'repair work order', repair: 'repair work order', broken: 'repair work order', ticket: 'work order', maintenance: 'maintenance work order',
  leak: 'leak water', leaking: 'leak water', flood: 'flooding water', flooded: 'flooding water', pipe: 'leak water', burst: 'leak water', toilet: 'toilet', clog: 'toilet repair',
  furnace: 'heat', heater: 'heat', heating: 'heat', cold: 'heat', ac: 'ac', air: 'ac', hvac: 'hvac',
  locked: 'lockout', lockout: 'lockout', 'let': 'lockout', lose: 'lost', lost: 'lost', fob: 'key fob', keys: 'key',
  code: 'code access', gate: 'code access', lockbox: 'code access',
  contractor: 'vendor', contractors: 'vendor', plumber: 'vendor', electrician: 'vendor', vendors: 'vendor',
  quote: 'quotes', bid: 'quotes', bids: 'quotes', estimate: 'quotes', approve: 'approval limit', spend: 'spending approval limit', spending: 'approval limit', purchase: 'approval limit', buy: 'approval limit', cost: 'approval limit',
  rent: 'rent', late: 'late fee', fee: 'fee', pay: 'pay payment', payment: 'payment', cash: 'cash payment', bounced: 'returned payment', nsf: 'returned payment',
  deposit: 'security deposit', refund: 'security deposit refund', evict: 'eviction', evicted: 'eviction',
  tour: 'showing', tours: 'showing', show: 'showing', prospect: 'prospect showing', applicant: 'application', apply: 'application', screening: 'application screening',
  movein: 'move in', moveout: 'move out', vacate: 'move out notice', leaving: 'move out notice',
  noise: 'noise', loud: 'noise', complain: 'complaint', complaining: 'complaint', upset: 'complaint', angry: 'complaint aggressive',
  disability: 'accommodation', disabled: 'accommodation', wheelchair: 'accommodation modification', ramp: 'accommodation modification', esa: 'assistance animal', dog: 'animal', cat: 'animal', pet: 'animal', pets: 'animal',
  discriminate: 'fair housing', discrimination: 'fair housing', steering: 'fair housing',
  alone: 'lone worker', check: 'check in', safety: 'safety', unsafe: 'unsafe', scared: 'unsafe',
  injured: 'injured injury incident', injury: 'injury incident', hurt: 'injured incident', fell: 'injured fell', slipped: 'injured slip', accident: 'accident incident', stolen: 'theft', robbed: 'theft', vandalism: 'break in',
  report: 'incident report', paperwork: 'form',
  phishing: 'suspicious link', scam: 'fraud', wire: 'wire', laptop: 'device lost', phone: 'phone', computer: 'device', password: 'password', login: 'password login', pms: 'pms',
  bugs: 'pest', roaches: 'pest', mice: 'pest', rats: 'pest', bed: 'pest', roof: 'repair', roofing: 'repair', broke: 'break in theft', raise: 'renewal rate', increase: 'renewal rate', mold: 'mold', mildew: 'mold',
  snow: 'snow', ice: 'snow ice', salt: 'snow',
  hours: 'hours open', open: 'open', close: 'close', alarm: 'alarm', package: 'package', packages: 'package', mail: 'mail',
  hr: 'hr people operations', pto: 'hr', vacation: 'hr', benefits: 'hr', paycheck: 'hr', sick: 'hr',
  boss: 'manager', supervisor: 'manager', gift: 'gift', ai: 'ai', chatgpt: 'ai',
}
const stem = (w) => w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '') : w
const words = (t) => (t || '').toLowerCase().replace(/move[- ]in/g, 'movein').replace(/move[- ]out/g, 'moveout').replace(/locked out/g, 'lockout').replace(/time off/g, 'pto').replace(/[^a-z0-9$]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w))
const tokens = (t) => words(t).map(stem)

const DOCS = ENTRIES.map((c, i) => {
  const fields = [[c.q, 3], [c.k, 2], [c.sectionTitle, 1.2], [c.text, 1]]
  const tf = {}
  let len = 0
  for (const [f, w] of fields) for (const t of tokens(f)) { tf[t] = (tf[t] || 0) + w; len += w }
  return { ...c, id: i, tf, len }
})
const N = DOCS.length
const avgLen = DOCS.reduce((s, d) => s + d.len, 0) / N
const df = {}
for (const d of DOCS) for (const t of Object.keys(d.tf)) df[t] = (df[t] || 0) + 1

const idf = (t) => Math.log(1 + (N - (df[t] || 0) + 0.5) / ((df[t] || 0) + 0.5))

const avgIdf = Object.keys(df).reduce((s, t) => s + idf(t), 0) / Object.keys(df).length

function search(query, context = '') {
  const expand = (w) => [stem(w), ...(SYN[w] || SYN[stem(w)] || '').split(' ').filter(Boolean).map((s) => stem(s.replace(/[()]/g, '')))]
  const base = [...new Set(words(query))]
  // each word the employee typed, plus its synonyms
  const groups = base.map(expand)
  // words from the earlier question (for follow-ups) count at half weight
  const ctxGroups = [...new Set(words(context))].filter((w) => !base.includes(w)).map(expand)
  const gw = new Map(ctxGroups.map((g) => [g, 0.8]))
  groups.push(...ctxGroups)
  // the words they typed count fully; synonyms we added count less
  const q = new Map()
  for (const g of groups) g.forEach((t, i) => q.set(t, Math.max(q.get(t) || 0, (i === 0 ? 1 : 0.6) * (gw.get(g) || 1))))
  // words the manual never uses count, but not more than a typical word
  const wt = (g) => Math.min(idf(g[0]), avgIdf) * (gw.get(g) || 1)
  const totalWeight = groups.reduce((s, g) => s + wt(g), 0) || 1
  const k1 = 1.2, b = 0.6
  return DOCS.map((d) => {
    let score = 0
    for (const [t, w] of q) {
      const f = d.tf[t]
      if (!f) continue
      score += w * idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avgLen))
    }
    // how much of what they asked is actually covered by this passage
    const coverage = groups.reduce((s, g) => s + (d.tf[g[0]] ? wt(g) : g.some((t) => d.tf[t]) ? 0.75 * wt(g) : 0), 0) / totalWeight
    score *= d.boost || 1
    return { d, score, coverage }
  }).filter((r) => r.score > 0).sort((a, b) => b.score * b.coverage - a.score * a.coverage)
}

// ---------- safety, privacy, scope ----------
const CRISIS = /suicid|kill myself|end my life|hurt myself|harm myself|self[- ]?harm|want to die|don'?t want to live/i
const DANGER = /weapon|\bgun\b|knife|threat|attack|assault|violen|stalk|in danger|unsafe|scared for my|\bfire\b|smoke|gas smell|smell(s)? (gas|like gas)|gas leak|carbon monoxide|\bco alarm/i
const WATER = /flood|leak|burst|water (everywhere|pouring|coming)|sewage|no heat|heat (is )?(out|off|not working)|furnace (is )?(out|broken|not working)/i
const CONCERN = /harass|discriminat|retaliat|hostile work|bull(y|ied)|sexual|inappropriate (comment|touch)|racis|sexis/i
const INJURY = /injur|\bhurt\b|accident|\bfell\b|slipped|bleeding/i
const FRAUD = /wire (instruction|transfer|fraud)|new (bank|payment|wire) (details|info|instructions)|phish|suspicious (link|email)|hacked|data breach|lost (my |a )?(laptop|phone|device|tablet)/i
const SENSITIVE = /\b\d{3}-?\d{2}-?\d{4}\b|\b\d{8,17}\b|password\s*(is|:)|\bssn\b|social security|routing number|account number|alarm code is|gate code is/i
const OUT_OF_SCOPE = [
  [/\b(sue|lawsuit|lawyer|attorney|legal advice|is it legal)\b/i, 'I can\'t give legal advice. I can share what the manual says; legal questions go to Operations, which works with the company\'s attorney.'],
  [/\b(diagnos|symptom|medication|dosage|treatment)\w*/i, 'I can\'t give medical advice. For health concerns, please see a medical professional.'],
]
const TIME_SENSITIVE = /emergency|urgent|right now|asap|leak|flood|no heat|locked out|lockout|lost (a |my )?key|break[- ]?in|stolen|deadline|tonight|after hours/i
const SMALLTALK = /^\s*(hi|hello|hey|good (morning|afternoon|evening)|thanks|thank you|thx|ok|okay)\b[\s!.]*$/i

/**
 * Answer one employee message. Returns a structured reply the UI renders.
 * kind: 'answer' | 'notfound' | 'crisis' | 'smalltalk'
 */
export function answer(message, context = '') {
  const text = message.trim()
  const reply = { kind: 'answer', alerts: [], notes: [], results: [], contact: null }

  if (SENSITIVE.test(text)) {
    reply.notes.push({ type: 'privacy', text: 'Please don\'t share passwords, Social Security numbers, or bank details here. I never need them. If you typed one, consider it exposed and change it.' })
  }
  if (CRISIS.test(text)) {
    return { ...reply, kind: 'crisis' }
  }
  if (SMALLTALK.test(text)) {
    return { ...reply, kind: 'smalltalk', thanks: /thank|thx/i.test(text) }
  }
  if (DANGER.test(text)) reply.alerts.push('danger')
  if (WATER.test(text)) reply.alerts.push('water')
  if (INJURY.test(text)) reply.alerts.push('injury')
  if (CONCERN.test(text)) reply.alerts.push('concern')
  if (FRAUD.test(text)) reply.alerts.push('fraud')
  for (const [re, msg] of OUT_OF_SCOPE) if (re.test(text)) reply.notes.push({ type: 'scope', text: msg })

  const hits = search(text, context)
  const top = hits[0]
  // need a reasonably strong match before we show a policy as "the answer"
  if (top && top.score >= 2.5 && top.coverage >= 0.45 && top.coverage < 0.6) reply.partial = true
  if (!top || top.score < 2.5 || top.coverage < 0.45) {
    if (reply.alerts.length) return { ...reply, kind: 'alertonly' }
    reply.kind = 'notfound'
    reply.suggestions = hits.slice(0, 3).filter((h) => h.score > 1.5 && h.d.q).map((h) => h.d.q)
    return reply
  }
  const seen = new Set()
  for (const h of hits) {
    const key = h.d.q || h.d.text.slice(0, 60)
    if (seen.has(key)) continue
    seen.add(key)
    if (reply.results.length && (h.score * h.coverage < top.score * top.coverage * 0.55 || h.coverage < (reply.partial ? 0.45 : 0.6))) break
    reply.results.push(h.d)
    if (reply.results.length === 3) break
  }
  const best = reply.results[0]
  reply.contact = CONTACTS[sectionContact(best.section)]
  reply.timeSensitive = TIME_SENSITIVE.test(text) || best.section === 3
  return reply
}

export const cite = (c) => `${DOC.short}, ${DOC.version} · §${c.ref} ${c.sectionTitle}`

export const SUGGESTED = [
  'A resident is locked out',
  'How do I submit a work order?',
  'There\'s a water leak',
  'How much can I approve for a repair?',
  'When is rent late?',
  'A tenant asked for an accommodation',
]

// ---------- follow-up questions ----------
// "what about part-time?", "is that an emergency?", "how much can I approve for it?" only make sense with the previous question.
const EXPLICIT = /^(and|but|also|so|then|ok(ay)?,?|what about|how about|what if|what happens (after|next|then)|what('s| is) next|after that)\b/i
const FOLLOW_START = /^(and|but|also|so|then|ok(ay)?,?|what about|how about|what if|what happens|what('s| is) next|after|is (that|it|there)|are (they|those|there)|does (that|it|this)|do (they|i|we)|can i|could i|should i|how (do|long|much|many|far|soon|often)|when|where|who|why|which|for)\b/i
const PRONOUN = /\b(it|that|this|they|them|those|these|there|same|one)\b/i

/** Answer a message, using the previous question as context when it reads like a follow-up. */
export function answerInContext(message, prev) {
  const alone = answer(message)
  if (!prev || ['crisis', 'smalltalk'].includes(alone.kind) || alone.alerts.length) return alone
  const n = words(message).length
  const looksLikeFollowUp = n <= 5 && (FOLLOW_START.test(message.trim()) || PRONOUN.test(message))
  const weakAlone = alone.kind === 'notfound' || alone.partial
  if (!looksLikeFollowUp && !(weakAlone && n <= 5)) return alone
  // a clear new question ("when is rent due?") stands on its own
  if (n >= 3 && alone.kind === 'answer' && !alone.partial && !PRONOUN.test(message) && !EXPLICIT.test(message.trim())) return alone
  const together = answer(message, prev.query)
  if (together.kind !== 'answer') return alone
  // only say "following up" when the earlier question actually changed the answer
  const changed = together.results[0] !== alone.results[0]
  return changed ? { ...together, followUp: prev.topic } : together
}
