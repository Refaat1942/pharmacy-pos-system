import JsBarcode from 'jsbarcode'

const LABEL_PREFS_KEY = 'pharma_label_print_prefs'

export interface EmployeeCardData {
  name: string
  pharmaName: string
  role?: string
  branch?: string
  code: string
  scanLabel: string
}

export interface CardPrintLabels {
  printToolbar: string
  popupBlocked: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function barcodeScanValue(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '')
}

async function renderCode128Png(
  value: string,
  opts?: { width?: number; height?: number; displayValue?: boolean; fontSize?: number },
): Promise<string | null> {
  if (!value) return null
  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: opts?.width ?? 2,
      height: opts?.height ?? 60,
      displayValue: opts?.displayValue ?? false,
      margin: 4,
      font: 'monospace',
      fontSize: opts?.fontSize ?? 14,
      lineColor: '#000000',
      background: '#ffffff',
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function waitForImages(doc: Document): Promise<void> {
  return Promise.all(
    Array.from(doc.images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve()
          else {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }
        }),
    ),
  ).then(() => undefined)
}

function loadLabelDims(): { wMm: number; hMm: number } {
  try {
    const raw = localStorage.getItem(LABEL_PREFS_KEY)
    const p = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const size = String(p.size || 'strip38')
    if (size === 'strip38' || size === 'thermal') return { wMm: 38, hMm: 12 }
    if (size === 'small' || size === 'sm') return { wMm: 40, hMm: 20 }
    if (size === 'medium') return { wMm: 50, hMm: 25 }
    if (size === 'large' || size === 'lg' || size === 'zebra2x3') return { wMm: 80, hMm: 50 }
    if (size === 'custom') {
      const w = Number(p.customW)
      const h = Number(p.customH)
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        return { wMm: Math.min(200, Math.max(5, w)), hMm: Math.min(200, Math.max(5, h)) }
      }
    }
  } catch {
    /* ignore */
  }
  return { wMm: 38, hMm: 12 }
}

function loadLabelStyle(dims: { wMm: number; hMm: number }) {
  const short = dims.hMm < 16
  let overrides: Record<string, number> = {}
  try {
    const raw = localStorage.getItem(LABEL_PREFS_KEY)
    const p = raw ? (JSON.parse(raw) as { overrides?: Record<string, number> }) : {}
    if (p.overrides && typeof p.overrides === 'object') overrides = p.overrides
  } catch {
    /* ignore */
  }
  return {
    barcodeHeightMm: overrides.barcodeHeightMm ?? (short ? 5 : 10),
    barcodeScaleMm: overrides.barcodeScaleMm ?? (short ? 0.3 : 0.5),
    fontSizeMm: overrides.fontSizeMm ?? (short ? 1.5 : 2.5),
    paddingMm: overrides.paddingMm ?? (short ? 0 : 1.5),
  }
}

async function renderLabelBarcodePng(value: string, style: ReturnType<typeof loadLabelStyle>): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, value, {
      format: 'CODE128',
      displayValue: true,
      width: Math.max(1, style.barcodeScaleMm * 3.8),
      height: Math.max(10, style.barcodeHeightMm * 3.8),
      margin: 0,
      font: 'Arial Black, Arial, sans-serif',
      fontSize: Math.max(6, style.fontSizeMm * 3.8),
      fontOptions: 'bold',
      textMargin: 1,
      lineColor: '#000000',
      background: '#ffffff',
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

const ID_CARD_STYLES = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #f1f5f9; color: #0f172a; }
  #print-toolbar {
    position: sticky; top: 0; z-index: 99; padding: 12px 16px; background: #ecfdf5;
    border-bottom: 2px solid #10b981; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  }
  #print-toolbar button {
    padding: 10px 18px; background: #059669; color: #fff; font-weight: 700; border: none;
    border-radius: 8px; cursor: pointer; font-size: 14px;
  }
  .sheet { padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .id-card {
    width: 85mm; max-width: 100%; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px;
    overflow: hidden; break-inside: avoid; page-break-inside: avoid;
  }
  .id-card .header {
    background: #059669; color: #fff; padding: 8px 12px; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em; text-align: center;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .id-card .body { padding: 14px 16px; text-align: center; }
  .id-card .name { font-size: 16px; font-weight: 700; line-height: 1.2; margin-bottom: 4px; }
  .id-card .role { font-size: 12px; color: #64748b; text-transform: capitalize; }
  .id-card .branch { font-size: 11px; color: #94a3b8; margin-top: 2px; }
  .id-card .barcode { display: block; max-width: 220px; width: 100%; height: auto; margin: 10px auto; }
  .id-card .code { font-family: ui-monospace, monospace; font-size: 12px; letter-spacing: 0.04em; }
  .id-card .hint { font-size: 10px; color: #94a3b8; margin-top: 4px; }
  @media print {
    #print-toolbar { display: none !important; }
    html, body { background: #fff !important; }
    .sheet { padding: 0 !important; gap: 0 !important; }
    .id-card {
      box-shadow: none !important; border: 1px solid #cbd5e1 !important;
      page-break-after: always; break-after: page;
    }
    .id-card:last-child { page-break-after: auto; break-after: auto; }
    @page { size: A4; margin: 12mm; }
  }
`

function buildLabelStyles(dims: { wMm: number; hMm: number }, style: ReturnType<typeof loadLabelStyle>): string {
  const w = `${dims.wMm}mm`
  const h = `${dims.hMm}mm`
  const imgMaxH = `${Math.max(4, dims.hMm - style.paddingMm * 2 - style.fontSizeMm * 2)}mm`
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: Arial Black, Arial, sans-serif; background: #f8fafc; }
    #print-toolbar {
      position: sticky; top: 0; z-index: 99; padding: 12px 16px; background: #ecfdf5;
      border-bottom: 2px solid #10b981; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    }
    #print-toolbar button {
      padding: 10px 18px; background: #059669; color: #fff; font-weight: 700; border: none;
      border-radius: 8px; cursor: pointer; font-size: 14px;
    }
    .sheet { padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .cell {
      direction: ltr; width: ${w}; height: ${h}; overflow: hidden; padding: ${style.paddingMm}mm;
      background: #fff; border: 1px dashed #cbd5e1; display: flex; flex-direction: column;
      align-items: stretch; justify-content: space-between; gap: 0.5mm;
      break-inside: avoid; page-break-inside: avoid;
    }
    .top-row { display: flex; justify-content: space-between; width: 100%; font-size: ${style.fontSizeMm}mm; font-weight: 900; line-height: 0.9; }
    .top-row span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 100%; }
    .bc-wrap { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; width: 100%; }
    .bc-wrap img { max-width: 100%; max-height: ${imgMaxH}; width: auto; height: auto; object-fit: contain; display: block; }
    .bottom-row { font-size: ${Math.max(1, style.fontSizeMm - 0.3)}mm; font-weight: 900; text-align: center; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-transform: uppercase; }
    @media print {
      #print-toolbar { display: none !important; }
      html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
      .sheet { padding: 0 !important; gap: 0 !important; }
      .cell { border: none !important; margin: 0 !important; }
      @page { size: ${w} ${h}; margin: 0; }
    }
  `
}

async function buildIdCardBlock(card: EmployeeCardData): Promise<string | null> {
  const scanVal = barcodeScanValue(card.code)
  const barcodeUrl = await renderCode128Png(scanVal)
  if (!barcodeUrl) return null
  const roleLine = card.role ? `<div class="role">${escapeHtml(card.role)}</div>` : ''
  const branchLine = card.branch ? `<div class="branch">${escapeHtml(card.branch)}</div>` : ''
  return `
    <div class="id-card">
      <div class="header">${escapeHtml(card.pharmaName)}</div>
      <div class="body">
        <div class="name">${escapeHtml(card.name)}</div>
        ${roleLine}
        ${branchLine}
        <img class="barcode" src="${barcodeUrl}" alt="" />
        <div class="code">${escapeHtml(card.code)}</div>
        <div class="hint">${escapeHtml(card.scanLabel)}</div>
      </div>
    </div>
  `
}

function openPrintDocument(title: string, headHtml: string, bodyHtml: string, labels: CardPrintLabels): Window | null {
  const w = window.open('', title, 'width=820,height=640,scrollbars=yes')
  if (!w) {
    alert(labels.popupBlocked)
    return null
  }
  w.document.open()
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title> </title>${headHtml}</head><body>${bodyHtml}</body></html>`)
  w.document.close()
  return w
}

function wirePrintToolbar(w: Window, labels: CardPrintLabels): void {
  w.document.getElementById('print-btn')?.addEventListener('click', () => {
    w.focus()
    w.print()
  })
  const toolbarBtn = w.document.querySelector('#print-toolbar button')
  if (toolbarBtn && !toolbarBtn.id) {
    toolbarBtn.textContent = labels.printToolbar
  }
}

export async function openEmployeeIdCardPrint(card: EmployeeCardData, labels: CardPrintLabels): Promise<void> {
  const block = await buildIdCardBlock(card)
  if (!block) return
  const bodyHtml = `
    <div id="print-toolbar"><button type="button" id="print-btn">${escapeHtml(labels.printToolbar)}</button></div>
    <div class="sheet">${block}</div>
  `
  const w = openPrintDocument('PRINT_ID_CARD', `<style>${ID_CARD_STYLES}</style>`, bodyHtml, labels)
  if (!w) return
  await waitForImages(w.document)
  wirePrintToolbar(w, labels)
  w.focus()
}

export async function openAllEmployeeIdCardsPrint(cards: EmployeeCardData[], labels: CardPrintLabels): Promise<void> {
  if (cards.length === 0) return
  const blocks: string[] = []
  for (const card of cards) {
    const block = await buildIdCardBlock(card)
    if (block) blocks.push(block)
  }
  if (blocks.length === 0) return
  const bodyHtml = `
    <div id="print-toolbar"><button type="button" id="print-btn">${escapeHtml(labels.printToolbar)}</button></div>
    <div class="sheet">${blocks.join('')}</div>
  `
  const w = openPrintDocument('PRINT_ID_CARDS', `<style>${ID_CARD_STYLES}</style>`, bodyHtml, labels)
  if (!w) return
  await waitForImages(w.document)
  wirePrintToolbar(w, labels)
  w.focus()
}

export async function openEmployeeBarcodeLabelPrint(card: EmployeeCardData, labels: CardPrintLabels): Promise<void> {
  const scanVal = barcodeScanValue(card.code)
  if (!scanVal) return
  const dims = loadLabelDims()
  const style = loadLabelStyle(dims)
  const barcodeUrl = await renderLabelBarcodePng(scanVal, style)
  if (!barcodeUrl) return
  const labelStyles = buildLabelStyles(dims, style)
  const bodyHtml = `
    <div id="print-toolbar"><button type="button" id="print-btn">${escapeHtml(labels.printToolbar)}</button></div>
    <div class="sheet">
      <div class="cell">
        <div class="top-row"><span>${escapeHtml(card.name)}</span></div>
        <div class="bc-wrap"><img src="${barcodeUrl}" alt="" /></div>
        <div class="bottom-row">${escapeHtml(card.pharmaName)}</div>
      </div>
    </div>
  `
  const w = openPrintDocument('PRINT_EMP_BARCODE', `<style>${labelStyles}</style>`, bodyHtml, labels)
  if (!w) return
  await waitForImages(w.document)
  wirePrintToolbar(w, labels)
  w.focus()
}
