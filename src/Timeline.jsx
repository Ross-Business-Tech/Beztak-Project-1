import { STEPS, SOURCES } from './data.js'

export default function Timeline({ order }) {
  const delayed = order.status === 'Delayed' || order.status === 'Held at warehouse'
  return (
    <div>
      <ol className="steps">
        {STEPS.map((s, i) => {
          const state = i < order.stepIndex ? 'done' : i === order.stepIndex ? (order.status === 'Delivered' ? 'done' : delayed ? 'now warn' : 'now') : 'todo'
          return (
            <li key={s} className={state}>
              <span className="bubble">{state.startsWith('done') ? '✓' : i + 1}</span>
              <span className="step-name">{s}</span>
            </li>
          )
        })}
      </ol>
      <ul className="events">
        {[...order.events].reverse().map((ev, i) => (
          <li key={i}>
            <span className="ev-time">{ev.time}</span>
            <div>
              <div>{ev.note}</div>
              <span className="source">{SOURCES[ev.source]}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
