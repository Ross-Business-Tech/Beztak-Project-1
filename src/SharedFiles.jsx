import { useEffect, useState } from 'react'
import { FILES_BUCKET, friendlyError, supabase } from './supabase'

const MAX_BYTES = 10 * 1024 * 1024
// Stored names start with a timestamp so two uploads with the same name don't clash.
const displayName = (name) => name.replace(/^\d{13}-/, '')

// Files saved in Supabase Storage: everyone signed in to the demo sees the same list.
export default function SharedFiles() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // ask Supabase for the current list of files
  const fetchList = () => supabase.storage.from(FILES_BUCKET).list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })
  const apply = ({ data, error }) => {
    if (error) setMsg(friendlyError(error))
    else setFiles((data || []).filter((f) => f.id)) // folders have no id
    setLoading(false)
  }
  const load = () => fetchList().then(apply)
  useEffect(() => {
    let alive = true
    fetchList().then((res) => { if (alive) apply(res) })
    return () => { alive = false }
  }, [])

  const upload = async (e) => {
    const picked = [...e.target.files]
    e.target.value = ''
    setBusy(true)
    for (const f of picked) {
      if (f.size > MAX_BYTES) { setMsg(`"${f.name}" is too large (limit 10 MB).`); continue }
      const safe = f.name.replace(/[^\w.\- ]+/g, '_')
      const { error } = await supabase.storage.from(FILES_BUCKET).upload(`${Date.now()}-${safe}`, f, { contentType: f.type || undefined })
      setMsg(error ? `"${f.name}" wasn't uploaded. ${friendlyError(error)}` : `Uploaded "${f.name}".`)
    }
    setBusy(false)
    load()
  }
  const download = async (f) => {
    // the files are private, so we ask Supabase for a link that works for 60 seconds
    const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(f.name, 60, { download: displayName(f.name) })
    if (error) setMsg(friendlyError(error))
    else window.open(data.signedUrl, '_blank', 'noopener')
  }
  const remove = async (f) => {
    if (!window.confirm(`Delete "${displayName(f.name)}" for everyone?`)) return
    const { error } = await supabase.storage.from(FILES_BUCKET).remove([f.name])
    setMsg(error ? friendlyError(error) : `Deleted "${displayName(f.name)}".`)
    load()
  }

  return (
    <section className="panel pad">
      <div className="row between"><h2>Shared files</h2>
        <label className={`btn primary upload${busy ? ' disabled' : ''}`}>{busy ? 'Uploading…' : 'Upload file'}<input type="file" multiple onChange={upload} disabled={busy} hidden /></label></div>
      <p className="mute">Saved in the team's Supabase storage, so everyone who signs in sees the same files. Any file type, up to 10 MB. Use sample files only.</p>
      {msg && <p className="note-line">{msg}</p>}
      <div className="table files">
        <div className="tr th"><span>Name</span><span>Added</span><span>Size</span><span /><span /></div>
        {loading && <p className="empty">Loading…</p>}
        {!loading && files.length === 0 && <p className="empty">No shared files yet.</p>}
        {files.map((f) => (
          <div key={f.id} className="tr">
            <button className="linkish" onClick={() => download(f)}>{displayName(f.name)}</button>
            <span>{new Date(f.created_at).toLocaleDateString()}</span>
            <span>{Math.max(1, Math.round((f.metadata?.size || 0) / 1024))} KB</span>
            <button className="link" onClick={() => download(f)}>Download</button>
            <button className="link" onClick={() => remove(f)}>Delete</button>
          </div>
        ))}
      </div>
    </section>
  )
}
