import { useEffect, useState } from 'react'
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

/** Text date field using dd/mm/yy (not browser locale). Value passed to parent is ISO YYYY-MM-DD. */
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

  return (
    <div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => commit(text, true)}
        className={`${className}${invalid ? ' border-red-400 ring-1 ring-red-300' : ''}`}
        title={value ? formatDate(value) : placeholder}
      />
      {invalid ? (
        <p className="text-[10px] text-red-500 mt-0.5">{placeholder}</p>
      ) : null}
    </div>
  )
}
