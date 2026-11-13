import { SECTIONS } from './data/beztakManual.js'

// Which Operations Manual the assistant is reading, as far as the website needs to know: the section titles, so a citation
// like [3.2] on the Manual gaps page names the right section. null means the built-in manual.
let titles = null
export const setActiveManualTitles = (list) => { titles = Array.isArray(list) && list.length ? list : null }
export const sectionTitle = (n) => (titles ? titles.find((x) => x.n === n)?.title : SECTIONS.find((x) => x.n === n)?.title)
