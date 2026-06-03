import { useEffect, useState } from 'react'

const LEADER_KEY = 'pharma_tab_leader'
const LEADER_TTL_MS = 4000

let tabId = ''
function getTabId(): string {
  if (!tabId) {
    tabId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  return tabId
}

/** One browser tab acts as leader for shared polling (prescriptions, etc.). */
export function useTabLeader(scope: string): boolean {
  const [isLeader, setIsLeader] = useState(false)
  const key = `${LEADER_KEY}:${scope}`

  useEffect(() => {
    const id = getTabId()
    const claim = () => {
      const now = Date.now()
      let leader: { id: string; ts: number } | null = null
      try {
        const raw = localStorage.getItem(key)
        leader = raw ? JSON.parse(raw) : null
      } catch {
        leader = null
      }
      if (!leader || now - leader.ts > LEADER_TTL_MS) {
        leader = { id, ts: now }
        localStorage.setItem(key, JSON.stringify(leader))
      } else if (leader.id === id) {
        leader = { id, ts: now }
        localStorage.setItem(key, JSON.stringify(leader))
      }
      setIsLeader(leader.id === id)
    }

    claim()
    const timer = setInterval(claim, 2000)
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) claim()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      clearInterval(timer)
      window.removeEventListener('storage', onStorage)
    }
  }, [key])

  return isLeader
}
