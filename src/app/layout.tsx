import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Block1',
  description: 'Block1 — 登录/注册 / Sign in or sign up',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={inter.variable}>
      <body className="font-sans antialiased min-h-screen bg-gradient-to-br from-indigo-50 to-fuchsia-50">
        {children}
      </body>
    </html>
  )
}
