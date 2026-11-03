import { useEffect, useState } from 'react'
import { ORDERS, TRUCKS, DEPOT } from './data.js'

const W = 1.6 // map is 1.6x wider than tall

// Each truck drifts back and forth toward its next stop so the map feels live.
function nextStop(truck) {
  const o = ORDERS.find((x) => x.truck === truck.id && x.status !== 'Delivered')
  return o ? { x: o.x, y: o.y } : { x: DEPOT.x, y: DEPOT.y }
}

export default function MapView({ selected, onSelect }) {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 1), 80)
    return () => clearInterval(id)
  }, [])

  const pos = (truck, i) => {
    const s = nextStop(truck)
    const k = 0.35 * (0.5 - 0.5 * Math.cos((t / 60 + i) % (2 * Math.PI)))
    return { x: truck.x + (s.x - truck.x) * k, y: truck.y + (s.y - truck.y) * k }
  }

  const selTruck = TRUCKS.find((tr) => tr.id === selected?.truck)
  const delayedTrucks = new Set(ORDERS.filter((o) => o.status === 'Delayed').map((o) => o.truck))

  return (
    <div className="map-wrap">
      <svg viewBox="0 0 160 100" className="map" role="img" aria-label="Map of delivery trucks">
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="#dfe6ee" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width="160" height="100" fill="#f3f1ea" />
        <rect width="160" height="100" fill="url(#grid)" />
        <g transform="scale(1.6 1)">
        {/* harbor water */}
        <path d="M0 0 H8 Q4 30 6 50 Q2 75 5 100 H0 Z" fill="#cfe3f1" />
                {/* main roads */}
        <g stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round">
          <path d="M8 52 H96" /><path d="M50 4 V96" /><path d="M14 20 Q40 30 90 18" /><path d="M14 80 Q50 66 92 78" />
        </g>
        <g stroke="#d5dbe3" strokeWidth="0.4" fill="none">
          <path d="M8 52 H96" /><path d="M50 4 V96" /><path d="M14 20 Q40 30 90 18" /><path d="M14 80 Q50 66 92 78" />
        </g>
        </g>
        <text x="2" y="96" fontSize="2.6" fill="#5b88a8">Harbor</text>
        {/* bridge closure near Route 9 */}
        <g transform="translate(48 25)">
          <rect x="-3.2" y="-1.6" width="6.4" height="3.2" rx="0.6" fill="#c2410c" />
          <text x="0" y="0.9" fontSize="2" textAnchor="middle" fill="#fff" fontWeight="700">CLOSED</text>
        </g>
        <text x="48" y="30" fontSize="2" textAnchor="middle" fill="#c2410c">Rt 9 bridge</text>

        {/* route line for selected order */}
        {selected && selTruck && (
          <line x1={pos(selTruck, TRUCKS.indexOf(selTruck)).x * W} y1={pos(selTruck, TRUCKS.indexOf(selTruck)).y}
            x2={selected.x * W} y2={selected.y} stroke={selTruck.color} strokeWidth="0.7" strokeDasharray="1.5 1" />
        )}

        {/* depot */}
        <g transform={`translate(${DEPOT.x * W} ${DEPOT.y})`}>
          <rect x="-3.5" y="-3" width="7" height="6" rx="1" fill="#12355b" />
          <text y="1.3" fontSize="3.4" textAnchor="middle">🏭</text>
          <text y="6.5" fontSize="2.2" textAnchor="middle" fill="#12355b" fontWeight="600">Warehouse</text>
        </g>

        {/* order pins */}
        {ORDERS.map((o) => {
          const sel = o.id === selected?.id
          const color = o.status === 'Delivered' ? '#3a7d44' : o.status === 'Delayed' || o.status === 'Held at warehouse' ? '#c2410c' : '#2e86ab'
          return (
            <g key={o.id} transform={`translate(${o.x * W} ${o.y})`} onClick={() => onSelect(o.id)} className="pin">
              {sel && <circle r="4" fill={color} opacity="0.25" className="pulse" />}
              <path d="M0 0 C-2 -2.5 -2 -5 0 -5 C2 -5 2 -2.5 0 0Z" fill={color} stroke="#fff" strokeWidth="0.4"
                transform={sel ? 'scale(1.5)' : ''} />
              <text y={sel ? 4 : 3} fontSize={sel ? 2.6 : 2} textAnchor="middle" fill="#1d2433" fontWeight={sel ? 700 : 400}>#{o.id}</text>
            </g>
          )
        })}

        {/* trucks */}
        {TRUCKS.map((tr, i) => {
          const p = pos(tr, i)
          const sel = tr.id === selTruck?.id
          return (
            <g key={tr.id} transform={`translate(${p.x * W} ${p.y})`}>
              {delayedTrucks.has(tr.id) && <circle r="3.6" fill="none" stroke="#c2410c" strokeWidth="0.5" className="pulse" />}
              <circle r={sel ? 3 : 2.3} fill={tr.color} stroke="#fff" strokeWidth="0.5" />
              <text y="0.9" fontSize={sel ? 2.8 : 2.2} textAnchor="middle">🚚</text>
              <text y={sel ? -4 : -3.2} fontSize="1.9" textAnchor="middle" fill={tr.color} fontWeight="700">{tr.id}</text>
            </g>
          )
        })}
      </svg>
      <div className="legend">
        <span><i style={{ background: '#2e86ab' }} />On the way</span>
        <span><i style={{ background: '#c2410c' }} />Delayed / held</span>
        <span><i style={{ background: '#3a7d44' }} />Delivered</span>
        <span>🚚 Live truck (driver app GPS)</span>
      </div>
    </div>
  )
}
