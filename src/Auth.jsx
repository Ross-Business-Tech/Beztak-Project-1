import { useEffect, useState } from 'react'
import { friendlyError, supabase } from './supabase'

// Shows the sign-in screen until someone signs in with Supabase, then shows the app.
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still checking
  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => { if (alive) setSession(data.session ?? null) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])
  if (session === undefined) return <div className="auth-wrap"><p className="mute">Loading…</p></div>
  if (!session) return <SignIn />
  return children({ account: session.user.email, signOut: () => supabase.auth.signOut() })
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) setError(friendlyError(err))
    } catch (err) {
      setError(friendlyError(err))
    }
    setBusy(false)
  }
  return (
    <div className="auth-wrap">
      <form className="auth-card panel pad" onSubmit={submit}>
        <div className="auth-brand"><span className="auth-logo" aria-hidden="true">B</span><h1>Beztakets</h1></div>
        <p className="mute">Sign in to the HR help desk.</p>
        <label className="field">Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn primary auth-btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="mute small">Demo: use the shared team login. New accounts can't be created from this page.</p>
      </form>
    </div>
  )
}
