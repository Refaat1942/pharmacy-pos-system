import { useTranslation } from 'react-i18next'
import { normalizePhone, isValidPhone } from '../lib/phone'

interface Props {
  value: string | null | undefined
  onChange: (v: string) => void
  className?: string
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
}

export default function PhoneField({ value, onChange, className, placeholder, autoFocus, disabled }: Props) {
  const { t } = useTranslation()
  const v = value || ''
  const invalid = !!v.trim() && !isValidPhone(v)
  const base = className || 'input mt-1 w-full'
  const cls = invalid
    ? `${base} border-red-400 focus:ring-red-200 focus:border-red-500`
    : base
  return (
    <div className="w-full">
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        dir="ltr"
        maxLength={11}
        value={v}
        onChange={(e) => onChange(normalizePhone(e.target.value))}
        placeholder={placeholder ?? '01012345678'}
        className={cls}
        autoFocus={autoFocus}
        disabled={disabled}
      />
      {invalid && (
        <p className="text-[11px] text-red-600 mt-1">{t('validation.phone_invalid')}</p>
      )}
    </div>
  )
}
