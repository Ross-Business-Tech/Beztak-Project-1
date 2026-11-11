import { useEffect, useMemo, useRef, useState } from 'react'
import { sampleHistory, ticketsToRows } from './gapRows'

// "Manual gaps": the Manual Gap Tracker, fed live by this desk's tickets.
// The tracker itself is a separate page (public/gap-tracker) shown in a frame. We send it
// the questions and tickets the AI agent has handled, and it ranks what to fix in the HR answers.
// The tracker's sections, shown as one row of tabs here (the tracker hides its own menu).
const VIEWS = [['overview', 'Overview'], ['fixes', 'Fix list'], ['results', 'Results'], ['manual', 'Manual health'], ['reports', 'Monthly report']]

export default function GapTracker({ tickets }) {
  const frame = useRef(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState('overview')
  const [source, setSource] = useState('live')
  const sample = useMemo(() => sampleHistory(), [])
  const live = useMemo(() => ticketsToRows(tickets), [tickets])

  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return
      if (e.data?.type === 'gap-tracker:ready') setReady(true)
      if (e.data?.type === 'gap-tracker:view' && VIEWS.some(([k]) => k === e.data.view)) setView(e.data.view)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    if (!ready) return
    const msg = source === 'live'
      ? { type: 'gap-tracker:rows', rows: live, label: 'the HR desk (live)', sections: [] }
      : { type: 'gap-tracker:rows', rows: sample.rows, label: 'sample history (made up)', sections: sample.sections }
    frame.current?.contentWindow?.postMessage(msg, location.origin)
  }, [ready, source, live, sample])

  const show = (v) => {
    setView(v)
    try { frame.current.contentWindow.location.hash = v } catch { /* frame still loading */ }
  }

  return (
    <div className="gaps">
      <div className="gaps-bar">
        <div><b>Manual gaps</b><span className="mute small hide-s"> Which questions the assistant could not answer, ranked by what to fix first.</span></div>
        <div className="seg" role="group" aria-label="Data shown">
          <button className={source === 'live' ? 'on' : ''} onClick={() => setSource('live')}>Live from the desk ({live.length})</button>
          <button className={source === 'sample' ? 'on' : ''} onClick={() => setSource('sample')}>Sample history</button>
        </div>
      </div>
      <nav className="tabs gaps-tabs" role="tablist" aria-label="Manual gaps sections">
        {VIEWS.map(([k, label]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => show(k)}>{label}</button>)}
      </nav>
      <iframe ref={frame} title="Manual Gap Tracker" src={`${import.meta.env.BASE_URL}gap-tracker/index.html?embed=1#overview`} className="gaps-frame" />
    </div>
  )
}
