import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { translations } from '../i18n/translations'
import type { Lang, TKey } from '../i18n/translations'

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey) => string
  monthNames: string[]
}

const LangContext = createContext<LangContextValue>({
  lang: 'tr',
  setLang: () => {},
  t: (k) => k,
  monthNames: translations.tr.monthNames,
})

export function LangProvider({ children }: { children: ReactNode }) {
  const stored = (localStorage.getItem('lang') as Lang) || 'tr'
  const [lang, setLangState] = useState<Lang>(stored)

  const setLang = (l: Lang) => {
    localStorage.setItem('lang', l)
    setLangState(l)
  }

  const t = (key: TKey): string => {
    const val = translations[lang][key]
    return typeof val === 'string' ? val : key
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t, monthNames: translations[lang].monthNames }}>
      {children}
    </LangContext.Provider>
  )
}

export const useLang = () => useContext(LangContext)
