import Chat from './Chat'

// "Ask Beztak": the full chat page. Open to any employee at /ask (no sign-in), shown to employee logins after
// sign-in, and loaded inside the chat bubble on other websites (/ask?embed=1).
export default function ChatPage({ user, signOut, embed = false }) {
  return (
    <div className={`ask-page${embed ? ' embed' : ''}`}>
      <header className="ask-head">
        <div className="who"><span className="ask-logo" aria-hidden="true">B</span><div><h1>Ask Beztak</h1><p>Answers from the Operations Manual (a sample made up for the demo)</p></div></div>
        {signOut && <button className="btn" onClick={signOut}>Sign out</button>}
      </header>
      <main className="ask-body"><Chat user={user} compact={embed} /></main>
      <p className="ask-foot">An automated assistant. It never answers personal, pay or approval questions; those go to a person. Don't share passwords, ID or bank numbers.</p>
    </div>
  )
}
