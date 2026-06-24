import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { getLanguage, getTranslations } from '@/lib/i18n'
import { LanguageProvider } from '@/components/providers/language-provider'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations()
  return {
    title: t('auth.metaTitle'),
    description: t('auth.metaDesc'),
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLanguage()

  return (
    <html lang={lang === 'en' ? 'en' : 'zh-CN'} className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-gradient-to-br from-indigo-50 to-fuchsia-50">
        <LanguageProvider initialLang={lang}>
          {children}
        </LanguageProvider>
      </body>
    </html>
  )
}

