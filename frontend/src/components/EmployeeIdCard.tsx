import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { Barcode, Printer } from 'lucide-react'
import { barcodeScanValue } from '../lib/employeeCardPrint'

export interface EmployeeIdCardProps {
  name: string
  pharmaName: string
  role?: string
  branch?: string
  code: string
  scanLabel: string
  onPrintIdCard: () => void
  onPrintBarcodeLabel: () => void
  printIdCardTitle: string
  printBarcodeLabelTitle: string
}

export default function EmployeeIdCard({
  name,
  pharmaName,
  role,
  branch,
  code,
  scanLabel,
  onPrintIdCard,
  onPrintBarcodeLabel,
  printIdCardTitle,
  printBarcodeLabelTitle,
}: EmployeeIdCardProps) {
  return (
    <div className="id-card relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="no-print absolute top-1.5 end-1.5 z-10 flex gap-1">
        <button
          type="button"
          onClick={onPrintIdCard}
          title={printIdCardTitle}
          className="p-1.5 rounded-lg bg-white/90 border border-slate-200 text-slate-500 hover:text-pharma-600 hover:border-pharma-300 shadow-sm"
        >
          <Printer size={14} />
        </button>
        <button
          type="button"
          onClick={onPrintBarcodeLabel}
          title={printBarcodeLabelTitle}
          className="p-1.5 rounded-lg bg-white/90 border border-slate-200 text-slate-500 hover:text-pharma-600 hover:border-pharma-300 shadow-sm"
        >
          <Barcode size={14} />
        </button>
      </div>
      <div className="card-header bg-pharma-600 text-white px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-center">
        {pharmaName}
      </div>
      <div className="px-4 py-3 flex flex-col items-center text-center">
        <div className="font-bold text-slate-800 text-base leading-tight">{name}</div>
        {role ? <div className="text-xs text-slate-500 capitalize">{role}</div> : null}
        {branch ? <div className="text-[11px] text-slate-400 mt-0.5">{branch}</div> : null}
        <BarcodePreview value={barcodeScanValue(code)} />
        <div className="font-mono text-[12px] text-slate-700 tracking-wide">{code}</div>
        <div className="text-[10px] text-slate-400 mt-0.5">{scanLabel}</div>
      </div>
    </div>
  )
}

function BarcodePreview({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: false,
        margin: 0,
      })
    } catch {
      /* ignore invalid barcode */
    }
  }, [value])
  return <svg ref={ref} className="w-full max-w-[220px] h-16 my-2" />
}
