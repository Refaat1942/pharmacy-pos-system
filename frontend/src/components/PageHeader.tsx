import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

/** Bold, clear page heading for feature screens. */
export default function PageHeader({ title, subtitle, actions, className = '' }: Props) {
  return (
    <header className={`mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        <h1 className="feature-page-title">{title}</h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-slate-500 max-w-3xl leading-relaxed">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </header>
  )
}
