// When the HR team works, and how ticket deadlines are set from that.
// Deadlines count only work hours, so nothing becomes "overdue" while the team is off.
export const WORK = { start: 9, end: 17, days: [1, 2, 3, 4, 5], label: 'Monday to Friday, 9:00 am to 5:00 pm' }
export const URGENT_WORK_HOURS = 2

const isWorkday = (d) => WORK.days.includes(d.getDay())
const at = (d, hour) => { const x = new Date(d); x.setHours(hour, 0, 0, 0); return x }
const nextDay = (d) => { const x = at(d, WORK.start); x.setDate(x.getDate() + 1); return x }
export const isWorkTime = (d) => isWorkday(d) && d.getHours() >= WORK.start && d.getHours() < WORK.end

// The first moment the team is working, at or after `d` (the next clock-in if they are off).
export function nextOpen(d) {
  let x = new Date(d)
  for (let i = 0; i < 14; i++) {
    if (isWorkday(x) && x < at(x, WORK.end)) return x < at(x, WORK.start) ? at(x, WORK.start) : x
    x = nextDay(x)
  }
  return x
}

// Adds hours of work time: the clock stops at closing time and starts again at the next clock-in.
export function addWorkHours(from, hours) {
  let t = nextOpen(from)
  let left = hours * 3600000
  for (let i = 0; i < 30; i++) {
    const close = at(t, WORK.end)
    if (t.getTime() + left <= close.getTime()) return new Date(t.getTime() + left)
    left -= close - t
    t = nextOpen(close)
  }
  return t
}

// Urgent: arrived while the team is off → due at the next clock-in (the first thing they answer);
//         arrived during work hours → due within 2 work hours.
// Normal: due at closing time on the next workday ("within one business day").
export function dueFrom(created, urgent) {
  const c = new Date(created)
  if (urgent) return isWorkTime(c) ? addWorkHours(c, URGENT_WORK_HOURS) : nextOpen(c)
  let d = at(c, WORK.end)
  do d.setDate(d.getDate() + 1); while (!isWorkday(d))
  return d
}
