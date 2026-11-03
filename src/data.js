// All sample data is made up.
export const AGENTS = [
  { id: 'maya', name: 'Maya Chen', skill: 'Billing', topics: ['billing'] },
  { id: 'omar', name: 'Omar Haddad', skill: 'Technical', topics: ['technical'] },
  { id: 'priya', name: 'Priya Nair', skill: 'Accounts', topics: ['account'] },
  { id: 'luca', name: 'Luca Romano', skill: 'Shipping', topics: ['shipping'] },
  { id: 'sam', name: 'Sam Brooks', skill: 'General', topics: ['general'] },
]

export const KNOWLEDGE = [
  { topic: 'account', keys: ['reset password', 'forgot password', 'password reset'], answer: 'You can reset your password from the sign-in page: choose "Forgot password", enter your email, and open the link we send you. The link works for 30 minutes.' },
  { topic: 'billing', keys: ['invoice', 'receipt'], answer: 'Invoices are under Settings → Billing → Invoices. You can download any past invoice as a PDF there.' },
  { topic: 'shipping', keys: ['shipping time', 'how long', 'delivery time'], answer: 'Standard shipping takes 3–5 business days and express takes 1–2 business days. You get a tracking email once your order ships.' },
  { topic: 'general', keys: ['opening hours', 'business hours', 'support hours'], answer: 'Our support team is online Monday to Friday, 9am–6pm Eastern.' },
  { topic: 'account', keys: ['change email', 'update email'], answer: 'Go to Settings → Profile, edit your email address, and confirm using the link we send to the new address.' },
]

export const TOPIC_WORDS = {
  billing: ['charge', 'charged', 'refund', 'payment', 'card', 'invoice', 'billing', 'subscription', 'price', 'receipt'],
  technical: ['error', 'bug', 'crash', 'broken', 'not working', "doesn't work", 'slow', 'loading', 'app', 'login page', 'down'],
  account: ['password', 'account', 'email', 'sign in', 'login', 'log in', 'locked', 'profile', 'username'],
  shipping: ['order', 'delivery', 'shipping', 'package', 'tracking', 'arrived', 'courier', 'lost'],
}
export const URGENT_WORDS = ['urgent', 'asap', 'immediately', 'emergency', 'down', 'outage', 'cannot access', "can't access", 'charged twice', 'double charged', 'fraud', 'hacked', 'locked out', 'lost money', 'deadline today']

const d = (mins) => new Date(Date.now() - mins * 60000).toISOString()
export const SEED_TICKETS = [
  { id: 1001, subject: 'Charged twice for my subscription', body: 'I was double charged this month, please fix this asap.', customer: 'Jordan Lee', status: 'Open', urgent: true, topic: 'billing', assignee: 'maya', createdAt: d(95), by: 'AI', note: 'Marked urgent: mentions a double charge.', replies: [] },
  { id: 1002, subject: 'App keeps crashing on startup', body: 'Since the update the app crashes as soon as I open it.', customer: 'Ana Souza', status: 'Open', urgent: false, topic: 'technical', assignee: 'omar', createdAt: d(240), by: 'AI', note: 'Routed to Technical: mentions a crash.', replies: [] },
  { id: 1003, subject: 'Where is my package?', body: 'My order has not arrived and the tracking has not updated in a week.', customer: 'Chris Park', status: 'In progress', urgent: false, topic: 'shipping', assignee: 'luca', createdAt: d(1500), by: 'AI', note: 'Routed to Shipping: mentions order and tracking.', replies: [{ from: 'Luca Romano', text: 'Thanks Chris, I am checking with the courier now.', at: d(1400) }] },
]
