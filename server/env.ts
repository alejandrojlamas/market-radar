export function readEnvironment(primary: string, legacy?: string) {
  const current = process.env[primary]
  if (current !== undefined) return current
  return legacy ? process.env[legacy] : undefined
}
