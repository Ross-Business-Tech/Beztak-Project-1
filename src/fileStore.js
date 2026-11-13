// Keeps uploaded PDF files in this browser (IndexedDB), because they are too big for the small
// storage the rest of the app uses. Nothing is sent anywhere. Every call is safe to ignore if the
// browser blocks storage (for example in a private window): it just rejects and the page says so.
const DB = 'hr-desk-files'
const STORE = 'pdfs'

const open = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(new Error('This browser does not allow saving files.')); return }
  const r = indexedDB.open(DB, 1)
  r.onupgradeneeded = () => r.result.createObjectStore(STORE)
  r.onsuccess = () => resolve(r.result)
  r.onerror = () => reject(r.error || new Error('This browser does not allow saving files.'))
})

async function run(mode, fn) {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req?.result)
      tx.onerror = () => reject(tx.error || new Error('The file could not be saved.'))
      tx.onabort = () => reject(tx.error || new Error('The file could not be saved (the browser may be out of space).'))
    })
  } finally { db.close() }
}

export const putFile = (id, blob) => run('readwrite', (s) => s.put(blob, String(id)))
export const getFile = (id) => run('readonly', (s) => s.get(String(id)))
export const deleteFile = (id) => run('readwrite', (s) => s.delete(String(id)))
export const clearFiles = () => run('readwrite', (s) => s.clear())
