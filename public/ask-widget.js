/* Ask Beztak chat bubble. Add this one line to any web page (an intranet, or Paycor if it allows it):
     <script src="https://YOUR-BEZTAKETS-SITE/ask-widget.js" defer></script>
   It adds a round chat button in the bottom-right corner that opens the Ask Beztak chat (/ask) in a small window.
   Optional: data-label="Ask HR" changes the button's tooltip. Nothing is stored on the host page. */
(function () {
  if (window.__askBeztak) return
  window.__askBeztak = true
  var me = document.currentScript
  var base = (me && me.getAttribute('data-base')) || (me ? new URL(me.src, location.href).origin : location.origin)
  var label = (me && me.getAttribute('data-label')) || 'Ask Beztak'
  var css = '' +
    '.askbz-btn{position:fixed;right:calc(20px + env(safe-area-inset-right,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:60px;height:60px;border-radius:50%;border:0;background:#2b5a8c;color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(16,24,40,.28);display:grid;place-items:center}' +
    '.askbz-btn:focus-visible{outline:3px solid #2b5a8c;outline-offset:3px}' +
    '.askbz-tip{position:fixed;right:calc(90px + env(safe-area-inset-right,0px));bottom:calc(36px + env(safe-area-inset-bottom,0px));z-index:2147483000;background:#1d2430;color:#fff;font:600 13px/1 system-ui,sans-serif;padding:8px 11px;border-radius:8px;pointer-events:none}' +
    '.askbz-panel{position:fixed;right:calc(20px + env(safe-area-inset-right,0px));bottom:calc(92px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:min(390px,calc(100vw - 24px));height:min(600px,calc(100vh - 120px));border:1px solid #dde1e7;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(16,24,40,.3);background:#fff}' +
    '.askbz-panel iframe{width:100%;height:100%;border:0;display:block}' +
    '@media (max-width:480px){.askbz-panel{right:8px;left:8px;width:auto;bottom:calc(88px + env(safe-area-inset-bottom,0px));height:calc(100vh - 110px)}}'
  var style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
  var chat = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>'
  var close = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  var btn = document.createElement('button')
  btn.className = 'askbz-btn'
  btn.type = 'button'
  btn.setAttribute('aria-label', label)
  btn.setAttribute('aria-expanded', 'false')
  btn.innerHTML = chat
  var tip = document.createElement('div')
  tip.className = 'askbz-tip'
  tip.textContent = label
  var panel = null
  btn.addEventListener('click', function () {
    if (!panel) {
      panel = document.createElement('div')
      panel.className = 'askbz-panel'
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-label', label)
      var frame = document.createElement('iframe')
      frame.src = base + '/ask?embed=1'
      frame.title = label
      panel.appendChild(frame)
      document.body.appendChild(panel)
    } else panel.hidden = !panel.hidden
    var open = !panel.hidden
    btn.innerHTML = open ? close : chat
    btn.setAttribute('aria-expanded', String(open))
    tip.hidden = true
  })
  function mount() { document.body.appendChild(tip); document.body.appendChild(btn); setTimeout(function () { tip.hidden = true }, 6000) }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount)
})()
