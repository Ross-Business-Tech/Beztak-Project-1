import { useState } from 'react'
import Chat from './Chat'

// The chat bubble inside the HR and Ops desk: the same Ask Beztak chat employees use (it saves each chat as a ticket and
// can submit it to a person). The one extra here: "Use in reply" drops an answer into the reply box of the ticket that is open.
export default function ChatBubble({ user, onUseInReply }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {open && (
        <section className="bubble-panel" role="dialog" aria-label="Ask Beztak">
          <div className="bubble-head"><div><b>Ask Beztak</b><small>The same chat employees use</small></div><button onClick={() => setOpen(false)} aria-label="Close chat">✕</button></div>
          <Chat user={user} compact onUseInReply={onUseInReply} />
        </section>
      )}
      <button className="bubble-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close chat' : 'Ask Beztak'} aria-expanded={open}>
        {open
          ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>}
      </button>
    </>
  )
}
