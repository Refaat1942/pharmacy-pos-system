/** Display dates as dd/mm/yy (tenant convention). API/storage stays ISO YYYY-MM-DD. */

function parseDateInput(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const s = String(iso).trim()
  if (!s) return null
  const datePart = s.includes('T') ? s.slice(0, 10) : s.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const [y, m, d] = datePart.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Format ISO date or timestamp as dd/mm/yy */
export function formatDate(iso: string | null | undefined): string {
  const d = parseDateInput(iso)
  if (!d) return '—'
  const yy = String(d.getFullYear()).slice(-2)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${yy}`
}

/** Format ISO timestamp as dd/mm/yy HH:mm */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = String(iso)
  const d = parseDateInput(s)
  if (!d) return '—'
  const yy = String(d.getFullYear()).slice(-2)
  const date = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${yy}`
  const timePart = s.length >= 19 ? s.slice(11, 16) : ''
  if (timePart && /^\d{2}:\d{2}/.test(timePart)) return `${date} ${timePart}`
  return date
}

/** Time portion HH:mm:ss from ISO timestamp */
export function formatTime(iso: string | null | undefined): string {
  if (!iso || iso.length < 19) return '—'
  return iso.slice(11, 19)
}

/** Format YYYY-MM-DD value for date input labels */
export function formatIsoDateLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  return formatDate(iso)
}
