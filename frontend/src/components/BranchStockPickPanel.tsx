import { useTranslation } from 'react-i18next'
import type { BranchStockPickRow } from '../lib/branchStockPick'

type Props<T extends BranchStockPickRow> = {
  items: T[]
  pickedKeys: Set<string>
  onToggle: (key: string) => void
  onSelectAll: () => void
  onClear: () => void
  isAr: boolean
}

export default function BranchStockPickPanel<T extends BranchStockPickRow>({
  items,
  pickedKeys,
  onToggle,
  onSelectAll,
  onClear,
  isAr,
}: Props<T>) {
  const { t } = useTranslation()

  return (
    <div className="mb-4 rounded-2xl border border-pharma-200 bg-pharma-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold text-pharma-900">{t('inventory.bs_pick_title')}</p>
          <p className="text-xs text-pharma-800/80 mt-0.5">{t('inventory.bs_pick_hint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-pharma-800 tabular-nums">
            {t('inventory.bs_pick_selected', { count: pickedKeys.size })}
          </span>
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-pharma-300 bg-white text-pharma-800 hover:bg-pharma-50"
          >
            {t('inventory.bs_pick_select_all')}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            {t('inventory.bs_pick_clear')}
          </button>
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto rounded-xl border border-pharma-100 bg-white divide-y divide-slate-50">
        {items.map((row) => {
          const checked = pickedKeys.has(row.key)
          const name = isAr ? row.name_ar : row.name_en
          return (
            <label
              key={row.key}
              className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50/80 ${
                checked ? 'bg-pharma-50/60' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(row.key)}
                className="mt-1 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-pharma-600 focus:ring-pharma-500"
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-slate-800 leading-snug">{name}</span>
                <span className="flex flex-wrap gap-2 mt-0.5">
                  {row.barcode && (
                    <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {row.barcode}
                    </span>
                  )}
                  {row.international_barcode && (
                    <span className="font-mono text-[10px] text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {row.international_barcode}
                    </span>
                  )}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
