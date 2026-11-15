import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'
import AuthGate from './Auth.jsx'
import ChatPage from './chat/ChatPage.jsx'
import { isEmployeeAccount } from './data'

// /ask is the employee chat: open without signing in (for links, QR codes, and the bubble on other websites).
// Everything else needs a sign-in. HR people get the desk; employee logins get only the chat.
const path = location.pathname.replace(/\/+$/, '')
const embed = new URLSearchParams(location.search).has('embed')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {path === '/ask'
      ? <ChatPage embed={embed} />
      : <AuthGate>{(auth) => (isEmployeeAccount(auth.account)
        ? <ChatPage user={{ email: auth.account }} signOut={auth.signOut} />
        : <App key={auth.account} {...auth} />)}</AuthGate>}
  </StrictMode>,
)
