export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function readMigratedStorage<T>(key: string, legacyKeys: readonly string[], fallback: T): T {
  try {
    const current = localStorage.getItem(key)
    if (current) return JSON.parse(current) as T

    for (const legacyKey of legacyKeys) {
      const legacy = localStorage.getItem(legacyKey)
      if (!legacy) continue
      const value = JSON.parse(legacy) as T
      localStorage.setItem(key, legacy)
      localStorage.removeItem(legacyKey)
      return value
    }
  } catch {
    return fallback
  }
  return fallback
}

export function writeStorage<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}
