// All sample data is made up.
export const HR_ADDRESS = 'hr@examplecompany.com'

export const AGENTS = [
  { id: 'dana', name: 'Dana Whitfield', skill: 'Benefits', topics: ['benefits'] },
  { id: 'omar', name: 'Omar Haddad', skill: 'Payroll', topics: ['payroll'] },
  { id: 'priya', name: 'Priya Nair', skill: 'Time off', topics: ['timeoff'] },
  { id: 'luca', name: 'Luca Romano', skill: 'Onboarding', topics: ['onboarding'] },
  { id: 'sam', name: 'Sam Brooks', skill: 'Employee relations', topics: ['relations', 'general'] },
]

export const TOPIC_LABELS = { benefits: 'Benefits', payroll: 'Payroll', timeoff: 'Time off', onboarding: 'Onboarding', relations: 'Employee relations', general: 'General' }

// Questions the AI can answer on its own.
export const KNOWLEDGE = [
  { topic: 'timeoff', keys: ['how many vacation', 'vacation days', 'pto balance', 'how much pto', 'paid time off'], answer: 'Full-time employees get 15 days of paid vacation per year, plus 10 company holidays. You can see your current balance in the HR portal under Time Off.' },
  { topic: 'timeoff', keys: ['request time off', 'request vacation', 'book vacation', 'take a day off'], answer: 'To request time off, open the HR portal, choose Time Off → New Request, pick your dates, and submit. Your manager will get a notification to approve it.' },
  { topic: 'payroll', keys: ['pay date', 'payday', 'when do i get paid', 'pay schedule'], answer: 'We pay every second Friday. If a payday falls on a holiday, you are paid on the working day before.' },
  { topic: 'payroll', keys: ['pay stub', 'payslip', 'w-2', 'w2', 'tax form'], answer: 'Pay stubs and tax forms are in the HR portal under Pay → Documents. Tax forms are posted by January 31 each year.' },
  { topic: 'benefits', keys: ['open enrollment', 'enroll in health', 'health insurance enroll', 'add dependent'], answer: 'Open enrollment runs November 1–15. You can also change coverage within 30 days of a life event such as marriage or a new baby, in the HR portal under Benefits.' },
  { topic: 'benefits', keys: ['401k', '401(k)', 'retirement match'], answer: 'The company matches 100% of your 401(k) contributions up to 4% of your pay. You are eligible after 30 days of employment.' },
  { topic: 'onboarding', keys: ['first day', 'what do i bring', 'new hire paperwork'], answer: 'On your first day, bring a photo ID and your signed offer letter. Your manager will meet you at reception at 9:00am, and IT will set up your laptop.' },
  { topic: 'general', keys: ['dress code', 'work from home policy', 'remote work policy', 'hybrid policy'], answer: 'We follow a hybrid model: three days in the office and two days remote each week, agreed with your manager. The dress code is business casual.' },
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

export const URGENT_WORDS = ['urgent', 'asap', 'immediately', 'emergency', 'unpaid', 'not been paid', "wasn't paid", 'missing paycheck', 'harass', 'assault', 'unsafe', 'retaliat', 'deadline today', 'coverage ends', 'lost coverage', 'hospital']

const d = (mins) => new Date(Date.now() - mins * 60000).toISOString()
const ai = (text, at) => ({ from: 'HR Assistant (AI)', text, at, email: true, ai: true })
const T = (id, subject, body, customer, status, urgent, topic, assignee, age, note, replies = [], extra = {}) => ({
  id, subject, body, customer, email: `${customer.toLowerCase().replace(/[^a-z]+/g, '.')}@examplecompany.com`,
  status, urgent, topic, assignee, createdAt: d(age), note, replies, channel: 'Email', tags: [], advice: [],
  dueAt: new Date(Date.now() - age * 60000 + (urgent ? 4 : 24) * 3600000).toISOString(), ...extra,
})
export const SEED_TICKETS = [
  T(1008, 'Unsafe wiring in the break room', 'There are exposed wires near the microwave in the 3rd floor break room. Someone could get hurt.', 'Taylor Reed', 'Open', true, 'relations', 'sam', 12, 'Sensitive subject ("unsafe"): the AI never answers these, a person handles it. Routed to Employee relations. Marked urgent: "unsafe".', [ai('Hi Taylor, thanks for contacting HR. This is a confidential matter, so a person on the team will handle it personally. We passed your message to Sam Brooks. It is marked urgent, so it will be looked at first.', d(11))], { tags: ['sensitive', 'safety'] }),
  T(1007, 'How do I request time off?', 'Hi, I want to take next Friday off. How do I request it?', 'Mia Torres', 'Closed', false, 'timeoff', 'priya', 45, 'Answered by AI from the HR knowledge base. No person needed.', [ai('To request time off, open the HR portal, choose Time Off → New Request, pick your dates, and submit. Your manager will get a notification to approve it.', d(44))], { resolvedByAI: true, tags: ['ai-resolved'] }),
  T(1001, 'My paycheck was short this month', 'Hi, my paycheck is about $400 lower than usual and I have not been paid for my overtime. Please look into this asap.', 'Jordan Lee', 'Open', true, 'payroll', 'omar', 95, 'No ready answer. Routed to Payroll. Marked urgent: "asap".', [ai('Thanks Jordan, we received your email and passed it to Omar Haddad in Payroll. Because it affects your pay, it is marked urgent.', d(94))], { tags: ['pay-error'], advice: [{ id: 1, from: 'omar', to: 'dana', question: 'Could a new benefit deduction explain the $400 drop? Can you check whether Jordan was enrolled in anything new this month?', at: d(60), answer: '' }] }),
  T(1006, 'Adding my spouse to health insurance', 'We got married last month. How do I add my spouse to my health plan?', 'Noah Kim', 'In progress', false, 'benefits', 'dana', 180, 'No ready answer. Routed to Benefits. Not urgent.', [ai('Hi Noah, thanks for contacting HR. We passed your message to Dana Whitfield. You can expect a reply within one business day.', d(179)), { from: 'Dana Whitfield', text: 'Congratulations Noah! Marriage counts as a life event, so you have 30 days. I am sending you the form now.', at: d(120), email: true }], { tags: ['life-event'], advice: [{ id: 1, from: 'dana', to: 'priya', question: 'Does the 30-day life-event window count from the wedding date or the date HR is told?', at: d(150), answer: 'It counts from the wedding date, so Noah has until the end of next week.', answeredAt: d(130) }] }),
  T(1005, 'What is the dress code?', 'Is there a dress code for client days?', 'Ella Brooks', 'Closed', false, 'general', 'sam', 400, 'Answered by AI from the HR knowledge base. No person needed.', [ai('We follow a hybrid model: three days in the office and two days remote each week, agreed with your manager. The dress code is business casual.', d(399))], { resolvedByAI: true, tags: ['ai-resolved'] }),
  T(1004, 'Question about parental leave', 'My partner and I are expecting in March. How does parental leave work and who do I talk to?', 'Ana Souza', 'In progress', false, 'benefits', 'dana', 1500, 'No ready answer. Routed to Benefits. Not urgent.', [{ from: 'Dana Whitfield', text: 'Congratulations Ana! I will send you the leave guide and book a short call this week.', at: d(1400), email: true }], { tags: ['leave'] }),
  T(1003, 'Laptop not ready for my start date', 'I start Monday but IT says my laptop order has not been approved. Who can help?', 'Sofia Rossi', 'Open', false, 'onboarding', 'luca', 2000, 'No ready answer. Routed to Onboarding. Not urgent.', [ai('Hi Sofia, thanks for contacting HR. We passed your message to Luca Romano. You can expect a reply within one business day.', d(1999))]),
  T(1002, 'How many vacation days do I get?', 'Quick question: how many vacation days do I get per year?', 'Chris Park', 'Closed', false, 'timeoff', 'priya', 3000, 'Answered by AI from the HR knowledge base. No person needed.', [ai('Full-time employees get 15 days of paid vacation per year, plus 10 company holidays. You can see your current balance in the HR portal under Time Off.', d(2999))], { resolvedByAI: true, tags: ['ai-resolved'] }),
  T(1009, 'Dental coverage for my kids', 'Does our dental plan cover orthodontics for my two kids?', 'Lena Park', 'Open', false, 'benefits', 'dana', 30, 'No ready answer. Routed to Benefits. Not urgent.', [ai('Hi Lena, thanks for contacting HR. We passed your message to Dana Whitfield. You can expect a reply within one business day.', d(29))], { tags: ['dental'] }),
]

export const CANNED = [
  { id: 1, name: 'Acknowledge receipt', text: "Hi {name},\n\nThanks for reaching out. I'm looking into this and will get back to you by the end of the next business day.\n\nBest,\n{agent}" },
  { id: 2, name: 'Need more information', text: 'Hi {name},\n\nTo help with this I need a little more detail. Could you tell me the dates this applies to and any reference numbers you have?\n\nThanks,\n{agent}' },
  { id: 3, name: 'Sent to payroll', text: 'Hi {name},\n\nI have asked our payroll team to review this. You will receive an update within two business days, and any correction will appear in your next paycheck.\n\nBest,\n{agent}' },
  { id: 4, name: 'Resolved, closing', text: 'Hi {name},\n\nI am glad we could sort this out. I am closing this ticket, but reply to this email any time if you need anything else.\n\nBest,\n{agent}' },
]
