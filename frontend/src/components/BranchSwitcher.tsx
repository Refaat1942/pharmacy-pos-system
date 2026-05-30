import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, ChevronDown, Check } from 'lucide-react'
import i18n from '../lib/i18n'
import { branchesAPI, Branch } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function BranchSwitcher() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<number | null>(() => {
    const raw = localStorage.getItem('pharma_active_branch')
    if (raw === 'all') return null
    if (raw) return Number(raw)
    return null
  })
  const [initialized, setInitialized] = useState(
    localStorage.getItem('pharma_active_branch') !== null,
  )
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    branchesAPI
      .list()
      .then((r) => setBranches(r.data))
      .catch(() => setBranches([]))
  }, [])

  useEffect(() => {
    if (!initialized && user?.branch_id) {
      setActive(user.branch_id)
      localStorage.setItem('pharma_active_branch', String(user.branch_id))
      setInitialized(true)
    }
  }, [user, initialized])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const isAdmin = user?.role === 'admin'
  const activeBranch = branches.find((b) => b.id === active)
  const label = (b?: Branch) =>
    b ? (i18n.language === 'ar' ? b.name_ar : b.name_en) : t('branch.all')

  const choose = (id: number | null) => {
    localStorage.setItem('pharma_active_branch', id === null ? 'all' : String(id))
    setActive(id)
    setInitialized(true)
    setOpen(false)
    window.dispatchEvent(new CustomEvent('branch-changed'))
    window.location.reload()
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center gap-1.5 text-pharma-700 bg-pharma-50 border border-pharma-100 px-3 py-1.5 rounded-lg text-sm font-semibold">
        <Building2 size={14} />
        <span>{label(activeBranch)}</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-pharma-700 hover:text-pharma-800 bg-pharma-50 hover:bg-pharma-100 border border-pharma-100 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
        title={t('branch.switch')}
      >
        <Building2 size={14} />
        <span className="max-w-[160px] truncate">{label(activeBranch)}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-56 bg-white text-slate-800 rounded-lg shadow-2xl border border-slate-200 py-1 z-50">
          <div className="px-3 py-1.5 text-xs uppercase tracking-wide text-slate-500 font-semibold">
            {t('branch.switch')}
          </div>
          <button
            onClick={() => choose(null)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-100"
          >
            <span className="font-medium">{t('branch.all')}</span>
            {active === null && <Check size={14} className="text-pharma-600" />}
          </button>
          <div className="border-t border-slate-100 my-1" />
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => choose(b.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-100"
            >
              <span className="truncate">{label(b)}</span>
              {active === b.id && <Check size={14} className="text-pharma-600" />}
            </button>
          ))}
          {branches.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400">{t('branch.none')}</div>
          )}
        </div>
      )}
    </div>
  )
}
