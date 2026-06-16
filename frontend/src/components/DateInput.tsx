import { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { formatDate, isoToDisplayDate, isIsoInRange, parseDisplayDate } from '../lib/formatDate'

type Props = {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  className?: string
  disabled?: boolean
  placeholder?: string
}

/** Date field with dd/mm/yy typing AND a calendar picker. Value to parent is ISO YYYY-MM-DD. */
export default function DateInput({
  value,
  onChange,
  min,
  max,
  className = 'input text-sm',
  disabled,
  placeholder = 'dd/mm/yy',
}: Props) {
  const [text, setText] = useState(() => isoToDisplayDate(value))
  const [invalid, setInvalid] = useState(false)
  const dateRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setText(isoToDisplayDate(value))
    setInvalid(false)
  }, [value])

  const commit = (raw: string, finalize = false) => {
    setText(raw)
    const trimmed = raw.trim()
    if (!trimmed) {
      setInvalid(false)
      onChange('')
      return
    }
    const iso = parseDisplayDate(trimmed)
    if (!iso) {
      if (finalize) setInvalid(true)
      return
    }
    if (min || max) {
      if (!isIsoInRange(iso, min, max)) {
        if (finalize) setInvalid(true)
        return
      }
    }
    setInvalid(false)
    onChange(iso)
    if (finalize) setText(isoToDisplayDate(iso))
  }

  // Calendar picker → ISO value directly.
  const pickIso = (iso: string) => {
    if (!iso) {
      setInvalid(false)
      setText('')
      onChange('')
      return
    }
    setInvalid(false)
    onChange(iso)
    setText(isoToDisplayDate(iso))
  }

  const openCalendar = () => {
    const el = dateRef.current
    if (!el || disabled) return
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return } catch { /* fall through */ }
    }
    el.focus()
    el.click()
  }

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => commit(text, true)}
          className={`${className} pe-9${invalid ? ' border-red-400 ring-1 ring-red-300' : ''}`}
          title={value ? formatDate(value) : placeholder}
        />
        <button
          type="button"
          onClick={openCalendar}
          disabled={disabled}
          tabIndex={-1}
          aria-label="Open calendar"
          className="absolute inset-y-0 end-1 flex items-center px-1.5 text-slate-400 hover:text-pharma-600 disabled:opacity-40"
        >
          <CalendarDays size={16} />
        </button>
        {/* Hidden native date input drives the calendar popup. */}
        <input
          ref={dateRef}
          type="date"
          value={value || ''}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => pickIso(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute end-1 bottom-0 w-px h-px opacity-0 pointer-events-none"
        />
      </div>
      {invalid ? (
        <p className="text-[10px] text-red-500 mt-0.5">{placeholder}</p>
      ) : null}
    </div>
  )
}
