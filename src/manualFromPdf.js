import { loadPdfLib } from './pdfLib'

// Turns a PDF into the sections the assistant reads as its Operations Manual.
//   readPdfPages(file)           -> the text of every page, line by line, with each line's text size
//   manualFromPages(pages, name) -> { title, version, name, pages, sections: [{ title, items: [{ q, a }] }] }
// Nothing here is sent anywhere: the Documents page sends the result to the email helper only when someone clicks the button.

// ---- reading the text ----
function linesOf(items) {
  const lines = []
  let cur = null
  for (const it of items) {
    if (typeof it.str !== 'string') continue
    const size = Math.hypot(it.transform[0], it.transform[1]) || it.height || 0
    const x = it.transform[4]
    const y = it.transform[5]
    if (!cur || Math.abs(y - cur.y) > Math.max(2, cur.size * 0.5)) { cur = { y, size, x0: x, endX: x, parts: [] }; lines.push(cur) }
    if (cur.parts.length && x - cur.endX > size * 0.15 && !/^\s/.test(it.str) && !/\s$/.test(cur.parts[cur.parts.length - 1])) cur.parts.push(' ')
    cur.parts.push(it.str)
    cur.endX = x + (it.width || 0)
    cur.size = Math.max(cur.size, size)
    if (it.hasEOL) cur = null
  }
  return lines.map((l, i) => ({ text: l.parts.join('').replace(/\s+/g, ' ').trim(), size: Math.round(l.size * 10) / 10, gap: i ? Math.abs(lines[i - 1].y - l.y) : 0, x0: l.x0, w: l.endX - l.x0 })).filter((l) => l.text)
}

export async function readPdfPages(blob, onProgress) {
  const pdfjs = await loadPdfLib()
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, enableXfa: false })
  const doc = await task.promise
  const pages = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress?.(n, doc.numPages)
      const page = await doc.getPage(n)
      pages.push({ page: n, lines: linesOf((await page.getTextContent()).items) })
      page.cleanup()
    }
  } finally { await task.destroy() }
  return pages
}

// ---- turning pages into sections ----
const BULLET = /^([•·▪‣◦●■□–-]|\d{1,2}[.)])\s+\S/
const norm = (t) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

// Lines that repeat at the very top or bottom of many pages (running headers, footers, page numbers) are not part of the manual.
// Only the first two and last two lines of a page count, so a repeated line in the middle of the text is never thrown away.
function dropRunningLines(pages) {
  if (pages.length < 4) return pages
  const edge = (p, i) => i < 2 || i >= p.lines.length - 2
  const seen = new Map()
  for (const p of pages) for (const k of new Set(p.lines.filter((l, i) => edge(p, i)).map((l) => norm(l.text)))) seen.set(k, (seen.get(k) || 0) + 1)
  const repeated = (k) => k.length <= 140 && seen.get(k) / pages.length >= 0.4
  // After removing a header, the first line left was measured against it: it is a fresh start on the page, so its gap is unknown (0).
  return pages.map((p) => ({ ...p, lines: p.lines.filter((l, i) => !(edge(p, i) && repeated(norm(l.text)))).map((l, i) => (i === 0 ? { ...l, gap: 0 } : l)) }))
}

function bodySize(pages) {
  const weight = new Map()
  for (const p of pages) for (const l of p.lines) weight.set(l.size, (weight.get(l.size) || 0) + l.text.length)
  let best = 0, size = 0
  for (const [s, w] of weight) if (w > best) { best = w; size = s }
  return size || 1
}

const NUMBERED = /^((\d+(\.\d+)*[.)]?)|([IVX]+\.)|(section|chapter|part|article)\s+\d+)\s+\S/i
const isCaps = (t) => /[A-Z]{3}/.test(t) && t === t.toUpperCase()

export function manualFromPages(pagesIn, name = 'Uploaded manual.pdf', { maxChunk = 1100 } = {}) {
  const pages = dropRunningLines(pagesIn)
  const total = pages.reduce((n, p) => n + p.lines.reduce((m, l) => m + l.text.length, 0), 0)
  if (total < 200) throw new Error('This PDF has almost no readable text. It may be a scan or a picture of a document, which the assistant cannot read yet.')
  const body = bodySize(pages)

  // Headings: bigger text than the body. If the whole document uses one text size, fall back to numbered or CAPITAL lines.
  const bigger = (l) => l.size >= body * 1.15 && l.text.length <= 120 && !/[,;]$/.test(l.text)
  const sizeHeadings = pages.flatMap((p) => p.lines).filter(bigger)
  const useSize = new Set(sizeHeadings.map((l) => l.size)).size >= 1 && sizeHeadings.length >= 2
  const headingSizes = [...new Set(sizeHeadings.map((l) => l.size))].sort((a, b) => b - a)
  const levelOf = (l, prev) => {
    if (useSize) return bigger(l) ? headingSizes.indexOf(l.size) + 1 : 0
    const short = l.text.length <= 80 && !/[.,;:]$/.test(l.text)
    if (short && (NUMBERED.test(l.text) || isCaps(l.text)) && (!prev || l.gap > l.size * 1.5)) return 1
    return 0
  }

  const sections = []
  let sec = null
  const open = (title) => { sec = { title, blocks: [], page: 1 }; sections.push(sec) }
  let para = null
  const flushPara = () => { if (para && para.text.trim()) sec.blocks.push({ type: 'p', text: para.text.trim(), page: para.page }); para = null }
  let lastHeading = null // the heading line just seen, so a heading that wraps onto two lines stays one heading

  for (const p of pages) {
    let prev = null
    // The left margin of the body text, and how wide a full line is: list items are indented and end early.
    const bodyLines = p.lines.filter((l) => l.text.length >= 30 && l.size < body * 1.15)
    const margin = bodyLines.length ? Math.min(...bodyLines.map((l) => l.x0)) : 0
    const fullW = Math.max(1, ...p.lines.map((l) => l.w || 0))
    // The normal distance between two lines of body text on this page. A paragraph break is a clearly bigger gap than that.
    const gaps = p.lines.filter((l) => l.gap > 0 && l.size < body * 1.15).map((l) => l.gap).sort((a, b) => a - b)
    const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : body * 1.25
    for (const l of p.lines) {
      const pageStart = l === p.lines[0]
      const level = levelOf(l, prev)
      const wrapped = lastHeading && lastHeading.page === p.page && lastHeading.level === level && l.gap < l.size * 1.6
      if (level) {
        if (wrapped) { // same heading continues on the next line
          if (lastHeading.level === 1) sec.title = `${sec.title} ${l.text}`.trim()
          else { const b = sec.blocks[sec.blocks.length - 1]; if (b?.type === 'sub') b.text = `${b.text} ${l.text}` }
        } else if (level === 1 || !sec) {
          flushPara(); open(l.text); sec.page = p.page
        } else { flushPara(); sec.blocks.push({ type: 'sub', text: l.text, page: p.page }) }
        lastHeading = { page: p.page, level }
        prev = l
        continue
      }
      lastHeading = null
      if (!sec) { open('Introduction'); sec.page = p.page }
      const indented = (l.x0 ?? margin) > margin + l.size * 1.6
      // The previous line ended early AND this line starts a new sentence or item: something new starts here. (A line that is
      // short only because the next word was long, for example at the bottom of a page, is not the end of a paragraph.)
      const prevShort = para && para.w < fullW * 0.6 && /^[A-Z0-9•\-–("“[]/.test(l.text)
      const marked = BULLET.test(l.text)
      const newPara = !para || l.gap > typical * 1.55 || marked || indented !== para.indented
        || (indented && prevShort) || (prevShort && /[.!?:]$/.test(para.last)) || (/[.!?:]$/.test(para.last) && l.gap > typical * 1.15)
        || (pageStart && /[.!?]$/.test(para.last) && /^[A-Z0-9•]/.test(l.text))
      if (newPara) {
        flushPara()
        para = { text: marked ? `• ${l.text.replace(BULLET, (m) => m.replace(/^\S+\s+/, ''))}` : indented ? `• ${l.text}` : l.text, page: p.page, last: l.text, indented, w: l.w || 0 }
      } else { para.text = /\S-$/.test(para.text) && /^[a-z]/.test(l.text) ? para.text.slice(0, -1) + l.text : `${para.text} ${l.text}`; para.last = l.text; para.w = l.w || 0 }
      prev = l
    }
  }
  if (sec) flushPara()

  // No headings found at all: one section per few pages, so the assistant can still point to where an answer came from.
  let result = sections.filter((s) => s.blocks.length)
  if (result.length < 2 && pages.length > 3) {
    result = []
    for (let i = 0; i < pages.length; i += 4) {
      const group = pages.slice(i, i + 4)
      const text = group.flatMap((p) => p.lines.map((l) => l.text)).join(' ')
      result.push({ title: group.length > 1 ? `Pages ${group[0].page} to ${group[group.length - 1].page}` : `Page ${group[0].page}`, page: group[0].page, blocks: [{ type: 'p', text, page: group[0].page }] })
    }
  }

  // Split each section into pieces of about maxChunk characters, at paragraph (or sentence) boundaries.
  const pieces = (text) => {
    if (text.length <= maxChunk * 1.4) return [text]
    const out = []
    let cur = ''
    for (const s of text.split(/(?<=[.!?])\s+/)) {
      if (cur && cur.length + s.length > maxChunk) { out.push(cur); cur = s } else cur = cur ? `${cur} ${s}` : s
    }
    if (cur) out.push(cur)
    return out
  }
  const outSections = result.map((s) => {
    const items = []
    let sub = ''
    let part = 0
    let chunk = null
    const flush = () => {
      if (chunk?.text.trim()) { items.push({ q: `${s.title}${sub ? `: ${sub}` : ''}${part > 1 ? ' (continued)' : ''} (page ${chunk.page})`, a: chunk.text.trim() }) }
      chunk = null
    }
    for (const b of s.blocks) {
      if (b.type === 'sub') { flush(); sub = b.text; part = 0; continue }
      for (const piece of pieces(b.text)) {
        if (chunk && chunk.text.length + piece.length > maxChunk) { flush() }
        if (!chunk) { part += 1; chunk = { text: '', page: b.page } }
        chunk.text += `${chunk.text ? '\n' : ''}${piece}`
      }
    }
    flush()
    return { title: s.title.slice(0, 200), items }
  }).filter((s) => s.items.length)
  if (!outSections.length) throw new Error('No sections could be read from this PDF.')

  const title = name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Uploaded manual'
  return { title, version: `${pagesIn.length} pages, read from the PDF`, name, pages: pagesIn.length, sections: outSections }
}
