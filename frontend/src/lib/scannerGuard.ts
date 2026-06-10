import { useEffect } from 'react'

/** Browser shortcuts that USB barcode wedges sometimes emit as scan suffixes. */
function isBlockedScannerKey(e: KeyboardEvent): boolean {
  const key = e.key
  if (key === 'F12') return true
  if (/^F\d{1,2}$/.test(key)) return true
  if (e.ctrlKey && e.shiftKey) {
    const k = key.toUpperCase()
    if (k === 'I' || k === 'J' || k === 'C' || k === 'K' || k === 'U') return true
  }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && key.toUpperCase() === 'U') return true
  return false
}

/**
 * Prevent barcode scanners from opening Chrome DevTools or other browser chrome.
 * Uses capture phase so wedge keystrokes are swallowed before the browser handles them.
 */
export function useBlockScannerBrowserShortcuts(enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isBlockedScannerKey(e)) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled])
}
