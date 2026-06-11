/** Sub-feature option groups (mirrors backend FEATURE_OPTIONS_CATALOG). */

export interface FeatureOptionDef {
  key: string
  label: string
  default: boolean
}

export interface FeatureOptionGroup {
  feature: string
  label: string
  options: FeatureOptionDef[]
}

export type FeatureOptionsMap = Record<string, Record<string, boolean>>

export function buildFeatureOptionsState(
  enabledFeatures: string[],
  catalog: FeatureOptionGroup[],
  stored?: FeatureOptionsMap | null,
): FeatureOptionsMap {
  const out: FeatureOptionsMap = {}
  const enabled = new Set(enabledFeatures)
  for (const group of catalog) {
    if (!enabled.has(group.feature)) continue
    const base: Record<string, boolean> = {}
    for (const o of group.options) {
      base[o.key] = stored?.[group.feature]?.[o.key] ?? o.default
    }
    out[group.feature] = base
  }
  return out
}

export function isOptionEnabled(
  map: FeatureOptionsMap | null | undefined,
  feature: string,
  option: string,
  parentEnabled: boolean,
): boolean {
  if (!parentEnabled) return false
  const opts = map?.[feature]
  if (!opts || !(option in opts)) return true
  return Boolean(opts[option])
}
