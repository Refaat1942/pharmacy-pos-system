import { useMemo, useRef, useState, useCallback, ReactNode } from 'react'
import { ArrowUp, ArrowDown, ChevronsUpDown, Search } from 'lucide-react'

export type SortDir = 'asc' | 'desc'
export type SortState = { key: string; dir: SortDir } | null
export type Accessor<T> = (row: T) => unknown

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

function compare(a: unknown, b: unknown): number {
  const ae = isEmpty(a)
  const be = isEmpty(b)
  if (ae && be) return 0
  if (ae) return 1
  if (be) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1
  const na = typeof a === 'number' ? a : Number(a)
  const nb = typeof b === 'number' ? b : Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export function useSort<T>(rows: T[], accessors: Record<string, Accessor<T>>, initial: SortState = null) {
  const accRef = useRef(accessors)
  accRef.current = accessors
  const [sort, setSort] = useState<SortState>(initial)
  const toggle = useCallback((key: string) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' }
      if (s.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }, [])
  const sorted = useMemo(() => {
    if (!sort) return rows
    const acc = accRef.current[sort.key]
    if (!acc) return rows
    const mult = sort.dir === 'desc' ? -1 : 1
    const arr = [...rows]
    arr.sort((x, y) => {
      const ax = acc(x)
      const ay = acc(y)
      const ae = isEmpty(ax)
      const be = isEmpty(ay)
      if (ae && be) return 0
      if (ae) return 1
      if (be) return -1
      return compare(ax, ay) * mult
    })
    return arr
  }, [rows, sort])
  return { sorted, sort, toggle }
}

const ALIGN: Record<string, string> = {
  start: 'text-start justify-start',
  end: 'text-end justify-end',
  center: 'text-center justify-center',
}

export function SortTh({
  k, sort, onToggle, align = 'start', className = '', children,
}: {
  k: string
  sort: SortState
  onToggle: (k: string) => void
  align?: 'start' | 'end' | 'center'
  className?: string
  children: ReactNode
}) {
  const active = sort?.key === k
  const dir = active ? sort!.dir : null
  const a = ALIGN[align] || ALIGN.start
  return (
    <th
      onClick={() => onToggle(k)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-3 py-2.5 cursor-pointer select-none hover:text-slate-700 transition-colors ${a.split(' ')[0]} ${className}`}
    >
      <span className={`inline-flex items-center gap-1 ${a.split(' ')[1]}`}>
        {children}
        {dir === 'asc' ? <ArrowUp size={12} className="text-pharma-600" />
          : dir === 'desc' ? <ArrowDown size={12} className="text-pharma-600" />
          : <ChevronsUpDown size={12} className="opacity-30" />}
      </span>
    </th>
  )
}

export function useQuickFilter<T>(rows: T[], fields: Accessor<T>[]) {
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      fieldsRef.current.some((f) => {
        const v = f(r)
        return v != null && String(v).toLowerCase().includes(q)
      }),
    )
  }, [rows, query])
  return { query, setQuery, filtered }
}

export function TableFilter({
  value, onChange, placeholder, className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-2.5 text-slate-400 pointer-events-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input w-full ps-8"
      />
    </div>
  )
}
