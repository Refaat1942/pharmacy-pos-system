/** Open dose-label print preview window (shared by POS inline + full modal). */

export type DoseLabelSize = 'thermal' | 'thermal_tall'

export interface DoseLabelPrintRow {
  name: string
  doseText: string
  qty: number
  patientName?: string
}

const SIZE = {
  thermal: { w: '38mm', h: '25mm', doseFs: '8px', nameFs: '7px', phFs: '6px' },
  thermal_tall: { w: '38mm', h: '35mm', doseFs: '9px', nameFs: '7px', phFs: '6px' },
} as const

function trunc(s: string, max: number): string {
  const t = s.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function buildStyles(size: DoseLabelSize): string {
  const cfg = SIZE[size]
  return `
    @page{size:${cfg.w} ${cfg.h};margin:0}
    body{margin:0;font-family:Arial,'Noto Naskh Arabic',sans-serif;background:#fff;color:#000;font-weight:700}
    #print-toolbar{
      position:sticky;top:0;z-index:99;padding:12px 16px;background:#eff6ff;
      border-bottom:2px solid #3b82f6;display:flex;align-items:center;gap:12px;flex-wrap:wrap
    }
    #print-toolbar strong{font-size:14px;color:#1e40af}
    #print-toolbar button{
      padding:10px 18px;background:#2563eb;color:#fff;font-weight:700;border:none;
      border-radius:8px;cursor:pointer;font-size:14px
    }
    #print-toolbar span{font-size:12px;color:#1d4ed8}
    .grid{display:block;padding:8px}
    .cell{
      width:${cfg.w};height:${cfg.h};max-width:${cfg.w};max-height:${cfg.h};
      box-sizing:border-box;overflow:hidden;padding:1mm 1.5mm;margin:0 auto 4px;
      border:1px dashed #ccc;display:flex;flex-direction:column;align-items:center;
      justify-content:center;text-align:center;page-break-after:always
    }
    .pharmacy{font-size:${cfg.phFs};font-weight:900;line-height:1.1;margin:0 0 0.5mm;width:100%;
      overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-transform:uppercase}
    .name{font-size:${cfg.nameFs};font-weight:800;line-height:1.1;margin:0 0 0.5mm;width:100%;
      max-height:2.2em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .dose{font-size:${cfg.doseFs};font-weight:900;line-height:1.15;margin:0;width:100%;
      max-height:4.5em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
    .patient{font-size:6px;font-weight:700;margin-top:0.5mm;width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    @media print{
      #print-toolbar{display:none!important}
      .grid{padding:0}
      .cell{border:none;margin:0}
      @page{size:${cfg.w} ${cfg.h};margin:0}
    }
  `
}

export interface OpenDoseLabelPrintOptions {
  rows: DoseLabelPrintRow[]
  size?: DoseLabelSize
  showPharmacy?: boolean
  pharmacyName?: string
  autoPrint?: boolean
  labels: {
    title: string
    toolbarTitle: string
    toolbarBtn: string
    toolbarHint: string
    doseRequired: string
    popupBlocked: string
  }
}

export function openDoseLabelPrintWindow(opts: OpenDoseLabelPrintOptions): boolean {
  const valid = opts.rows.filter((r) => r.doseText.trim() && r.qty > 0)
  if (!valid.length) {
    alert(opts.labels.doseRequired)
    return false
  }

  const w = window.open('', 'DOSE_LABELS', 'width=960,height=720,scrollbars=yes')
  if (!w) {
    alert(opts.labels.popupBlocked)
    return false
  }

  const size = opts.size ?? 'thermal_tall'
  const showPharmacy = opts.showPharmacy !== false
  const pharmacyName = (opts.pharmacyName || '').trim()

  w.document.title = opts.labels.title
  const style = w.document.createElement('style')
  style.textContent = buildStyles(size)
  w.document.head.appendChild(style)

  const toolbar = w.document.createElement('div')
  toolbar.id = 'print-toolbar'
  const title = w.document.createElement('strong')
  title.textContent = opts.labels.toolbarTitle
  const btn = w.document.createElement('button')
  btn.type = 'button'
  btn.textContent = opts.labels.toolbarBtn
  btn.onclick = () => { w.focus(); w.print() }
  const hint = w.document.createElement('span')
  hint.textContent = opts.labels.toolbarHint
  toolbar.append(title, btn, hint)
  w.document.body.appendChild(toolbar)

  const grid = w.document.createElement('div')
  grid.className = 'grid'
  w.document.body.appendChild(grid)

  for (const row of valid) {
    for (let i = 0; i < row.qty; i++) {
      const cell = w.document.createElement('div')
      cell.className = 'cell'
      if (showPharmacy && pharmacyName) {
        const ph = w.document.createElement('div')
        ph.className = 'pharmacy'
        ph.textContent = trunc(pharmacyName, 28)
        cell.appendChild(ph)
      }
      const nm = w.document.createElement('div')
      nm.className = 'name'
      nm.textContent = trunc(row.name, 40)
      cell.appendChild(nm)
      const dose = w.document.createElement('div')
      dose.className = 'dose'
      dose.textContent = row.doseText.trim()
      cell.appendChild(dose)
      if (row.patientName?.trim()) {
        const pt = w.document.createElement('div')
        pt.className = 'patient'
        pt.textContent = trunc(row.patientName.trim(), 32)
        cell.appendChild(pt)
      }
      grid.appendChild(cell)
    }
  }

  w.document.close()
  if (opts.autoPrint) {
    w.focus()
    w.print()
  }
  return true
}
