/**
 * Render a barcode label to an exact-size canvas and convert it to ZPL.
 *
 * We rasterise the whole label (text + barcode/QR) to a monochrome bitmap and
 * embed it as a ZPL ^GFA graphic. This prints at the exact label size on a
 * Zebra printer and faithfully reproduces everything the user sees — including
 * Arabic pharmacy/product names, which native ZPL fonts cannot render.
 */

export interface LabelRenderOptions {
  widthIn: number
  heightIn: number
  dpi: number
  barcodeDataUrl: string
  pharmacy?: string
  name?: string
  expiry?: string | null
  price?: string | null
  isQR?: boolean
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) {
    s = s.slice(0, -1)
  }
  return `${s}…`
}

export async function renderLabelCanvas(opts: LabelRenderOptions): Promise<HTMLCanvasElement> {
  const dpi = opts.dpi || 203
  const W = Math.max(8, Math.round(opts.widthIn * dpi))
  const H = Math.max(8, Math.round(opts.heightIn * dpi))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  const pad = Math.round(H * 0.05)
  const cx = W / 2
  const maxW = W - pad * 2
  let y = pad

  const draw = (text: string, px: number, bold: boolean) => {
    ctx.font = `${bold ? '700 ' : ''}${px}px Arial, "Cairo", sans-serif`
    ctx.fillText(fitText(ctx, text, maxW), cx, y)
    y += Math.round(px * 1.25)
  }

  if (opts.pharmacy) draw(opts.pharmacy, Math.round(H * 0.085), true)
  if (opts.name) draw(opts.name, Math.round(H * 0.1), true)

  // Footer reserved for expiry / price
  const footerText = [opts.expiry ? `Exp ${opts.expiry}` : '', opts.price || '']
    .filter(Boolean)
    .join('   ')
  const footerH = footerText ? Math.round(H * 0.1) : 0

  // Barcode / QR fills the remaining space.
  const img = await loadImage(opts.barcodeDataUrl)
  const availH = H - pad - y - footerH
  const availW = maxW
  if (img.width && img.height && availH > 4) {
    let dw: number
    let dh: number
    if (opts.isQR) {
      const s = Math.min(availW, availH)
      dw = s
      dh = s
    } else {
      const scale = Math.min(availW / img.width, availH / img.height)
      dw = img.width * scale
      dh = img.height * scale
    }
    ctx.drawImage(img, cx - dw / 2, y + (availH - dh) / 2, dw, dh)
  }

  if (footerText) {
    ctx.font = `700 ${Math.round(H * 0.08)}px Arial, "Cairo", sans-serif`
    ctx.textBaseline = 'bottom'
    ctx.fillText(fitText(ctx, footerText, maxW), cx, H - pad)
  }

  return canvas
}

/** Convert a black-on-white canvas to a ZPL label (^GFA graphic). */
export function canvasToZpl(canvas: HTMLCanvasElement, copies = 1): string {
  const W = canvas.width
  const H = canvas.height
  const ctx = canvas.getContext('2d')!
  const data = ctx.getImageData(0, 0, W, H).data
  const rowBytes = Math.ceil(W / 8)
  const total = rowBytes * H
  let hex = ''
  for (let yy = 0; yy < H; yy++) {
    for (let b = 0; b < rowBytes; b++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const x = b * 8 + bit
        let dark = 0
        if (x < W) {
          const i = (yy * W + x) * 4
          const a = data[i + 3]
          const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
          dark = a > 128 && lum < 128 ? 1 : 0
        }
        byte = (byte << 1) | dark
      }
      hex += byte.toString(16).padStart(2, '0')
    }
  }
  const n = Math.max(1, Math.min(500, copies | 0))
  return (
    `^XA^LH0,0^PW${W}^LL${H}` +
    `^FO0,0^GFA,${total},${total},${rowBytes},${hex}^FS` +
    `^PQ${n},0,1,Y^XZ`
  )
}
