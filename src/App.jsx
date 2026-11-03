import { useState } from 'react'
import './App.css'
import { ORDERS, TRUCKS, SOURCES, findOrders, etaText } from './data.js'
import MapView from './MapView.jsx'
import Timeline from './Timeline.jsx'

const statusClass = (s) =>
  s === 'Delivered' ? 'ok' : s === 'On time' || s === 'Loaded' ? 'good' : 'warn'

function OrderCard({ order }) {
  const truck = TRUCKS.find((t) => t.id === order.truck)
  const last = order.events[order.events.length - 1]
  return (
    <section className="card order-card">
      <div className="order-head">
        <div>
          <div className="muted">Order #{order.id}</div>
          <h2>{order.customer}</h2>
          <div className="muted">{order.address} · {order.items}</div>
        </div>
        <span className={`pill ${statusClass(order.status)}`}>{order.status}</span>
      </div>

      <div className="facts">
        <div><span className="label">Expected</span><strong>{etaText(order)}</strong></div>
        <div><span className="label">Promised</span><strong>{order.promised}</strong></div>
        <div><span className="label">Truck</span><strong>{truck ? `${truck.id} · ${truck.driver}` : 'Not on a truck yet'}</strong></div>
        <div><span className="label">Stops away</span><strong>{order.stopsAway ?? '—'}</strong></div>
      </div>

      {order.reason && (
        <div className="reason">
          <strong>Why:</strong> {order.reason}
        </div>
      )}

      <div className="latest">
        <span className="label">Latest update · {last.time}</span>
        <p>{last.note}</p>
        <span className="source">Source: {SOURCES[last.source]}</span>
      </div>

      <div className="script">
        <span className="label">What to tell the customer</span>
        <p>{customerScript(order)}</p>
      </div>
    </section>
  )
}

export function customerScript(o) {
  if (o.status === 'Delivered') return `Good news, your order was delivered at ${etaText(o).replace('Delivered at ', '')}. ${o.deliveredTo}.`
  if (o.status === 'Held at warehouse') return `Part of your order was out of stock, so it's being held. ${o.reason} Expected: ${etaText(o)}.`
  if (o.status === 'Delayed') return `Your order is on its way, ${o.stopsAway} stops out, but running late: ${o.reason.toLowerCase()} New arrival window: ${etaText(o)}.`
  return `Your order is ${o.status === 'Loaded' ? 'loaded on the truck' : 'on its way'}${o.stopsAway ? `, ${o.stopsAway} stop${o.stopsAway > 1 ? 's' : ''} away` : ''}. Expected ${etaText(o)}.`
}

export default function App() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('1042')
  const results = query ? findOrders(query) : ORDERS
  const selected = ORDERS.find((o) => o.id === selectedId)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚓🍇</span>
          <div>
            <strong>Harbor &amp; Vine</strong>
            <span>Order Tracker · Rep Console</span>
          </div>
        </div>
        <div className="today">Today 10:30 AM · 1,800 deliveries · 300 drivers</div>
      </header>

      <main className="layout">
        <aside className="card sidebar">
          <label className="label" htmlFor="search">Find an order</label>
          <input
            id="search"
            type="search"
            placeholder="Order # or name, e.g. 1042"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
          <ul className="results">
            {results.length === 0 && <li className="muted">No orders match “{query}”.</li>}
            {results.map((o) => (
              <li key={o.id}>
                <button
                  className={o.id === selectedId ? 'result active' : 'result'}
                  onClick={() => setSelectedId(o.id)}
                >
                  <span>
                    <strong>#{o.id}</strong> {o.customer}
                  </span>
                  <span className={`dot ${statusClass(o.status)}`}>{o.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="main">
          <section className="card">
            <div className="section-head">
              <h3>Live delivery map</h3>
              <span className="muted">Tap a pin to open that order</span>
            </div>
            <MapView selected={selected} onSelect={setSelectedId} />
          </section>
          {selected && <OrderCard order={selected} />}
          {selected && (
            <section className="card">
              <div className="section-head">
                <h3>Order journey · #{selected.id}</h3>
                <span className="muted">Every update, with where it came from</span>
              </div>
              <Timeline order={selected} />
            </section>
          )}
        </div>
      </main>
      <footer className="foot">Demo with made-up sample data · Harbor &amp; Vine Distribution (fictional client)</footer>
    </div>
  )
}
