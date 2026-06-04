import { formatIsoDateLabel } from '../lib/formatDate'

type Props = {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  className?: string
  disabled?: boolean
}

/** Native date picker with dd/mm/yy display hint below the field. */
export default function DateInput({ value, onChange, min, max, className = 'input text-sm', disabled }: Props) {
  return (
    <div>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
      {value ? (
        <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{formatIsoDateLabel(value)}</p>
      ) : null}
    </div>
  )
}
