import { useEffect, useState } from 'react'
import { LANES, runAll } from './evals'
import { agentName } from './util'

// Shows every guardrail promise and runs it live against the real AI agent rules.
export default function Guardrails() {
  const [results, setResults] = useState(null)
  const [open, setOpen] = useState(null)
  const run = () => { setResults(null); runAll().then(setResults) }
  useEffect(() => { runAll().then(setResults) }, [])
  const failed = results ? results.filter((r) => !r.pass).length : 0
  const words = results ? results.flatMap((r) => r.wordings) : []
  return (
    <>
      <section className="panel pad">
        <div className="row between">
          <h2>Guardrails <span className="nl gray">Project team only</span></h2>
          <button className="btn" onClick={run}>Run checks again</button>
        </div>
        <p>These are the promises the AI assistant makes. AI can make things up, so it may only answer when the HR answers or the Operations Manual say exactly what to reply. Everything else goes to a person. People ask the same thing in different words, so most promises are tested with several wordings, and every wording must pass. All of them run against the real assistant every time this page opens.</p>
        {results
          ? <p className={`gr-sum ${failed ? 'bad' : 'ok'}`}>{failed ? `${failed} of ${results.length} promises broken. Fix the assistant before sharing.` : `All ${results.length} promises pass, tested with ${words.length} different wordings.`}</p>
          : <p className="mute">Running checks…</p>}
      </section>
      {LANES.map((lane) => {
        const rows = (results || []).filter((r) => r.lane === lane.id)
        return (
          <section key={lane.id} className="panel pad gr-lane">
            <h3>{lane.title}</h3>
            <p className="mute small">{lane.blurb}</p>
            {rows.map((r) => (
              <div key={r.id} className="gr-case">
                <button className="gr-head" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                  <span className={`badge ${r.pass ? 'pass' : 'red'}`}>{r.pass ? 'Pass' : 'Fail'}</span>
                  <span className="gr-q"><b>“{r.body}”</b><small>{r.id} · {r.tests}{r.wordings.length > 1 ? ` · ${r.wordings.filter((w) => w.pass).length}/${r.wordings.length} wordings pass` : ''}</small></span>
                </button>
                {open === r.id && (
                  <div className="gr-body">
                    {r.ai && <p className="small"><b>Pretend AI answer:</b> {r.ai.answer || '(the AI said it could not answer)'}</p>}
                    <p className="small"><b>{r.res.resolved ? 'Answered by the AI' : `Handed to ${agentName(r.res.assignee)}`}</b>{r.res.urgent ? ' · urgent' : ''}{(r.res.tags || []).length ? ` · ${r.res.tags.join(', ')}` : ''}</p>
                    <p className="small mute">{r.res.note}</p>
                    <p className="gr-reply">{r.reply}</p>
                    {r.res.draft && <p className="small"><b>Suggested reply for HR ({r.res.draft.refs.join(', ')}):</b> {r.res.draft.text}</p>}
                    {r.problems.map((p) => <p key={p} className="small gr-prob">✖ {p}</p>)}
                    {r.wordings.length > 1 && (
                      <>
                        <p className="small"><b>Same question, other wordings</b></p>
                        <ul className="gr-words">
                          {r.wordings.map((w) => (
                            <li key={w.body}><span className={w.pass ? 'ok' : 'bad'}>{w.pass ? '✔' : '✖'}</span> “{w.body}”<small> → {w.res.resolved ? 'answered by the AI' : `handed to ${agentName(w.res.assignee)}`}</small>
                              {w.problems.map((p) => <small key={p} className="gr-prob"> · {p}</small>)}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        )
      })}
    </>
  )
}
