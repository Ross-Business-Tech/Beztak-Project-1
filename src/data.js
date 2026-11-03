// Made-up sample data for the Harbor & Vine demo. No real people or businesses.
// In real life this would be merged from: dispatch (TMS), driver app, warehouse (WMS), and text messages.

export const SOURCES = {
  WMS: 'Warehouse system',
  TMS: 'Dispatch system',
  DRIVER: 'Driver app',
  SMS: 'Driver text message',
}

export const STEPS = ['Order received', 'Picked & packed', 'Loaded on truck', 'Out for delivery', 'Delivered']

export const DEPOT = { x: 50, y: 52, name: 'Harbor & Vine Warehouse' }

export const TRUCKS = [
  { id: 'T-07', driver: 'Marcus (sample)', color: '#e4572e', x: 22, y: 26 },
  { id: 'T-12', driver: 'Priya (sample)', color: '#2e86ab', x: 74, y: 22 },
  { id: 'T-15', driver: 'Diego (sample)', color: '#8f2d56', x: 80, y: 70 },
  { id: 'T-21', driver: 'Hannah (sample)', color: '#3a7d44', x: 30, y: 78 },
  { id: 'T-24', driver: 'Sam (sample)', color: '#f2a541', x: 58, y: 36 },
  { id: 'T-30', driver: 'Ava (sample)', color: '#5c4d7d', x: 12, y: 55 },
]

// time helpers: minutes since 6:00 AM -> "h:mm AM"
export function clock(min) {
  if (min < 0) return 'Yesterday ' + clock(min + 1440)
  const total = 6 * 60 + min
  let h = Math.floor(total / 60)
  const m = total % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

// "Now" in the demo is 10:30 AM (270 minutes after 6:00)
export const NOW = 270

const e = (min, step, note, source) => ({ time: clock(min), step, note, source })

export const ORDERS = [
  {
    id: '1042',
    customer: 'Bluefin Bistro',
    contact: 'Chef Rosa (sample)',
    items: '12 cases sparkling water, 4 cases olive oil',
    address: '18 Dockside Ave',
    x: 18, y: 20,
    truck: 'T-07',
    stepIndex: 3,
    status: 'Delayed',
    etaFrom: 360, etaTo: 390,
    promised: 'by 11:00 AM',
    stopsAway: 3,
    reason: 'Bridge closure on Route 9 added a 40-minute detour.',
    events: [
      e(-900, 0, 'Order placed by phone', 'WMS'),
      e(30, 1, 'Picked and packed, 16 cases', 'WMS'),
      e(75, 2, 'Scanned onto truck T-07, bay 4', 'WMS'),
      e(90, 3, 'Truck T-07 left warehouse', 'TMS'),
      e(252, 3, 'Detour: Route 9 bridge closed, rerouting via Harbor St', 'DRIVER'),
      e(258, 3, '"Running about 40 min behind, Bluefin is 3 stops out"', 'SMS'),
    ],
  },
  {
    id: '1057',
    customer: 'Copper Kettle Café',
    contact: 'Jordan (sample)',
    items: '6 cases oat milk, 2 cases espresso beans',
    address: '402 Market St',
    x: 72, y: 18,
    truck: 'T-12',
    stepIndex: 3,
    status: 'On time',
    etaFrom: 285, etaTo: 300,
    promised: 'by 11:30 AM',
    stopsAway: 1,
    reason: null,
    events: [
      e(-700, 0, 'Order placed online', 'WMS'),
      e(40, 1, 'Picked and packed, 8 cases', 'WMS'),
      e(80, 2, 'Scanned onto truck T-12', 'WMS'),
      e(95, 3, 'Truck T-12 left warehouse', 'TMS'),
      e(262, 3, 'Delivered to previous stop, Copper Kettle is next', 'DRIVER'),
    ],
  },
  {
    id: '1063',
    customer: 'Lantern Wine Bar',
    contact: 'Mei (sample)',
    items: '10 cases red wine, 3 cases tonic',
    address: '77 Vine Ln',
    x: 84, y: 76,
    truck: 'T-15',
    stepIndex: 4,
    status: 'Delivered',
    etaFrom: 225, etaTo: 225,
    promised: 'by 10:30 AM',
    stopsAway: 0,
    reason: null,
    deliveredTo: 'Signed by "M. Lee" at back door',
    events: [
      e(-800, 0, 'Order placed by email', 'WMS'),
      e(20, 1, 'Picked and packed, 13 cases', 'WMS'),
      e(60, 2, 'Scanned onto truck T-15', 'WMS'),
      e(70, 3, 'Truck T-15 left warehouse', 'TMS'),
      e(225, 4, 'Delivered. Signed by "M. Lee" at back door. Photo taken.', 'DRIVER'),
    ],
  },
  {
    id: '1071',
    customer: 'Greenleaf Grocers',
    contact: 'Tomas (sample)',
    items: '20 cases juice, 5 cases kombucha',
    address: '9 Orchard Rd',
    x: 34, y: 82,
    truck: null,
    stepIndex: 1,
    status: 'Held at warehouse',
    etaFrom: 1440 + 60, etaTo: 1440 + 120,
    promised: 'today',
    stopsAway: null,
    reason: 'Kombucha (5 cases) was short in stock. Rest of order is packed and will ship on tomorrow’s first truck unless the customer wants a partial delivery today.',
    events: [
      e(-600, 0, 'Order placed online', 'WMS'),
      e(50, 1, 'Picked 20 of 25 cases. Kombucha out of stock.', 'WMS'),
      e(110, 1, 'Held for restock. Moved to tomorrow 7:00 AM truck.', 'TMS'),
    ],
  },
  {
    id: '1088',
    customer: 'Saltwater Oyster House',
    contact: 'Kai (sample)',
    items: '8 cases white wine, 6 cases lemons',
    address: '3 Pier Rd',
    x: 10, y: 50,
    truck: 'T-30',
    stepIndex: 3,
    status: 'Delayed',
    etaFrom: 330, etaTo: 360,
    promised: 'by 11:00 AM',
    stopsAway: 2,
    reason: 'Previous stop had a 30-minute unloading wait (dock was full).',
    events: [
      e(-500, 0, 'Order placed by phone', 'WMS'),
      e(35, 1, 'Picked and packed, 14 cases', 'WMS'),
      e(85, 2, 'Scanned onto truck T-30', 'WMS'),
      e(100, 3, 'Truck T-30 left warehouse', 'TMS'),
      e(240, 3, 'Waiting at dock, 30 min unload delay at prior stop', 'DRIVER'),
      e(268, 3, '"Back moving now, Saltwater in 2 stops"', 'SMS'),
    ],
  },
  {
    id: '1095',
    customer: 'Maple & Rye Bakery',
    contact: 'Ellie (sample)',
    items: '4 cases butter, 10 bags flour',
    address: '55 Hill St',
    x: 60, y: 30,
    truck: 'T-24',
    stepIndex: 3,
    status: 'On time',
    etaFrom: 280, etaTo: 295,
    promised: 'by 11:00 AM',
    stopsAway: 1,
    reason: null,
    events: [
      e(-650, 0, 'Order placed online', 'WMS'),
      e(45, 1, 'Picked and packed', 'WMS'),
      e(90, 2, 'Scanned onto truck T-24', 'WMS'),
      e(110, 3, 'Truck T-24 left warehouse', 'TMS'),
    ],
  },
  {
    id: '1102',
    customer: 'Sunset Taqueria',
    contact: 'Luis (sample)',
    items: '15 cases soda, 6 cases limes',
    address: '210 Bay Blvd',
    x: 28, y: 72,
    truck: 'T-21',
    stepIndex: 3,
    status: 'On time',
    etaFrom: 300, etaTo: 320,
    promised: 'by 12:00 PM',
    stopsAway: 2,
    reason: null,
    events: [
      e(-400, 0, 'Order placed online', 'WMS'),
      e(55, 1, 'Picked and packed', 'WMS'),
      e(95, 2, 'Scanned onto truck T-21', 'WMS'),
      e(120, 3, 'Truck T-21 left warehouse', 'TMS'),
    ],
  },
  {
    id: '1110',
    customer: 'Northside Deli',
    contact: 'Ben (sample)',
    items: '3 cases pickles, 6 cases iced tea',
    address: '600 North Rd',
    x: 46, y: 12,
    truck: 'T-24',
    stepIndex: 2,
    status: 'Loaded',
    etaFrom: 330, etaTo: 360,
    promised: 'by 12:30 PM',
    stopsAway: 4,
    reason: null,
    events: [
      e(-300, 0, 'Order placed online', 'WMS'),
      e(60, 1, 'Picked and packed', 'WMS'),
      e(92, 2, 'Scanned onto truck T-24 (later stop on route)', 'WMS'),
    ],
  },
]

export function findOrders(query) {
  const q = query.trim().toLowerCase().replace('#', '')
  if (!q) return []
  return ORDERS.filter(
    (o) =>
      o.id.includes(q) ||
      o.customer.toLowerCase().includes(q) ||
      o.contact.toLowerCase().includes(q),
  )
}

export function etaText(o) {
  if (o.status === 'Delivered') return `Delivered at ${clock(o.etaFrom)}`
  if (o.etaFrom >= 1440) return `Tomorrow, ${clock(o.etaFrom - 1440)} – ${clock(o.etaTo - 1440)}`
  return `${clock(o.etaFrom)} – ${clock(o.etaTo)}`
}
