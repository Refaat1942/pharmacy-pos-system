export function exportCSV<T>(
  filename: string,
  rows: T[],
  columns: { label: string; value: (r: T) => string | number | null | undefined }[],
) {
  const esc = (v: string | number | null | undefined) =>
    `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = columns.map((c) => esc(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => esc(c.value(r))).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
