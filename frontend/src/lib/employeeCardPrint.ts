import JsBarcode from 'jsbarcode'
import {
  expandLabelPrintList,
  loadEffectiveLabelPrintConfig,
  openLabelPrintWindow,
  type LabelEntry,
} from './labelPrint'

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

async function renderCode128Png(value: string): Promise<string | null> {
  if (!value) return null
  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: false,
      margin: 4,
      font: 'monospace',
      fontSize: 14,
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

export async function openEmployeeBarcodeLabelPrint(
  card: EmployeeCardData,
  labels: CardPrintLabels,
  isAr: boolean,
): Promise<void> {
  const scanVal = barcodeScanValue(card.code)
  if (!scanVal) return
  const config = await loadEffectiveLabelPrintConfig(isAr, card.pharmaName)
  const entry: LabelEntry = {
    barcode: scanVal,
    name: card.name,
    price: null,
    expiryDate: null,
  }
  const printList = expandLabelPrintList([entry], [1], config.gridOpts)
  await openLabelPrintWindow(printList, config, labels, false, 'PRINT_EMP_BARCODE')
}
