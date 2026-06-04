/** Display dates as dd/mm/yy (tenant convention). API/storage stays ISO YYYY-MM-DD. */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

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

/** Parse user-entered dd/mm/yy (or dd/mm/yyyy) to ISO YYYY-MM-DD */
export function parseDisplayDate(text: string): string | null {
  const s = text.trim().replace(/\./g, '/')
  if (!s) return null
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  let year = parseInt(m[3], 10)
  if (year < 100) year += 2000
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  const iso = `${year}-${pad2(month)}-${pad2(day)}`
  const check = parseDateInput(iso)
  if (!check || check.getDate() !== day || check.getMonth() + 1 !== month) return null
  return iso
}

/** ISO → dd/mm/yy for input fields (empty string when no value) */
export function isoToDisplayDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = parseDateInput(iso)
  if (!d) return ''
  const yy = String(d.getFullYear()).slice(-2)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${yy}`
}

/** @deprecated use isoToDisplayDate */
export function formatIsoDateLabel(iso: string | null | undefined): string {
  return isoToDisplayDate(iso)
}

export function isIsoInRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false
  if (max && iso > max) return false
  return true
}
