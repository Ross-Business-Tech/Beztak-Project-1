import { dueFrom } from './hours'

// All sample data is made up.
export const HR_ADDRESS = 'hr@examplecompany.com'

// A login belongs to the HR person whose id or full name matches the start of the sign-in email:
// dana@..., omar@... or dana.whitfield@... Anyone else (for example the old shared team login) has no desk of their own.
export const agentForAccount = (email) => {
  const local = String(email || '').toLowerCase().split('@')[0]
  const letters = (x) => x.replace(/[^a-z]/g, '')
  return AGENTS.find((a) => local === a.id || letters(local) === letters(a.name.toLowerCase())) || null
}

export const AGENTS = [
  { id: 'dana', name: 'Dana Whitfield', skill: 'Benefits', topics: ['benefits'] },
  { id: 'omar', name: 'Omar Haddad', skill: 'Payroll', topics: ['payroll'] },
  { id: 'priya', name: 'Priya Nair', skill: 'Time off', topics: ['timeoff'] },
  { id: 'luca', name: 'Luca Romano', skill: 'Onboarding', topics: ['onboarding'] },
  { id: 'sam', name: 'Sam Brooks', skill: 'Employee relations', topics: ['relations', 'general'] },
]

export const TOPIC_LABELS = { benefits: 'Benefits', payroll: 'Payroll', timeoff: 'Time off', onboarding: 'Onboarding', relations: 'Employee relations', general: 'General' }

// Questions the AI can answer on its own. Every answer comes from the Beztak Operations Manual
// (src/data/beztakManual.js); nothing here may be made up.
export const KNOWLEDGE = [
  { topic: 'timeoff', keys: ['how many vacation', 'vacation days per year', 'paid time off', 'vacation am i entitled', 'vacation allowance', 'pto allowance', 'days off do we get', 'days off per year', 'vacation policy', 'pto policy', 'how does pto work'], answer: 'All regular full-time and part-time site employees accrue paid time off (PTO), and the amount depends on your length of service. You can use PTO for vacation, sick time, family needs, personal affairs or rest. The current PTO policy is in Egnyte (Employee Handbook).' },
  { topic: 'timeoff', keys: ['request time off', 'request vacation', 'book vacation', 'take a day off', 'request pto', 'submit pto'], answer: 'PTO requests go through Paycor, and your manager approves them. For questions about your PTO time, email HR@beztak.com.' },
  { topic: 'payroll', keys: ['pay date', 'payday', 'pay day', 'when do i get paid', 'pay schedule', 'how often are we paid', 'how often do we get paid', 'when will i be paid', 'when are we paid', 'payroll calendar'], answer: 'Payroll is bi-weekly, with paydays every other Friday. Each paycheck covers the two-week period ending the Friday before payday. The payroll calendar is in Egnyte.' },
  { topic: 'timeoff', keys: ['paid holidays', 'which holidays', 'holiday pay', 'holidays off', 'holidays do we', 'holiday schedule', 'holiday calendar'], answer: "The paid holidays generally observed are New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving Day and Christmas Day; the list is published each year and the calendar is in Egnyte. Full-time hourly employees who must work a holiday get 1.5 times their regular rate plus holiday pay. To receive holiday pay, work your scheduled hours the day before and the day after the holiday (pre-approved time off is fine)." },
  { topic: 'general', keys: ['lunch break', 'meal break', 'rest break', 'breaks do i get', 'how long is lunch', 'break policy'], answer: 'You get a one-hour (60-minute) unpaid meal break each day you work more than four hours, plus two 15-minute paid rest breaks. Hourly employees clock out for any break longer than 20 minutes.' },
  { topic: 'payroll', keys: ['how does overtime', 'overtime policy', 'overtime rate', 'time and a half', 'comp time', 'when do i get overtime'], answer: 'Hourly (non-exempt) employees are paid one and one-half times their hourly rate for time worked over 40 hours in a week. The work week runs from 12:00 a.m. Saturday to 11:59 p.m. Friday. Comp time must be taken in the same pay period it is earned.' },
  { topic: 'timeoff', keys: ['call in sick', 'calling in sick', 'call out sick', 'calling out', 'will be late', 'going to be late', 'running late', 'be absent', 'miss work today'], answer: 'Tell your immediate manager at least two hours before your workday starts and give the reason, by text, email or phone (whichever your manager prefers). Social media messages are not accepted. If you get no reply, call your manager to make sure they received it.' },
  { topic: 'payroll', keys: ['when are bonuses paid', 'bonus paid', 'bonuses paid', 'bonus payout', 'when do i get my bonus', 'commission paid', 'commissions paid'], answer: 'Bonuses, including leasing and renewal commissions, quarterly bonuses and on-call bonuses, are paid on the second check of each month. You must be employed when they are paid out.' },
  { topic: 'onboarding', keys: ['fair housing training', 'first week', 'new hire training', 'training do i need', 'what training'], answer: 'All new associates complete Fair Housing training within one week of employment. Always wear your Beztak name badge when representing Beztak, and attend the quarterly safety meetings.' },
  { topic: 'general', keys: ['dress code', 'what to wear', 'what should i wear', 'wear jeans', 'attire', 'uniform policy', 'do we have uniforms', 'do we wear uniforms'], answer: 'Beztak provides uniforms and name tags. Office and maintenance uniforms are ordered twice a year (Spring and Fall) through ICO Uniforms by your Property Manager, and maintenance staff can get new boots once a year through Shoes for Crews. Office and leasing staff wear proper business attire at all times. Not every ownership group participates, so check with your Regional Manager.' },
]

// Questions the assistant must NEVER answer itself. Checked before anything else.
// Each one sends the ticket to a person and records the reason.
export const ESCALATIONS = [
  { id: 'pto-balance', reason: 'Requires access to individual employee records', topic: 'timeoff', tag: 'personal-record', example: 'How many PTO hours do I personally have left?',
    test: /(how many|how much|what('| i)?s|check|tell me|look up).*(pto|vacation|sick|leave|time off).*(left|remain|personally|balance|have i|do i have)|my (pto|vacation|sick|leave) (balance|hours|days)|^(?=.*\b(my|i|i'?ve|me)\b)(?=.*(pto|vacation|sick|leave|time off|days off|holiday))(?=.*(left|remaining|balance|still have|used up|accrued|running (low|out)|got left))/,
    extra: 'Your personal balance is kept in your employee record, so a team member will confirm it for you.' },
  { id: 'paycheck-less', reason: 'Requires investigation of personal payroll information', topic: 'payroll', tag: 'pay-error', example: 'Why was my paycheck $200 less this week?',
    test: /(paycheck|pay check|pay|salary|check|deposit|overtime|wages?|pay ?stub|bonus).*(less|short|lower|smaller|missing|wrong|incorrect|didn't|did not|forgot|never (came|arrived|got)|error|mistake|weird)|why (was|is) my (pay|paycheck)|underpaid|overpaid|not (been )?paid|wasn'?t paid|haven'?t been paid|deduct|garnish/,
    extra: 'Payroll will look into the details of your pay and reply to you directly.' },
  { id: 'take-off', reason: 'May require manager approval', topic: 'timeoff', tag: 'needs-approval', example: 'Can I take tomorrow off?',
    test: /\b(can|could|may) i\b.*\b(take|have|get)\b.*\boff\b|\b(am i allowed|may i)\b.*\boff\b|\b(can|could|may) i\b.*\b(leave early|skip|miss work|come in late|work from home|wfh|swap (my )?shift)\b|\b(is (it|that)|would (it|that) be) (ok|okay|fine|alright|all right)\b|\bneed .*\boff\b.*\?|\bpermission\b/,
    extra: 'Time off needs your manager\'s approval. A team member will follow up, and you can also submit the request in Paycor.' },
  { id: 'promotion', reason: 'Depends on management decisions', topic: 'general', tag: 'management-decision', example: 'Will I get promoted next month?',
    test: /promot|pay (raise|increase)|get a raise/,
    extra: 'Promotion and pay decisions are made by management, so a person on the team will respond.' },
  { id: 'coworker-pay', reason: 'Confidential employee information', topic: 'relations', tag: 'confidential', example: 'How much does my coworker make?',
    test: /\b(coworker|co-worker|colleague|teammate|manager|boss|someone|everyone|others|new (guy|girl|hire|person)|(?!what|that|it|there|here|who|when|where|how|let|today)\w+'s)\b.*\b(salary|salaries|make|makes|earn|earns|earning|paid|pay|wage)\b(?! (me|it|us|sure|sense)\b)|\b(salary|salaries|pay|wages?|make|earn)\b.*\b(coworker|co-worker|colleague|teammate|new (guy|girl|hire|person)|everyone else|others)\b|(salary|pay) of (my|a|the) (coworker|colleague|manager|boss)|\bhow much (is|does|do) (?!i\b|we\b|it\b|the\b)\w+ (make|earn|get paid)|\bwhat (is|does) (?!my\b|the\b|our\b|it\b)\w+ (paid|make|earn)|\b(earning|making|paid) more than me/,
    extra: 'We cannot share information about other employees.' },
  { id: 'bereavement', reason: 'Requires appropriate authorization', topic: 'timeoff', tag: 'needs-approval', example: 'Can you approve my bereavement leave?',
    test: /approv\w*.*(leave|bereavement|time off|request|pto|vacation|days? off|holiday)|(leave|time off|request|pto|vacation|days? off).*approv|bereavement/,
    extra: 'We are sorry for your loss. Leave must be approved by an authorized team member, who will contact you shortly.' },
  { id: 'write-up', reason: 'Requires details about an individual incident', topic: 'relations', tag: 'confidential', example: 'Why did my manager write me up?',
    test: /write.?up|written up|disciplin|formal warning|why did my manager/,
    extra: 'This involves a specific incident, so a person from Employee Relations will speak with you.' },
  { id: 'fired', reason: 'Confidential personnel decision', topic: 'relations', tag: 'confidential', example: 'Am I going to get fired?',
    test: /(am i|will i be|going to be|about to be).*(fired|laid off|let go|terminated)|get fired|lose my job|job (is )?(at risk|safe|secure)|\blayoffs?\b|being let go|performance improvement plan|\bon a pip\b/,
    extra: 'This is a confidential matter, so a person from Employee Relations will contact you personally.' },
  { id: 'direct-deposit', reason: 'Requires secure authentication and an authorized process', topic: 'payroll', tag: 'security', example: 'Can you change my direct deposit information?',
    test: /(change|update|switch|edit).*(direct deposit|bank|routing number|account number)/,
    extra: 'For your security, please do not send bank details by email. Payroll will contact you directly through a secure process.' },
  { id: 'password', reason: 'Unauthorized access request', topic: 'relations', tag: 'security', example: "What is the password to my manager's account?",
    test: /password.*(manager|boss|coworker|colleague|someone|his|her|their)|(manager|boss|coworker|colleague)'?s? .*(password|account|login)|access (to )?(my |a |someone's )?(manager|boss|coworker|colleague)/,
    extra: 'We cannot share or give access to anyone else\'s account. This request has been logged for review.' },
]

// Words that hint at a topic, used when no ready answer exists.
export const TOPIC_WORDS = {
  benefits: ['insurance', 'health', 'dental', 'vision', 'benefit', 'coverage', 'claim', 'dependent', 'parental leave', 'maternity', 'paternity'],
  payroll: ['paycheck', 'salary', 'pay', 'overtime', 'bonus', 'deduction', 'tax', 'direct deposit', 'reimbursement', 'expense'],
  timeoff: ['vacation', 'leave', 'sick', 'time off', 'holiday', 'pto', 'absence'],
  onboarding: ['new hire', 'onboarding', 'start date', 'offer letter', 'background check', 'badge', 'laptop'],
  relations: ['manager', 'coworker', 'colleague', 'complaint', 'harass', 'discriminat', 'bully', 'unfair', 'conflict', 'safety', 'resign', 'termination', 'fired'],
}

// Topics the AI must never answer itself: they always go to a person.
export const SENSITIVE_WORDS = ['harass', 'discriminat', 'bully', 'assault', 'retaliat', 'unsafe', 'safety', 'resign', 'terminat', 'fired', 'lawsuit', 'whistleblow', 'medical condition', 'disability']

// Urgency comes from the SITUATION (pay not received, harassment, safety, lost coverage), never from the sender
// calling their own email urgent. The sender's own words ("urgent", "asap", "emergency") are listed in SELF_URGENT
// and are ignored for priority.
export const SELF_URGENT = /\b(urgent(ly)?|asap|immediately|emergency|right away|as soon as possible|top priority|time[- ]sensitive|drop everything)\b/i
export const URGENT_WORDS = ['unpaid', 'was not paid', 'did not get paid', "didn't get paid", 'never got paid', 'not been paid', "wasn't paid", 'missing paycheck', 'harass', 'assault', 'unsafe', 'retaliat', 'deadline today', 'coverage ends', 'lost coverage', 'hospital']

const d = (mins) => new Date(Date.now() - mins * 60000).toISOString()
const ai = (text, at) => ({ from: 'HR Assistant (automated)', text, at, email: true, ai: true })
const T = (id, subject, body, customer, status, urgent, topic, assignee, age, note, replies = [], extra = {}) => ({
  id, subject, body, customer, email: `${customer.toLowerCase().replace(/[^a-z]+/g, '.')}@examplecompany.com`,
  status, urgent, topic, assignee, createdAt: d(age), note, replies, channel: 'Email', tags: [], advice: [],
  dueAt: dueFrom(d(age), urgent).toISOString(), ...extra,
})
export const SEED_TICKETS = [
  T(1008, 'Unsafe wiring in the break room', 'There are exposed wires near the microwave in the 3rd floor break room. Someone could get hurt.', 'Taylor Reed', 'Open', true, 'relations', 'sam', 12, 'Sensitive subject ("unsafe"): the assistant never answers these, a person handles it. Routed to Employee relations. Marked urgent: "unsafe".', [ai('Hi Taylor, thanks for contacting HR. This is a confidential matter, so a person on the team will handle it personally. We passed your message to Sam Brooks. It is marked urgent, so it will be looked at first.', d(11))], { tags: ['sensitive', 'safety'] }),
  T(1007, 'How do I request time off?', 'Hi, I want to take next Friday off. How do I request it?', 'Mia Torres', 'Closed', false, 'timeoff', 'priya', 45, 'Answered automatically from the HR answers list. No person needed.', [ai(KNOWLEDGE[1].answer, d(44))], { resolvedByAI: true, tags: ['ai-resolved'] }),
  T(1001, 'My paycheck was short this month', 'Hi, my paycheck is about $400 lower than usual and I have not been paid for my overtime. Please look into this asap.', 'Jordan Lee', 'Open', true, 'payroll', 'omar', 95, 'No ready answer. Routed to Payroll. Marked urgent: "not been paid".', [ai('Thanks Jordan, we received your email and passed it to Omar Haddad in Payroll. Because it affects your pay, it is marked urgent.', d(94))], { tags: ['pay-error'], advice: [{ id: 1, from: 'omar', to: 'dana', question: 'Could a new benefit deduction explain the $400 drop? Can you check whether Jordan was enrolled in anything new this month?', at: d(60), answer: '' }] }),
  T(1006, 'Adding my spouse to health insurance', 'We got married last month. How do I add my spouse to my health plan?', 'Noah Kim', 'In progress', false, 'benefits', 'dana', 180, 'No ready answer. Routed to Benefits. Not urgent.', [ai('Hi Noah, thanks for contacting HR. We passed your message to Dana Whitfield. You can expect a reply within one business day.', d(179)), { from: 'Dana Whitfield', text: 'Congratulations Noah! I am sending you the form to add your spouse now.', at: d(120), email: true }], { tags: ['life-event'], advice: [{ id: 1, from: 'dana', to: 'priya', question: 'Does adding a spouse change anything on the time-off side for Noah?', at: d(150), answer: 'No, PTO is based on length of service, so nothing changes there.', answeredAt: d(130) }] }),
  T(1005, 'What is the dress code?', 'Is there a dress code for client days?', 'Ella Brooks', 'Closed', false, 'general', 'sam', 400, 'Answered automatically from the HR answers list. No person needed.', [ai(KNOWLEDGE[9].answer, d(399))], { resolvedByAI: true, tags: ['ai-resolved'] }),
  T(1004, 'Question about parental leave', 'My partner and I are expecting in March. How does parental leave work and who do I talk to?', 'Ana Souza', 'In progress', false, 'benefits', 'dana', 1500, 'No ready answer. Routed to Benefits. Not urgent.', [{ from: 'Dana Whitfield', text: 'Congratulations Ana! I will send you the leave guide and book a short call this week.', at: d(1400), email: true }], { tags: ['leave'] }),
  T(1003, 'Laptop not ready for my start date', 'I start Monday but IT says my laptop order has not been approved. Who can help?', 'Sofia Rossi', 'Open', false, 'onboarding', 'luca', 2000, 'No ready answer. Routed to Onboarding. Not urgent.', [ai('Hi Sofia, thanks for contacting HR. We passed your message to Luca Romano. You can expect a reply within one business day.', d(1999))]),
  T(1002, 'How many vacation days do I get?', 'Quick question: how many vacation days do I get per year?', 'Chris Park', 'Closed', false, 'timeoff', 'priya', 3000, 'Answered automatically from the HR answers list. No person needed.', [ai(KNOWLEDGE[0].answer, d(2999))], { resolvedByAI: true, tags: ['ai-resolved'] }),
  T(1009, 'Dental coverage for my kids', 'Does our dental plan cover orthodontics for my two kids?', 'Lena Park', 'Open', false, 'benefits', 'dana', 30, 'No ready answer. Routed to Benefits. Not urgent.', [ai('Hi Lena, thanks for contacting HR. We passed your message to Dana Whitfield. You can expect a reply within one business day.', d(29))], { tags: ['dental'] }),
]

export const SEED_DOCS = [
  { id: 1, name: 'Beztak Operations Manual (updated 09.28.2026).pdf', size: 139015, addedAt: new Date().toISOString(), source: 'Beztak', text: 'Beztak Operations Manual, 56 pages: Management (rent collections, renewals, move-out, deposits, purchasing, petty cash, timecards, bonuses), Leasing & Marketing, Maintenance and Human Resources. Its policies are loaded into the assistant\'s answer bank, listed further down this page.' },
]
