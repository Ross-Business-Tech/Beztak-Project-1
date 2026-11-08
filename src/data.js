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
export const SEED_TICKETS = [
  { id: 1001, subject: 'My paycheck was short this month', body: 'Hi, my paycheck is about $400 lower than usual and I have not been paid for my overtime. Please look into this asap.', customer: 'Jordan Lee', email: 'jordan.lee@examplecompany.com', status: 'Open', urgent: true, topic: 'payroll', assignee: 'omar', createdAt: d(95), by: 'AI', note: 'Routed to Payroll (payroll wording). Marked urgent: "asap". No ready answer, so a person needs to check.', replies: [{ from: 'HR Assistant (AI)', text: 'Thanks Jordan, we received your email and passed it to Omar Haddad in Payroll. Because it affects your pay, it is marked urgent.', at: d(94), email: true }] },
  { id: 1002, subject: 'Question about parental leave', body: 'My partner and I are expecting in March. How does parental leave work and who do I talk to?', customer: 'Ana Souza', email: 'ana.souza@examplecompany.com', status: 'In progress', urgent: false, topic: 'benefits', assignee: 'dana', createdAt: d(1500), by: 'AI', note: 'Routed to Benefits (benefits wording). Not urgent.', replies: [{ from: 'Dana Whitfield', text: 'Congratulations Ana! I will send you the leave guide and book a short call this week.', at: d(1400), email: true }] },
  { id: 1003, subject: 'How many vacation days do I get?', body: 'Quick question: how many vacation days do I get per year?', customer: 'Chris Park', email: 'chris.park@examplecompany.com', status: 'Closed', urgent: false, topic: 'timeoff', assignee: 'priya', createdAt: d(3000), by: 'AI', resolvedByAI: true, note: 'Answered by AI from the HR knowledge base. No person needed.', replies: [{ from: 'HR Assistant (AI)', text: 'Full-time employees get 15 days of paid vacation per year, plus 10 company holidays. You can see your current balance in the HR portal under Time Off.', at: d(2999), email: true }] },
]
