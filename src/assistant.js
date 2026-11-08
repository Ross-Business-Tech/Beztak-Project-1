// The HR assistant "brain": safety checks first, then a search of the approved handbook.
// It never makes up policy: every answer is a passage from the handbook, with its citation.
import handbook from './data/handbook.json'
import { curated } from './data/curated.js'

export const DOC = {
  title: 'GLPG Employee Handbook & HR Self-Service Manual',
  short: 'Employee Handbook',
  version: handbook.version,
  effective: handbook.effective,
}

export const CONTACTS = {
  people: { name: 'Morgan Ellis', role: 'Director of People Operations', email: 'people@glpg-demo.example', phone: '(734) 555-0142', handles: 'General HR, employee relations, personnel files' },
  benefits: { name: 'Morgan Ellis', role: 'Benefits', email: 'benefits@glpg-demo.example', phone: '(734) 555-0142', handles: 'Enrollment, dependents, 401(k), life events' },
  leave: { name: 'Morgan Ellis', role: 'Leave & accommodations', email: 'leave@glpg-demo.example', phone: '(734) 555-0142', handles: 'Leave, sick time, accommodations' },
  payroll: { name: 'Dana Brooks', role: 'Payroll Administrator', email: 'payroll@glpg-demo.example', phone: '(734) 555-0143', handles: 'Pay, timekeeping, direct deposit, tax forms' },
  broker: { name: 'Avery Chen', role: 'Managing Broker', email: 'compliance@glpg-demo.example', phone: '(734) 555-0146', handles: 'Commissions, licensing, Fair Housing, conflicts' },
  ops: { name: 'Riley Carter', role: 'Property Operations Lead', email: 'operations@glpg-demo.example', phone: '(734) 555-0147', handles: 'Keys, property access, vendors, field safety' },
  it: { name: 'IT Help Desk', role: 'Shared service', email: 'helpdesk@glpg-demo.example', phone: '(734) 555-0145', handles: 'Passwords, devices, MFA, software' },
  security: { name: 'IT Security', role: 'Shared service', email: 'security@glpg-demo.example', phone: '(734) 555-0145', handles: 'Phishing, lost devices, wire fraud, data exposure' },
  exec: { name: 'Jordan Patel', role: 'Managing Member', email: 'jordan.patel@glpg-demo.example', phone: '(734) 555-0144', handles: 'Escalations, or if HR or your manager is involved' },
}

// Ticket categories and routing (Handbook §33 and Cheat Sheet §4)
export const TICKET_TYPES = [
  { id: 'payroll', label: 'Payroll / timekeeping', to: 'payroll', target: 'Acknowledged within 1 business day; target resolution 3 business days', include: 'Pay date, pay period, hours, expected vs. actual amount. Never include a full bank-account number.' },
  { id: 'benefits', label: 'Benefits', to: 'benefits', target: 'Acknowledged within 1 business day; next update within 2 business days', include: 'Event date, eligibility date, plan name, any deadline.' },
  { id: 'leave', label: 'Leave / accommodation', to: 'leave', target: 'Acknowledged within 1 business day; discussion within 3 business days', include: 'Requested start date, expected duration, work impact, best way to reach you. Keep medical details out.' },
  { id: 'relations', label: 'Employee relations concern', to: 'people', target: 'Same-business-day triage during business hours', include: 'What happened, when, where, who was involved, witnesses. If HR is involved, contact Jordan Patel instead.' },
  { id: 'records', label: 'Employment records / verification', to: 'people', target: 'Acknowledged within 3 business days; target 5 business days', include: 'The record or request, recipient, authorization, deadline.' },
  { id: 'policy', label: 'Policy question', to: 'people', target: 'Acknowledged within 2 business days; target 5 business days', include: 'The policy section, your exact question, and what you are trying to do.' },
]

const sectionContact = (s) => ({
  6: 'leave', 7: 'payroll', 8: 'people', 10: 'payroll', 11: 'broker', 12: 'payroll', 13: 'leave', 14: 'leave', 15: 'leave',
  16: 'benefits', 19: 'broker', 20: 'security', 21: 'security', 22: 'broker', 23: 'broker', 24: 'ops', 25: 'ops', 28: 'people',
  29: 'people', 30: 'people',
}[s] || 'people')

// ---------- search ----------
const STOP = new Set('a an and are as at be by can do does for from get got have how i if in is it its me my of on or our should so that the this to was we what when where which who why will with you your am im any about there their them do take tomorrow today tonight next week need want help know please tell just much many happen happens policy policies job days rule rules really still also would could like question ask'.split(' '))
const SYN = {
  vacation: 'pto', holiday: 'holidays', 'dayoff': 'pto leave', off: 'pto', timeoff: 'pto leave',
  paycheck: 'pay payroll deposit',
  grandma: 'grandparent bereavement', grandpa: 'grandparent bereavement', grandmother: 'grandparent bereavement', grandfather: 'grandparent bereavement',
  mom: 'parent bereavement', dad: 'parent bereavement', mother: 'parent', father: 'parent', brother: 'sibling', sister: 'sibling', husband: 'spouse', wife: 'spouse', paid: 'pay payday', salary: 'pay compensation', wage: 'pay', wages: 'pay', check: 'pay',
  deposit: 'deposit pay', bank: 'deposit', money: 'pay',
  sick: 'sick ill', ill: 'sick', doctor: 'sick medical appointments', flu: 'sick',
  funeral: 'bereavement', died: 'bereavement', death: 'bereavement', passed: 'bereavement', bereavement: 'bereavement',
  baby: 'parental bonding birth', maternity: 'parental bonding', paternity: 'parental bonding', pregnant: 'pregnancy parental accommodation', adoption: 'parental adoption',
  insurance: 'medical dental vision benefits', health: 'medical benefits', dental: 'dental benefits', '401k': '401(k) retirement match', retirement: '401(k) retirement',
  quit: 'resign resignation separation', resign: 'resignation separation', fired: 'separation termination corrective', leaving: 'separation leaving',
  wfh: 'remote hybrid', home: 'remote hybrid', remote: 'remote hybrid', hybrid: 'hybrid remote',
  harass: 'harassment', harassed: 'harassment', bully: 'harassment bullying', bullying: 'harassment',
  boss: 'manager', supervisor: 'manager',
  overtime: 'overtime', clock: 'time timekeeping', punch: 'time missed punch',
  reimburse: 'expense reimbursement', reimbursement: 'expense', receipts: 'receipt expense', mileage: 'mileage expense', travel: 'travel expense meals',
  tuition: 'education reimbursement', school: 'education',
  password: 'password forgot', login: 'password account', phishing: 'suspicious link security',
  key: 'key keys', keys: 'key keys', review: 'performance review', raise: 'raise compensation review', promotion: 'promotion review',
  pip: 'pip improvement plan', warning: 'warning corrective', discipline: 'corrective action',
  voting: 'voting', military: 'military leave',
  enroll: 'enrollment enroll', enrollment: 'enrollment', married: 'married life event', marriage: 'married life event',
  injured: 'injured injury incident', hurt: 'injured injury', accident: 'accident injury incident',
  dress: 'dress code', jeans: 'dress casual', office: 'office headquarters hours', yell: 'bullying harassment manager problem', yelled: 'bullying harassment manager problem',
  complaint: 'complaint report concern', complain: 'complaint report', timesheet: 'time entry timekeeping', jury: 'jury duty', vote: 'voting', surgery: 'medical leave', operation: 'medical leave', allowance: 'meals cap', per: 'per', diem: 'meals travel', clothes: 'dress', gift: 'gift', handbook: 'handbook',
}
const stem = (w) => w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '') : w
const words = (t) => (t || '').toLowerCase().replace(/401\s*\(?k\)?/g, '401k').replace(/day off/g, 'dayoff').replace(/time off/g, 'timeoff').replace(/[^a-z0-9$]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w))
const tokens = (t) => words(t).map(stem)

const DOCS = [
  ...handbook.chunks.map((c) => ({ ...c, doc: DOC.title })),
  ...curated.map((c) => ({ doc: DOC.title, boost: 1.25, ...c })),
].map((c, i) => {
  const fields = [[c.q, 3], [`${c.sub || ''} ${c.sectionTitle}`, 1.2], [c.text, 1]]
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

function search(query) {
  const base = [...new Set(words(query))]
  // each word the employee typed, plus its synonyms
  const groups = base.map((w) => [stem(w), ...(SYN[w] || SYN[stem(w)] || '').split(' ').filter(Boolean).map((s) => stem(s.replace(/[()]/g, '')))])
  const q = new Set(groups.flat())
  // words the handbook never uses count, but not more than a typical word
  const wt = (g) => Math.min(idf(g[0]), avgIdf)
  const totalWeight = groups.reduce((s, g) => s + wt(g), 0) || 1
  const k1 = 1.2, b = 0.6
  return DOCS.map((d) => {
    let score = 0
    for (const t of q) {
      const f = d.tf[t]
      if (!f) continue
      score += idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avgLen))
    }
    // how much of what they asked is actually covered by this passage
    const coverage = groups.reduce((s, g) => s + (g.some((t) => d.tf[t]) ? wt(g) : 0), 0) / totalWeight
    score *= d.boost || 1
    return { d, score, coverage }
  }).filter((r) => r.score > 0).sort((a, b) => b.score * b.coverage - a.score * a.coverage)
}

// ---------- safety, privacy, scope ----------
const CRISIS = /suicid|kill myself|end my life|hurt myself|harm myself|self[- ]?harm|want to die|don'?t want to live/i
const DANGER = /weapon|\bgun\b|knife|threat|attack|assault|violen|stalk|in danger|unsafe|scared for my|fire\b|gas smell|smell gas|carbon monoxide/i
const CONCERN = /harass|discriminat|retaliat|hostile|bull(y|ied)|yell(ed|ing)? at|sexual|inappropriate (comment|touch)|racis|sexis/i
const INJURY = /injur|\bhurt\b|accident|fell|bleeding/i
const FRAUD = /wire (instruction|transfer|fraud)|phish|suspicious (link|email)|hacked|data breach|lost (my )?(laptop|phone|device)/i
const SENSITIVE = /\b\d{3}-?\d{2}-?\d{4}\b|\b\d{8,17}\b|password\s*(is|:)|\bssn\b|social security|routing number|account number/i
const OUT_OF_SCOPE = [
  [/\b(sue|lawsuit|lawyer|attorney|legal advice|is it legal)\b/i, 'I can\'t give legal advice. I can share what the handbook says; for a legal question, please talk to a qualified attorney or contact HR.'],
  [/\b(tax return|deduct on my taxes|how much tax|w-?4 allowances)\b/i, 'I can\'t give tax advice. For personal tax questions, please talk to a tax professional. Payroll can help with tax forms and withholding updates.'],
  [/\b(diagnos|symptom|medication|dosage|treatment)\w*/i, 'I can\'t give medical advice. For health concerns, please see a medical professional. You never need to share a diagnosis with your manager.'],
  [/\b(visa|green card|immigration|work permit)\b/i, 'I can\'t give immigration advice. Please contact HR or an immigration attorney.'],
]
const TIME_SENSITIVE = /missing (pay|deposit|paycheck)|didn'?t get paid|not paid|no paycheck|deposit (is )?missing|died|passed away|funeral|bereave|deadline|open enrollment|last day/i
const SMALLTALK = /^\s*(hi|hello|hey|good (morning|afternoon|evening)|thanks|thank you|thx|ok|okay)\b[\s!.]*$/i

/**
 * Answer one employee message. Returns a structured reply the UI renders.
 * kind: 'answer' | 'notfound' | 'crisis' | 'smalltalk'
 */
export function answer(message) {
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
  if (INJURY.test(text)) reply.alerts.push('injury')
  if (CONCERN.test(text)) reply.alerts.push('concern')
  if (FRAUD.test(text)) reply.alerts.push('fraud')
  for (const [re, msg] of OUT_OF_SCOPE) if (re.test(text)) reply.notes.push({ type: 'scope', text: msg })

  const hits = search(text)
  const top = hits[0]
  // need a reasonably strong match before we show a policy as "the answer"
  if (!top || top.score < 3.2 || top.coverage < 0.6) {
    reply.kind = 'notfound'
    reply.suggestions = hits.slice(0, 3).filter((h) => h.score > 1.5 && h.d.q).map((h) => h.d.q)
    return reply
  }
  const seen = new Set()
  for (const h of hits) {
    const key = h.d.q || h.d.text.slice(0, 60)
    if (seen.has(key)) continue
    seen.add(key)
    if (reply.results.length && (h.score * h.coverage < top.score * top.coverage * 0.55 || h.coverage < 0.6)) break
    reply.results.push(h.d)
    if (reply.results.length === 3) break
  }
  const best = reply.results[0]
  reply.contact = CONTACTS[sectionContact(best.section)]
  reply.condolence = /died|passed away|funeral|death|lost my (mom|dad|mother|father|husband|wife|partner|son|daughter|brother|sister|grand)/i.test(text)
  reply.timeSensitive = TIME_SENSITIVE.test(text) || Boolean(best.urgent)
  return reply
}

export const cite = (c) => `${c.doc === DOC.title ? DOC.short : c.doc}, ${DOC.version} · ${c.section >= 100 ? '' : `§${c.section} `}${c.sectionTitle} · p. ${c.page}`

export const SUGGESTED = [
  'How much PTO do I get?',
  'My paycheck is missing',
  'When is open enrollment?',
  'How much bereavement leave is there?',
  'Can I work from home?',
  'How do I report harassment?',
]
