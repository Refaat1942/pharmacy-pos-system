import { useCallback, useEffect, useState } from 'react'
import api from './api'
import type { DigitalPlatform } from './digitalPlatforms'

let cached: DigitalPlatform[] | null = null
let inflight: Promise<DigitalPlatform[]> | null = null

export function invalidateDigitalPlatformsCache() {
  cached = null
  inflight = null
}

function fetchPlatforms(): Promise<DigitalPlatform[]> {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = api.get<DigitalPlatform[]>('/digital-platforms')
      .then((r) => {
        cached = r.data
        return r.data
      })
      .finally(() => { inflight = null })
  }
  return inflight
}

export function useDigitalPlatforms() {
  const [platforms, setPlatforms] = useState<DigitalPlatform[]>(cached || [])
  const [loading, setLoading] = useState(!cached)

  const reload = useCallback(() => {
    invalidateDigitalPlatformsCache()
    setLoading(true)
    return fetchPlatforms()
      .then((data) => { setPlatforms(data); return data })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (cached) {
      setPlatforms(cached)
      setLoading(false)
      return
    }
    fetchPlatforms()
      .then(setPlatforms)
      .catch(() => setPlatforms([]))
      .finally(() => setLoading(false))
  }, [])

  const byKey = useCallback(
    (key: string | null | undefined) => platforms.find((p) => p.platform_key === key),
    [platforms],
  )

  return { platforms, loading, reload, byKey }
}
