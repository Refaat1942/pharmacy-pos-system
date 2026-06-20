import api from './api'

export async function downloadApiPdf(
  path: string,
  filename: string,
  params?: Record<string, string | number | boolean | undefined>,
) {
  const clean: Record<string, string | number> = {}
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') clean[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v
    }
  }
  const res = await api.get(path, { params: clean, responseType: 'blob' })
  const blob = new Blob([res.data], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
