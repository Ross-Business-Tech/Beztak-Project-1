import { useEffect, useMemo, useRef, useState } from 'react'
import { loadPdfLib } from './pdfLib'

// Shows a PDF page by page inside the app. Many phones cannot show a PDF inside a web page directly,
// so each page is drawn here instead. The PDF library is only downloaded when someone opens a PDF.

// One page. It is only drawn when it is close to the screen, so a 50-page document opens quickly.
function Page({ doc, num, width, aspect }) {
  const wrap = useRef(null)
  const canvas = useRef(null)
  const [near, setNear] = useState(false)
  const [ratio, setRatio] = useState(aspect)

  useEffect(() => {
    const el = wrap.current
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return undefined }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true) }, { rootMargin: '900px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!near || !width) return undefined
    let task
    let dead = false
    ;(async () => {
      try {
        const page = await doc.getPage(num)
        const base = page.getViewport({ scale: 1 })
        const scale = width / base.width
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const vp = page.getViewport({ scale: scale * dpr })
        const c = canvas.current
        if (!c || dead) return
        c.width = Math.floor(vp.width)
        c.height = Math.floor(vp.height)
        c.style.width = `${Math.floor(width)}px`
        c.style.height = `${Math.floor(base.height * scale)}px`
        setRatio(base.height / base.width)
        task = page.render({ canvasContext: c.getContext('2d'), canvas: c, viewport: vp })
        await task.promise
      } catch (e) { if (e?.name !== 'RenderingCancelledException') console.warn('PDF page failed', num, e) }
    })()
    return () => { dead = true; task?.cancel() }
  }, [near, width, doc, num])

  return <div ref={wrap} className="pdf-page" style={{ width, height: Math.floor(width * ratio) }}><canvas ref={canvas} role="img" aria-label={`Page ${num}`} /></div>
}

// Pass either `file` (a File or Blob kept in this browser) or `url` (a PDF that comes with the site).
export default function PdfViewer({ file, url, name }) {
  const [doc, setDoc] = useState(null)
  const [err, setErr] = useState('')
  const [zoom, setZoom] = useState(1)
  const [boxW, setBoxW] = useState(0)
  const [aspect, setAspect] = useState(1.3)
  const box = useRef(null)
  const link = useMemo(() => (file ? URL.createObjectURL(file) : url), [file, url])
  useEffect(() => () => { if (file && link) URL.revokeObjectURL(link) }, [file, link])

  useEffect(() => {
    let dead = false
    let task
    ;(async () => {
      try {
        const pdfjs = await loadPdfLib()
        let bytes
        if (file) bytes = new Uint8Array(await file.arrayBuffer())
        else {
          const r = await fetch(url)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          bytes = new Uint8Array(await r.arrayBuffer())
        }
        // isEvalSupported off: a PDF is never allowed to run code in the page.
        task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, enableXfa: false })
        const d = await task.promise
        if (dead) { task.destroy(); return }
        const first = await d.getPage(1)
        const v = first.getViewport({ scale: 1 })
        setAspect(v.height / v.width)
        setDoc(d)
      } catch (e) {
        if (!dead) setErr(e?.name === 'PasswordException' ? 'This PDF is password protected, so it cannot be shown here.' : 'This PDF could not be opened. It may be damaged. You can still try downloading it.')
      }
    })()
    return () => { dead = true; task?.destroy() }
  }, [file, url])

  useEffect(() => {
    const el = box.current
    if (!el) return undefined
    const measure = () => setBoxW(Math.max(0, Math.floor(el.clientWidth) - 16))
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const width = Math.floor(Math.max(160, boxW) * zoom)
  const zoomBy = (d) => setZoom((z) => Math.min(3, Math.max(1, Math.round((z + d) * 100) / 100)))
  return (
    <div className="pdfview">
      <div className="pdf-bar">
        <span className="mute small">{err ? 'Not shown' : doc ? `${doc.numPages} page${doc.numPages === 1 ? '' : 's'}` : 'Opening…'}</span>
        <div className="row pdf-tools">
          <button type="button" className="btn sm" onClick={() => zoomBy(-0.25)} disabled={zoom <= 1} aria-label="Zoom out">−</button>
          <span className="small pdf-zoom">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn sm" onClick={() => zoomBy(0.25)} disabled={zoom >= 3} aria-label="Zoom in">+</button>
          {link && <a className="btn sm" href={link} target="_blank" rel="noopener noreferrer">Open in new tab</a>}
          {link && <a className="btn sm" href={link} download={name}>Download</a>}
        </div>
      </div>
      <div ref={box} className="pdf-pages">
        {err && <p className="pdf-err">{err}</p>}
        {!err && doc && boxW > 0 && Array.from({ length: doc.numPages }, (_, i) => <Page key={i + 1} doc={doc} num={i + 1} width={width} aspect={aspect} />)}
      </div>
    </div>
  )
}
