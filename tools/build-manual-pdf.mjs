// Makes public/docs/beztak-operations-manual.pdf: a readable PDF copy of the manual text the assistant answers from
// (src/data/beztakManual.js), so the Documents page has a real PDF to open.
// Run:  npm run build:manual-pdf      (needs Playwright with a Chromium browser; set CHROMIUM_PATH if it is not found)
import { mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { MANUAL, SECTIONS } from '../src/data/beztakManual.js'

const require = createRequire(import.meta.url)
let playwright
try { playwright = require('playwright') } catch { playwright = require('/opt/node22/lib/node_modules/playwright') }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Lines starting with "• " become a bullet list; other lines become paragraphs.
function answerHtml(text) {
  const out = []
  let list = []
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`); list = [] } }
  for (const line of String(text).split('\n')) {
    if (/^\s*•\s?/.test(line)) list.push(line.replace(/^\s*•\s?/, ''))
    else if (line.trim()) { flush(); out.push(`<p>${esc(line.trim())}</p>`) }
  }
  flush()
  return out.join('')
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(MANUAL.title)} (${esc(MANUAL.version)})</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;font-size:11.5pt;line-height:1.45}
  .cover{height:8.5in;display:flex;flex-direction:column;justify-content:center;page-break-after:always}
  .cover h1{font-size:30pt;margin:0 0 8pt}.cover .sub{font-size:14pt;color:#444;margin:0 0 20pt}
  .cover .note{font-size:10.5pt;color:#555;border-top:1px solid #bbb;padding-top:10pt;max-width:5.5in}
  h2{font-size:18pt;border-bottom:2px solid #333;padding-bottom:3pt;margin:26pt 0 10pt;page-break-after:avoid}
  h3{font-size:12pt;margin:14pt 0 4pt;page-break-after:avoid}
  h3 .ref{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#555;background:#eee;border-radius:3pt;padding:1pt 5pt;margin-right:6pt}
  p{margin:0 0 6pt}ul{margin:0 0 6pt 16pt;padding:0}li{margin:0 0 3pt}
  .entry{page-break-inside:avoid}
  .toc li{list-style:none;margin:0 0 3pt}.toc{margin:0;padding:0}
</style></head><body>
<div class="cover"><h1>${esc(MANUAL.title)}</h1><p class="sub">${esc(MANUAL.version)} · effective ${esc(MANUAL.effective)}<br>${esc(MANUAL.owner)}</p>
<p class="note">This is a text copy of the manual in the question-and-answer form the Beztakets assistant answers from, made so it can be read in the app. Links to internal systems, the office address and phone number, and "click here" instruction links are left out on purpose. The original manual is the version to follow if anything differs.</p></div>
<h2 style="margin-top:0">Contents</h2><ul class="toc">${SECTIONS.map((s) => `<li>${s.n}. ${esc(s.title)} (${s.items.length})</li>`).join('')}</ul>
${SECTIONS.map((s) => `<h2>${s.n}. ${esc(s.title)}</h2>${s.items.map((it, i) => `<div class="entry"><h3><span class="ref">${s.n}.${i + 1}</span>${esc(it.q)}</h3>${answerHtml(it.a)}</div>`).join('')}`).join('')}
</body></html>`

mkdirSync(new URL('../public/docs/', import.meta.url), { recursive: true })
const out = new URL('../public/docs/beztak-operations-manual.pdf', import.meta.url).pathname
const browser = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({ path: out, format: 'Letter', margin: { top: '0.8in', bottom: '0.9in', left: '0.9in', right: '0.9in' }, displayHeaderFooter: true,
    headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;color:#666;font-family:Arial"><span class="pageNumber"></span> / <span class="totalPages"></span></div>', printBackground: true })
} finally { await browser.close() }
console.log(`Wrote ${out} (${Math.round(statSync(out).size / 1024)} KB)`)
