'use client'

import React, { createContext, useContext, useState, useTransition, useEffect, useRef } from 'react'
import { Globe, ChevronDown, Check } from 'lucide-react'
import zh from '@/locales/zh.json'
import en from '@/locales/en.json'

export type Language = 'zh' | 'en'

const dictionaries = { zh, en }

type LanguageContextType = {
  lang: Language
  t: (key: string, replacements?: Record<string, string | number>) => string
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({
  children,
  initialLang
}: {
  children: React.ReactNode
  initialLang: Language
}) {
  const [lang, setLangState] = useState<Language>(initialLang)
  const [, startTransition] = useTransition()

  // Sync state if initialLang changes (e.g., during server-side navigations)
  useEffect(() => {
    setLangState(initialLang)
  }, [initialLang])

  const setLanguage = (newLang: Language) => {
    if (newLang === lang) return
    setLangState(newLang)
    // Save to cookie so the server knows the language on subsequent requests
    document.cookie = `lang=${newLang}; path=/; max-age=31536000; SameSite=Lax`
    
    // Smoothly reload/refresh to apply changes globally
    startTransition(() => {
      window.location.reload()
    })
  }

  const t = (key: string, replacements?: Record<string, string | number>): string => {
    const dict = dictionaries[lang]
    let value = key.split('.').reduce((obj, k) => (obj as any)?.[k], dict) as string || key

    // Check database errors fallback
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

  return (
    <LanguageContext.Provider value={{ lang, t, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}

/**
 * Premium, glassmorphic Language Switcher Component
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLanguage } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo-100/40 bg-white/75 hover:bg-indigo-50/50 backdrop-blur-md transition-all text-xs font-semibold text-gray-700 shadow-sm cursor-pointer focus:outline-none"
      >
        <Globe className="h-3.5 w-3.5 text-indigo-500" />
        <span>{lang === 'zh' ? '简体中文' : 'English'}</span>
        <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 origin-top-right rounded-xl border border-indigo-100/50 bg-white/90 backdrop-blur-md shadow-lg shadow-indigo-100/40 p-1.5 focus:outline-none z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => {
              setLanguage('zh')
              setIsOpen(false)
            }}
            type="button"
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-semibold cursor-pointer transition-colors ${
              lang === 'zh'
                ? 'bg-indigo-50 text-indigo-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span>简体中文</span>
            {lang === 'zh' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
          </button>
          <button
            onClick={() => {
              setLanguage('en')
              setIsOpen(false)
            }}
            type="button"
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-semibold cursor-pointer transition-colors ${
              lang === 'en'
                ? 'bg-indigo-50 text-indigo-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span>English</span>
            {lang === 'en' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
          </button>
        </div>
      )}
    </div>
  )
}
