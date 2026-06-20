'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { SignInForm } from './sign-in-form'
import { SignUpForm } from './sign-up-form'

type Tab = 'signin' | 'signup'

export function AuthCard({ defaultTab = 'signin' as Tab }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab)
  return (
    <Card className="w-full max-w-sm bg-white rounded-xl shadow-xl shadow-indigo-100/60 p-8 border-0">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="grid grid-cols-2 bg-transparent border-b border-gray-200 mb-6 h-auto p-0">
          <TabsTrigger
            value="signin"
            className="rounded-none bg-transparent shadow-none data-[state=active]:text-indigo-600 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 data-[state=active]:-mb-px py-3"
          >
            登录 / Sign in
          </TabsTrigger>
          <TabsTrigger
            value="signup"
            className="rounded-none bg-transparent shadow-none data-[state=active]:text-indigo-600 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 data-[state=active]:-mb-px py-3"
          >
            注册 / Sign up
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
