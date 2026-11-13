import { useEffect, useState } from 'react'
import PdfViewer from './PdfViewer'
import { FILES_BUCKET, friendlyError, supabase } from './supabase'

const MAX_BYTES = 10 * 1024 * 1024
// Stored names start with a timestamp so two uploads with the same name don't clash.
const displayName = (name) => name.replace(/^\d{13}-/, '')
const isPdf = (name) => /\.pdf$/i.test(name)

// Files saved in Supabase Storage: everyone signed in to the demo sees the same list.
export default function SharedFiles({ onUseAsManual, busy: manualBusy }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [view, setView] = useState(null) // the PDF being read: { id, name, blob } while open

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
  // PDFs open right here, page by page (the files are private, so they are downloaded with your login).
  const openPdf = async (f) => {
    const name = displayName(f.name)
    setView({ id: f.id, name, loading: true })
    const { data, error } = await supabase.storage.from(FILES_BUCKET).download(f.name)
    setView(error || !data ? { id: f.id, name, error: friendlyError(error || new Error('The file could not be opened.')) } : { id: f.id, name, blob: data })
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
      <p className="mute">Saved in the team's Supabase storage, so everyone who signs in sees the same files. Any file type, up to 10 MB. PDFs open right here when you click their name. Use sample files only.</p>
      {msg && <p className="note-line">{msg}</p>}
      <div className="table files">
        <div className="tr th"><span>Name</span><span>Added</span><span>Size</span><span /><span /></div>
        {loading && <p className="empty">Loading…</p>}
        {!loading && files.length === 0 && <p className="empty">No shared files yet.</p>}
        {files.map((f) => (
          <div key={f.id} className="tr">
            <button className="linkish" onClick={() => (isPdf(f.name) ? openPdf(f) : download(f))}>{displayName(f.name)}</button>
            <span>{new Date(f.created_at).toLocaleDateString()}</span>
            <span>{Math.max(1, Math.round((f.metadata?.size || 0) / 1024))} KB</span>
            <button className="link" onClick={() => download(f)}>Download</button>
            <button className="link" onClick={() => { if (view?.id === f.id) setView(null); remove(f) }}>Delete</button>
          </div>
        ))}
      </div>
      {view && (
        <div className="docview">
          <div className="row between"><b>{view.name}</b><button className="link" onClick={() => setView(null)}>Close</button></div>
          {view.loading ? <p className="mute">Opening…</p> : view.error ? <p className="pdf-err">{view.error}</p> : (
            <>
              {onUseAsManual && <div className="row manual-use"><button type="button" className="btn sm" disabled={manualBusy} onClick={() => onUseAsManual(view.name, view.blob)}>Use as the assistant's manual</button></div>}
              <PdfViewer key={view.id} file={view.blob} name={view.name} />
            </>
          )}
        </div>
      )}
    </section>
  )
}
