import { useEffect } from 'react'

/** Browser shortcuts that USB barcode wedges sometimes emit as scan suffixes. */
function isBlockedScannerKey(e: KeyboardEvent): boolean {
  const key = e.key
  // Legacy keyCode for F12 on some wedges
  if (e.keyCode === 123 || key === 'F12') return true
  if (/^F\d{1,2}$/.test(key)) return true
  if (e.ctrlKey && e.shiftKey) {
    const k = key.toUpperCase()
    if (k === 'I' || k === 'J' || k === 'C' || k === 'K' || k === 'U' || k === 'D') return true
  }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && key.toUpperCase() === 'U') return true
  if (e.metaKey && e.altKey && key.toLowerCase() === 'i') return true
  return false
}

export const POS_HOTKEY_EVENT = 'fps:hotkey'
const HOTKEYS = new Set(['F2', 'F4', 'F8', 'F9'])
/** Keys a scanner sends come a few ms apart; a person's key press never follows that fast. */
const SCAN_GAP_MS = 80

/**
 * Prevent barcode scanners from opening Chrome DevTools or other browser chrome.
 * Uses capture phase so wedge keystrokes are swallowed before the browser handles them.
 */
export function useBlockScannerBrowserShortcuts(enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    let lastKeyAt = 0
    const onKeyDown = (e: KeyboardEvent) => {
      const now = performance.now()
      const sincePrev = now - lastKeyAt
      lastKeyAt = now
      if (!isBlockedScannerKey(e)) return
      e.preventDefault()
      e.stopPropagation()
      // A person pressing F2/F4/F8/F9 gets the till hotkey; the same key arriving
      // straight after other keys is a wedge suffix and stays swallowed.
      if (HOTKEYS.has(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey && sincePrev > SCAN_GAP_MS) {
        window.dispatchEvent(new CustomEvent(POS_HOTKEY_EVENT, { detail: e.key }))
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled])
}
