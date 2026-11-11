export const DEFAULT_HELPER_URL = 'https://beztakets-helper.testlinker007.workers.dev'

// Talks to the email helper. The helper password is typed in the profile page and
// kept only in this browser. It is never part of the website's code.
export async function helperCall(helper, path, init = {}) {
  const r = await fetch(helper.url.replace(/\/$/, '') + path, { ...init, headers: { authorization: 'Bearer ' + helper.token, 'content-type': 'application/json' } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(r.status === 401 ? 'The helper password is wrong. Check it in your profile.' : data.error || `Helper error (${r.status})`)
  return data
}
