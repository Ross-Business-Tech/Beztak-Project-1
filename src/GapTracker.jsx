import { useEffect, useMemo, useRef, useState } from 'react'
import { sampleHistory, ticketsToRows } from './gapRows'

// "Manual gaps": the Manual Gap Tracker, fed live by this desk's tickets.
// The tracker is a separate page (public/gap-tracker) shown seamlessly in this page: it has no frame,
// header or sidebar of its own, it uses this app's colours, and its tabs are the tabs below.
const VIEWS = [['overview', 'Overview'], ['fixes', 'Fix list'], ['results', 'Results'], ['manual', 'Manual health'], ['reports', 'Monthly report']]
const TOKENS = { '--bg': '--bg', '--surface': '--surface', '--surface-2': '--soft', '--line': '--line', '--ink': '--ink', '--ink-3': '--mute', '--accent': '--prim', '--brand': '--prim' }

const themeMessage = () => {
  const cs = getComputedStyle(document.documentElement)
  const vars = {}
  for (const [to, from] of Object.entries(TOKENS)) vars[to] = cs.getPropertyValue(from).trim()
  const bg = vars['--bg'].replace('#', '')
  const lum = bg.length === 6 ? (parseInt(bg.slice(0, 2), 16) * 299 + parseInt(bg.slice(2, 4), 16) * 587 + parseInt(bg.slice(4, 6), 16) * 114) / 1000 : 255
  return { type: 'gap-tracker:theme', vars, scheme: lum < 128 ? 'dark' : 'light' }
}

export default function GapTracker({ tickets, theme, manualAt }) {
  const frame = useRef(null)
  const [ready, setReady] = useState(false)
  const [source, setSource] = useState('live')
  const [st, setSt] = useState({ view: 'overview', has: false, fixes: 0, due: false })
  const sample = useMemo(() => sampleHistory(), [])
  const live = useMemo(() => ticketsToRows(tickets), [tickets, manualAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const send = (m) => frame.current?.contentWindow?.postMessage(m, location.origin)

  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return
      if (e.data?.type === 'gap-tracker:ready') setReady(true)
      if (e.data?.type === 'gap-tracker:state') setSt(e.data)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // Colours: send once ready, and again whenever the appearance setting changes.
  useEffect(() => { if (ready) send(themeMessage()) }, [ready, theme])

  useEffect(() => {
    if (!ready) return
    send(source === 'live'
      ? { type: 'gap-tracker:rows', rows: live, label: 'the HR desk (live)', sections: [] }
      : { type: 'gap-tracker:rows', rows: sample.rows, label: 'sample history (made up)', sections: sample.sections })
  }, [ready, source, live, sample])

  const pick = (v) => { setSt((s) => ({ ...s, view: v })); send({ type: 'gap-tracker:view', view: v }) }

  return (
    <div className="gaps">
      <div className="gaps-top">
        <div className="tabs bigtabs" role="tablist">
          {VIEWS.map(([k, n]) => (
            <button key={k} role="tab" aria-selected={st.view === k} disabled={!st.has} className={st.view === k ? 'on' : ''} onClick={() => pick(k)}>
              {n}{k === 'fixes' && st.fixes > 0 && <em>{st.fixes}</em>}{k === 'reports' && st.due && <em title="An update is due">!</em>}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Data shown">
          <button className={source === 'live' ? 'on' : ''} onClick={() => setSource('live')}>Live from the desk ({live.length})</button>
          <button className={source === 'sample' ? 'on' : ''} onClick={() => setSource('sample')}>Sample history</button>
        </div>
      </div>
      <iframe ref={frame} title="Manual gaps" src={`${import.meta.env.BASE_URL}gap-tracker/index.html?embed=1`} className="gaps-frame" />
    </div>
  )
}
