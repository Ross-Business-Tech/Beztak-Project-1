// Spelling fixer for rushed typing ("wen is rnt due", "purchse order", "emergancy").
// Each word that is not a known word is swapped for the closest word the help desk knows: words from the manual,
// the HR answers and every routing and safety rule. The fixed text is used only for the rules and manual matching;
// the AI always reads exactly what the person typed (it understands typos by itself).
import { ESCALATIONS, KNOWLEDGE, SELF_URGENT, SENSITIVE_WORDS, TOPIC_WORDS, URGENT_WORDS } from './data'

// Full words the safety and routing rules look for (several rules match on word stems such as "harass" or "injur").
const SAFETY_WORDS = `emergency emergencies urgent flood flooding flooded leak leaking leaks burst pipe pipes sewage
  water pouring ceiling furnace heater heat broken fire smoke smell gas carbon monoxide alarm weapon knife threat threatened
  threatening attack attacked assault assaulted violence violent stalking stalked danger dangerous unsafe scared injury injured
  injuries accident bleeding slipped fell hurt harassment harassed harassing discrimination discriminated retaliation retaliated
  hostile bullying bullied sexual inappropriate touching unwanted suicide suicidal lawsuit lawyer attorney illegal diagnosis
  symptoms medication dosage treatment password social security routing account hacked phishing suspicious breach stolen lost
  paycheck payroll paid salary wages missing short overtime locked lockout eviction evicted deadline insurance coverage`

// Common words that are spelled right even though the manual never uses them: never "corrected".
const COMMON = new Set(`a an and are as at be but by can do for from has have he her him his how i if in is it its me my no not of on
  or our she so that the their them then there they this to up us was we what when where which who why will with you your yes
  ok okay hi hey hello thanks thank please bye sorry just also any some much many get got need want like know tell help ask
  about after before again all am been being both did does done each few here into more most other over same should than too
  under until very while would could might must shall may let say said see saw use used make made take took give gave go went
  come came think thought look find found work works worked job day days week weeks month months year years time today tomorrow
  dog dogs cat cats car cars kid kids home house good bad new old big small way thing things lot fine hire hired lead leads
  pay rent due fee fees order orders form forms lease leases unit units door doors key keys card cards bank bill bills cash
  question questions answer answers reset login logout log sign email emails phone call text message app site page link
  password account profile update change changed start starts end ends leave left early late sick sorry wrong right left
  name number address office desk boss team coworker manager parking gym lunch break shift shifts swap schedule calendar
  holiday vacation trip family baby school doctor dentist appointment birthday party coffee kitchen bathroom laptop computer
  printer internet wifi train training class test meeting call calls lost found send sent read write wrote open close closed
  need needs needed still yet ever never always often sometimes maybe really sure please thanks question asking asked`
  .split(/\s+/).filter(Boolean))

const tokens = (t) => String(t).toLowerCase().match(/[a-z]+/g) || []

// Optimal string alignment distance (letters added, dropped, swapped or changed), giving up above `max`.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2 = null
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur.push(v)
      if (v < best) best = v
    }
    if (best > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]
}

const cache = new Map()
function vocabulary(corpusText = '') {
  const key = corpusText.length + ':' + corpusText.slice(0, 200)
  if (cache.has(key)) return cache.get(key)
  const count = new Map()
  const add = (text, weight = 1) => { for (const w of tokens(text)) if (w.length >= 3) count.set(w, (count.get(w) || 0) + weight) }
  add(corpusText)
  add(KNOWLEDGE.map((k) => `${(k.keys || []).join(' ')} ${k.answer || ''}`).join(' '))
  add([...SENSITIVE_WORDS, ...URGENT_WORDS].join(' '), 3)
  add(JSON.stringify(TOPIC_WORDS), 3)
  add(ESCALATIONS.map((e) => e.test.source.replace(/\\[a-z]/gi, ' ')).join(' '), 2)
  add(SELF_URGENT.source.replace(/\\[a-z]/gi, ' '), 2)
  add(SAFETY_WORDS, 3)
  const safety = new Set(tokens(SAFETY_WORDS))
  const vocab = { count, safety, list: [...count.keys()] }
  cache.set(key, vocab)
  return vocab
}

// The closest known word, or null. Typos usually keep the first letter (or swap the first two), and short words
// only get a missing letter back ("rnt" -> "rent"), so real words are rarely changed into something else.
function closest(w, vocab) {
  const max = w.length >= 7 ? 2 : 1
  let best = null
  for (const v of vocab.list) {
    if (!(v[0] === w[0] || (v[0] === w[1] && v[1] === w[0]))) continue
    if (w.length === 3 && v.length !== 4) continue
    if (vocab.safety.has(v) && v.length < 5) continue // never turn a stray short word into "fire", "gun" or "hurt"
    const d = distance(w, v, max)
    if (d > max) continue
    const score = d * 1000 - (vocab.count.get(v) || 0)
    if (!best || score < best.score) best = { v, score }
  }
  return best?.v || null
}

// Returns the text with misspelled words fixed. Words that are known, common, too short or contain digits stay as typed.
export function fixSpelling(text, corpusText = '') {
  const s = String(text || '')
  if (!s.trim()) return s
  const vocab = vocabulary(corpusText)
  return s.replace(/[A-Za-z]+/g, (word) => {
    const w = word.toLowerCase()
    if (w.length < 3 || COMMON.has(w) || vocab.count.has(w)) return word
    // plurals and endings of known words are fine as typed
    // a known word's singular or base form ("question" when the manual only says "questions") is spelled right
    if (['s', 'es', 'ed', 'd', 'ing', 'er', 'ers'].some((x) => vocab.count.has(w + x))) return word
    if (/(s|es|ed|ing|ly)$/.test(w) && [w.replace(/(es|s)$/, ''), w.replace(/(ed|ing|ly)$/, ''), w.replace(/(ed|ing)$/, 'e')].some((x) => vocab.count.has(x))) return word
    return closest(w, vocab) || word
  })
}
