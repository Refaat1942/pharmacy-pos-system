/**
 * Offline label page served by FPS Print Bridge at http://127.0.0.1:17777/.
 * Bundled with esbuild into tools/fps-print-bridge/web/app.js (see tools/fps-print-bridge/README.md).
 * Uses the item list the web app saved into the bridge while online.
 */
import { buildTsplJob, renderLabelCanvas, type DirectLabel, type DirectOptions } from '../lib/tsplLabel'

interface Item { barcode: string; name: string; price: number | null; expiry: string | null }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const PREFS = 'fps_offline_label_prefs'

let items: Item[] = []
let pharmacy = ''
const queue: (Item & { qty: number })[] = []

function opts(): DirectOptions {
  const [w, h] = ($<HTMLSelectElement>('size').value || '38x10').split('x').map(Number)
  return {
    wMm: w, hMm: h, gapMm: Number($<HTMLInputElement>('gap').value) || 2,
    code: $<HTMLSelectElement>('code').value as 'barcode' | 'qr',
    barSize: $<HTMLSelectElement>('bar').value as 'small' | 'medium' | 'large',
    showName: true, showPrice: $<HTMLInputElement>('price').checked, showExpiry: $<HTMLInputElement>('exp').checked,
    showPharmacy: false, pharmacyName: pharmacy,
    shiftXmm: Number($<HTMLInputElement>('sx').value) || 0, shiftYmm: Number($<HTMLInputElement>('sy').value) || 0,
    rotate180: $<HTMLInputElement>('rot').checked, density: 10,
  }
}

function savePrefs() {
  const keep = ['size', 'gap', 'code', 'bar', 'sx', 'sy', 'printer']
  const v: Record<string, string | boolean> = {}
  keep.forEach((k) => { v[k] = ($(k) as HTMLInputElement).value })
  ;['price', 'exp', 'rot'].forEach((k) => { v[k] = $<HTMLInputElement>(k).checked })
  try { localStorage.setItem(PREFS, JSON.stringify(v)) } catch { /* ignore */ }
}

function loadPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS) || '{}')
    Object.entries(v).forEach(([k, val]) => {
      const el = document.getElementById(k) as HTMLInputElement | null
      if (!el) return
      if (typeof val === 'boolean') el.checked = val
      else el.value = String(val)
    })
  } catch { /* ignore */ }
}

function renderResults() {
  const q = $<HTMLInputElement>('q').value.trim().toLowerCase()
  const box = $('results')
  box.innerHTML = ''
  if (q.length < 2) return
  items.filter((i) => i.barcode.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)).slice(0, 30).forEach((i) => {
    const b = document.createElement('button')
    b.className = 'row'
    b.innerHTML = `<span>${i.name}</span><span class="mono">${i.barcode}</span><span>${i.price ?? ''}</span>`
    b.onclick = () => { addToQueue(i); $<HTMLInputElement>('q').value = ''; renderResults() }
    box.appendChild(b)
  })
}

function addToQueue(i: Item) {
  const ex = queue.find((x) => x.barcode === i.barcode)
  if (ex) ex.qty += 1
  else queue.push({ ...i, qty: 1 })
  renderQueue()
}

function renderQueue() {
  const box = $('queue')
  box.innerHTML = ''
  queue.forEach((it, idx) => {
    const r = document.createElement('div')
    r.className = 'qrow'
    r.innerHTML = `<span>${it.name}</span><span class="mono">${it.barcode}</span>`
    const n = document.createElement('input')
    n.type = 'number'; n.min = '0'; n.value = String(it.qty)
    n.oninput = () => { it.qty = Math.max(0, parseInt(n.value) || 0); renderPreview() }
    const x = document.createElement('button')
    x.textContent = '✕'
    x.onclick = () => { queue.splice(idx, 1); renderQueue() }
    r.append(n, x)
    box.appendChild(r)
  })
  renderPreview()
}

function renderPreview() {
  const pv = $('preview')
  pv.innerHTML = ''
  const first = queue[0]
  if (!first) return
  const cv = renderLabelCanvas({ ...first, expiryDate: first.expiry, qty: 1 }, opts())
  cv.style.width = `${cv.width * 2}px`
  cv.style.imageRendering = 'pixelated'
  pv.appendChild(cv)
}

async function print() {
  const labels: DirectLabel[] = queue.filter((q) => q.qty > 0).map((q) => ({ ...q, expiryDate: q.expiry }))
  if (!labels.length) return
  const job = buildTsplJob(labels, opts())
  let s = ''
  for (let i = 0; i < job.length; i += 0x8000) s += String.fromCharCode(...job.subarray(i, i + 0x8000))
  const r = await fetch('/print', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printer: $<HTMLSelectElement>('printer').value, data: btoa(s) }),
  })
  const j = await r.json().catch(() => ({}))
  $('msg').textContent = j.ok ? `✓ Sent ${labels.reduce((a, l) => a + l.qty, 0)} label(s)` : `Error: ${j.error || r.status}`
}

async function init() {
  const st = await fetch('/status').then((r) => r.json())
  const sel = $<HTMLSelectElement>('printer')
  ;(st.printers as string[]).forEach((p) => {
    const o = document.createElement('option'); o.value = o.textContent = p; sel.appendChild(o)
  })
  sel.value = (st.printers as string[]).find((p) => /xprinter|xp-|label|tsc|zebra/i.test(p)) || st.default
  const cat = await fetch('/catalog').then((r) => r.json()).catch(() => ({ items: [] }))
  items = cat.items || []
  pharmacy = cat.pharmacy || ''
  $('catinfo').textContent = items.length
    ? `${items.length.toLocaleString()} items saved ${cat.savedAt ? 'on ' + new Date(cat.savedAt).toLocaleString() : ''}`
    : 'No items saved yet — open FPS online once and click "Save items for offline".'
  loadPrefs()
  document.querySelectorAll('select, input').forEach((el) => el.addEventListener('change', () => { savePrefs(); renderPreview() }))
  $<HTMLInputElement>('q').addEventListener('input', renderResults)
  $('add').onclick = () => {
    const bc = $<HTMLInputElement>('mbc').value.trim()
    if (!bc) return
    addToQueue({ barcode: bc, name: $<HTMLInputElement>('mname').value.trim(), price: parseFloat($<HTMLInputElement>('mprice').value) || null, expiry: null })
  }
  $('print').onclick = () => { void print() }
}

void init()
