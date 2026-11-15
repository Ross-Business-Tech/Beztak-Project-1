// The team's shared list of answers HR approved or corrected, stored in here.now Site Data
// (declared in public/.herenow/data.json). It only works on the team's dev site and the public
// site. On test links and in local testing every call fails, and the app keeps the list in
// this browser instead.
const URL_BASE = './.herenow/data/learned_answers'
const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '')

// Records come from other visitors, so only known fields of the right type are kept.
const fromRecord = (r) => ({
  id: str(r?.id, 40), ticket: Number.isInteger(r?.data?.ticket) ? r.data.ticket : 0, subject: str(r?.data?.subject, 200),
  keywords: str(r?.data?.keywords, 2000), template: str(r?.data?.template, 4000), edited: r?.data?.edited === true,
  by: str(r?.data?.by, 40), at: str(r?.data?.at, 40) || str(r?.createdAt, 40), shared: true,
})

// All shared answers, newest first, or null when shared storage isn't available here.
export async function loadShared() {
  try {
    const out = []
    let cursor = ''
    for (let page = 0; page < 10; page++) {
      const res = await fetch(`${URL_BASE}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: { accept: 'application/json' } })
      if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null
      const body = await res.json()
      if (!Array.isArray(body?.records)) return null
      out.push(...body.records.map(fromRecord).filter((l) => l.id && l.keywords && l.template))
      if (!body.nextCursor) break
      cursor = body.nextCursor
    }
    return out.sort((a, b) => (b.at > a.at ? 1 : -1))
  } catch { return null }
}

// Saves one answer for the whole team. Returns the saved entry, or null if it could not be saved.
export async function saveShared(l) {
  try {
    const res = await fetch(URL_BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': l.id },
      body: JSON.stringify({ ticket: l.ticket, subject: l.subject.slice(0, 200), keywords: l.keywords.slice(0, 2000), template: l.template.slice(0, 4000), edited: l.edited, by: l.by, at: l.at }),
    })
    if (!res.ok) return null
    const { record } = await res.json()
    return record ? fromRecord(record) : null
  } catch { return null }
}

export async function deleteShared(id) {
  try { return (await fetch(`${URL_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })).ok } catch { return false }
}
