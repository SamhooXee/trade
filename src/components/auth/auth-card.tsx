'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { SignInForm } from './sign-in-form'
import { SignUpForm } from './sign-up-form'
import { useLanguage } from '@/components/providers/language-provider'

type Tab = 'signin' | 'signup'

export function AuthCard({ defaultTab = 'signin' as Tab }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab)
  const { t } = useLanguage()

  return (
    <Card className="w-full max-w-sm bg-white rounded-xl shadow-xl shadow-indigo-100/60 p-8 border-0">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="grid grid-cols-2 bg-transparent mb-6 h-auto p-0 -mx-8 w-auto">
          <TabsTrigger
            value="signin"
            className="rounded-none bg-transparent shadow-none border-b-2 border-b-gray-200 data-[state=active]:text-indigo-600 data-[state=active]:border-b-indigo-600 border-t-0 border-x-0 py-3 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          >
            {t('auth.signIn')}
          </TabsTrigger>
          <TabsTrigger
            value="signup"
            className="rounded-none bg-transparent shadow-none border-b-2 border-b-gray-200 data-[state=active]:text-indigo-600 data-[state=active]:border-b-indigo-600 border-t-0 border-x-0 py-3 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          >
            {t('auth.signUp')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="signin" className="mt-0">
          <SignInForm />
        </TabsContent>
        <TabsContent value="signup" className="mt-0">
          <SignUpForm />
        </TabsContent>
      </Tabs>
    </Card>
  )
}

