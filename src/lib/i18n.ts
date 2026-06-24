import { cookies } from 'next/headers'
import zh from '@/locales/zh.json'
import en from '@/locales/en.json'

export type Language = 'zh' | 'en'

const dictionaries = { zh, en }

export async function getLanguage(): Promise<Language> {
  try {
    const cookieStore = await cookies()
    const lang = cookieStore.get('lang')?.value
    return lang === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

export async function getTranslations() {
  const lang = await getLanguage()
  const dict = dictionaries[lang]

  const t = (key: string, replacements?: Record<string, string | number>): string => {
    // Traverse nested keys (e.g., "auth.signIn")
    let value = key.split('.').reduce((obj, k) => (obj as any)?.[k], dict) as string || key

    // If key not found, fallback to check if it's a direct database error mapping
    if (value === key && key in dict.db_errors) {
      value = (dict.db_errors as any)[key]
    }

    if (replacements) {
      return Object.entries(replacements).reduce(
        (str, [k, val]) => str.replace(`{${k}}`, String(val)),
        value
      )
    }

    return value
  }

  return { lang, t }
}
