import { useCallback, useEffect, useState } from 'react'
import { ago } from './util'

export const DEFAULT_HELPER_URL = 'https://beztakets-helper.testlinker007.workers.dev'

// Talks to the email helper. The helper password is typed in the profile page and
// kept only in this browser. It is never part of the website's code.
export async function helperCall(helper, path, init = {}) {
  const r = await fetch(helper.url.replace(/\/$/, '') + path, { ...init, headers: { authorization: 'Bearer ' + helper.token, 'content-type': 'application/json' } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(r.status === 401 ? 'The helper password is wrong. Check it in your profile.' : data.error || `Helper error (${r.status})`)
  return data
}

export function Inbox({ helper, goProfile, toast }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [openId, setOpenId] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const connected = helper.url && helper.token

  const load = useCallback(async () => {
    try { setRows(await helperCall(helper, '/tickets?refresh=1')); setErr('') } catch (e) { setErr(e.message) }
  }, [helper])
  useEffect(() => { if (!connected) return; load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [connected, load])

  if (!connected) return (
    <section className="panel pad"><h2>Email inbox</h2>
      <p>Connect the email helper to see tickets that arrive by email and reply to them.</p>
      <button className="btn primary" onClick={goProfile}>Connect in my profile</button></section>
  )
  const t = rows?.find((x) => x.id === openId)
  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      const updated = await helperCall(helper, `/tickets/${t.id}/reply`, { method: 'POST', body: JSON.stringify({ text }) })
      setRows((p) => p.map((x) => (x.id === updated.id ? updated : x))); setText(''); toast('Reply sent by email.')
    } catch (e) { toast(e.message) }
    setBusy(false)
  }
  return (
    <div className="split">
      <section className="panel grow">
        <div className="panel-h"><h2>Email tickets <span className="count">{rows?.length ?? 0}</span></h2><button className="btn" onClick={load}>Refresh</button></div>
        {err && <p className="empty">Could not reach the helper: {err}</p>}
        {rows && rows.length === 0 && !err && <p className="empty">No emails yet. Send a test message to the connected address and refresh in a minute.</p>}
        {!rows && !err && <p className="empty">Loading…</p>}
        <div className="table">
          {(rows || []).map((x) => (
            <button key={x.id} className={`tr inbox-row${x.id === openId ? ' sel' : ''}`} onClick={() => setOpenId(x.id)}>
              <span className="subj"><b>{x.subject}</b><small>{x.customer} · {ago(x.replies[x.replies.length - 1].at)} · {x.replies.length} message{x.replies.length > 1 ? 's' : ''}</small></span>
            </button>
          ))}
        </div>
      </section>
      {t && (
        <section className="panel pad grow">
          <h2>{t.subject}</h2><p className="mute small">From {t.customer}</p>
          {t.replies.map((r, i) => (
            <div key={i} className={`msg${r.outbound ? ' out' : ''}`}><small className="mute">{r.outbound ? 'You replied' : r.from} · {ago(r.at)}</small><p style={{ whiteSpace: 'pre-wrap' }}>{r.text}</p></div>
          ))}
          <label className="field">Reply by email<textarea rows="5" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your reply. It is sent as a real email." /></label>
          <p><button className="btn primary" disabled={busy || !text.trim()} onClick={send}>{busy ? 'Sending…' : 'Send reply by email'}</button></p>
        </section>
      )}
    </div>
  )
}
