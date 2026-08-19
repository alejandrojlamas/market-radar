import { deleteSetting, listSettings, readSetting, writeSetting } from './db'

export type ApiSettingKey =
  | 'POLYGON_API_KEY'
  | 'TWELVEDATA_API_KEY'
  | 'ALPHAVANTAGE_API_KEY'
  | 'DEEPSEEK_API_KEY'
  | 'DEEPSEEK_MODEL'

export const API_SETTING_KEYS: ApiSettingKey[] = [
  'POLYGON_API_KEY',
  'TWELVEDATA_API_KEY',
  'ALPHAVANTAGE_API_KEY',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
]

const DEFAULTS: Partial<Record<ApiSettingKey, string>> = {
  DEEPSEEK_MODEL: 'deepseek-v4-pro',
}

export function configuredValue(key: ApiSettingKey) {
  return process.env[key] || readSetting(key) || DEFAULTS[key] || ''
}

export function saveApiSettings(values: Partial<Record<ApiSettingKey, string>>) {
  for (const key of API_SETTING_KEYS) {
    const value = values[key]
    if (value === undefined) continue
    const trimmed = value.trim()
    if (trimmed) writeSetting(key, trimmed, key !== 'DEEPSEEK_MODEL')
  }
  return apiSettingsStatus()
}

export function clearApiSetting(key: ApiSettingKey) {
  deleteSetting(key)
  return apiSettingsStatus()
}

export function apiSettingsStatus() {
  const stored = new Map(listSettings().map((setting) => [setting.key, setting]))
  return {
    items: API_SETTING_KEYS.map((key) => {
      const envConfigured = Boolean(process.env[key])
      const storedItem = stored.get(key)
      const value = configuredValue(key)
      return {
        key,
        configured: Boolean(value),
        source: envConfigured ? 'env' : storedItem ? 'app' : DEFAULTS[key] ? 'default' : 'missing',
        updatedAt: storedItem?.updatedAt ?? null,
        displayValue: key === 'DEEPSEEK_MODEL' ? value : value ? '••••••••' : '',
      }
    }),
  }
}
