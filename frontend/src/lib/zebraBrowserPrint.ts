/**
 * Minimal client for Zebra Browser Print — the free helper app Zebra installs
 * on the PC. It exposes a local HTTP service (http://localhost:9100 or, for
 * HTTPS pages, https://localhost:9101 with a trusted cert) that lets a web app
 * enumerate attached Zebra printers and send raw ZPL directly to them.
 *
 * Everything here fails soft: if the helper isn't installed/reachable the
 * caller falls back to normal browser printing.
 */

export interface ZebraDevice {
  name: string
  uid: string
  connection: string
  deviceType: string
  provider?: string
  manufacturer?: string
  version?: number
}

let _baseResolved = false
let _base: string | null = null

function candidateBases(): string[] {
  // HTTPS pages can only reach the HTTPS endpoint (mixed-content rule).
  if (typeof location !== 'undefined' && location.protocol === 'https:') {
    return ['https://localhost:9101', 'https://127.0.0.1:9101']
  }
  return ['http://localhost:9100', 'http://127.0.0.1:9100', 'https://localhost:9101']
}

async function probe(base: string): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`${base}/available`, { method: 'GET', signal: ctrl.signal })
    clearTimeout(to)
    return res.ok
  } catch {
    return false
  }
}

/** Resolve (and cache) the reachable Browser Print base URL, or null. */
export async function getBrowserPrintBase(): Promise<string | null> {
  if (_baseResolved) return _base
  for (const c of candidateBases()) {
    // eslint-disable-next-line no-await-in-loop
    if (await probe(c)) {
      _base = c
      _baseResolved = true
      return _base
    }
  }
  _baseResolved = true
  _base = null
  return null
}

/** True when the Browser Print helper is reachable. */
export async function isBrowserPrintAvailable(): Promise<boolean> {
  return (await getBrowserPrintBase()) !== null
}

function asDeviceArray(data: any): ZebraDevice[] {
  if (!data) return []
  const list = data.printer || data.printers || data.device || data.devices || []
  return Array.isArray(list) ? (list as ZebraDevice[]) : []
}

export async function listPrinters(): Promise<ZebraDevice[]> {
  const base = await getBrowserPrintBase()
  if (!base) return []
  try {
    const res = await fetch(`${base}/available`)
    if (!res.ok) return []
    return asDeviceArray(await res.json())
  } catch {
    return []
  }
}

export async function getDefaultPrinter(): Promise<ZebraDevice | null> {
  const base = await getBrowserPrintBase()
  if (!base) return null
  try {
    const res = await fetch(`${base}/default?type=printer`)
    if (!res.ok) return null
    const d = await res.json()
    return d && d.uid ? (d as ZebraDevice) : null
  } catch {
    return null
  }
}

export async function sendZpl(device: ZebraDevice, zpl: string): Promise<void> {
  const base = await getBrowserPrintBase()
  if (!base) throw new Error('Zebra Browser Print is not available')
  const res = await fetch(`${base}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device, data: zpl }),
  })
  if (!res.ok) throw new Error(`Browser Print write failed (${res.status})`)
}

/** Send a command then read the printer's reply (used for SGD getvar queries). */
export async function sendThenRead(device: ZebraDevice, cmd: string): Promise<string> {
  const base = await getBrowserPrintBase()
  if (!base) throw new Error('Zebra Browser Print is not available')
  await fetch(`${base}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device, data: cmd }),
  })
  const res = await fetch(`${base}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device }),
  })
  return res.ok ? await res.text() : ''
}

/**
 * Best-effort read of the printer's configured media (label) size and dpi.
 * Returns dimensions in inches when the firmware reports them.
 */
export async function readLabelSize(
  device: ZebraDevice,
): Promise<{ widthIn?: number; heightIn?: number; dpi: number }> {
  let dpi = 203
  try {
    const dpiRaw = await sendThenRead(device, '! U1 getvar "head.resolution.in_dpi"\r\n')
    const d = parseInt(dpiRaw.replace(/["\s]/g, ''), 10)
    if (d === 203 || d === 300 || d === 600) dpi = d
  } catch {
    /* keep default */
  }
  const out: { widthIn?: number; heightIn?: number; dpi: number } = { dpi }
  try {
    const wRaw = await sendThenRead(device, '! U1 getvar "media.width"\r\n')
    const wDots = parseInt(wRaw.replace(/["\s]/g, ''), 10)
    if (wDots > 0) out.widthIn = Math.round((wDots / dpi) * 100) / 100
  } catch {
    /* ignore */
  }
  try {
    const lRaw = await sendThenRead(device, '! U1 getvar "media.length"\r\n')
    const lDots = parseInt(lRaw.replace(/["\s]/g, ''), 10)
    if (lDots > 0) out.heightIn = Math.round((lDots / dpi) * 100) / 100
  } catch {
    /* ignore */
  }
  return out
}
