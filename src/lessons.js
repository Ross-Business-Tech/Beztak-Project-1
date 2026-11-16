// Team lessons: short answers an HR person teaches the agent, approved by a second person, that the agent may use (and must cite)
// for questions the manuals do not cover. The rules below are shared by the website and the email helper.
export const Q_MAX = 300
export const A_MAX = 1200
const PRIVATE = /\b\d{3}-?\d{2}-?\d{4}\b|password\s*(is|:)|\bssn\b|social security|routing number|account number|alarm code is|gate code is/i
const BLANKS = /\[[^\]\n]{1,120}\]|\{[^}\n]{1,120}\}|<[^>\n]{1,120}>|_{3,}|\bTBD\b/i
const tidy = (x, n) => String(x ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n)

// Returns { ok: true, question, answer } or { ok: false, error } in plain words.
export function checkLesson(input = {}) {
  const question = tidy(input.question, Q_MAX + 1)
  const answer = tidy(input.answer, A_MAX + 1)
  if (!question || !answer) return { ok: false, error: 'A lesson needs both a question and an answer.' }
  if (question.length > Q_MAX) return { ok: false, error: `Keep the question under ${Q_MAX} characters.` }
  if (answer.length > A_MAX) return { ok: false, error: `Keep the answer under ${A_MAX} characters.` }
  if (PRIVATE.test(question) || PRIVATE.test(answer)) return { ok: false, error: 'It looks like it has an ID number or a password in it. Lessons must not contain private information.' }
  if (BLANKS.test(question) || BLANKS.test(answer)) return { ok: false, error: 'Remove the [blanks] or <brackets>: a lesson must be a finished answer.' }
  return { ok: true, question, answer }
}
