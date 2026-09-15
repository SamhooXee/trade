'use client'

import { useActionState, useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { generateKeysAction, deleteKeyAction } from '@/app/actions/admin-keys'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { signOutAction } from '@/app/actions/auth'
import { useLanguage } from '@/components/providers/language-provider'
import { LanguageSwitcher } from '@/components/providers/language-provider'
import {
  Copy,
  Trash2,
  KeyRound,
  Plus,
  ArrowLeft,
  Check,
  Loader2,
  Calendar,
  Layers,
  Coins,
  Search,
  User,
  LogOut
} from 'lucide-react'

interface ConsoleKey {
  id: string
  code: string
  points: number
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED'
  expiresAt: string
  createdAt: string
  redeemedAt: string | null
  redeemedBy: string | null
}

type Props = {
  email: string
  initialKeys: ConsoleKey[]
}

export function AdminConsole({ email, initialKeys }: Props) {
  const [formState, formAction, isPending] = useActionState(generateKeysAction, null)
  const [isDeleting, startDeleteTransition] = useTransition()
  const { t, lang } = useLanguage()
  
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const getEffectiveStatus = (key: ConsoleKey) => {
    if (key.status === 'ACTIVE' && new Date(key.expiresAt) <= new Date()) {
      return 'EXPIRED'
    }
    return key.status
  }

  const handleCopy = (id: string, code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = (id: string) => {
    if (confirm(t('admin.deleteConfirm'))) {
      startDeleteTransition(async () => {
        setDeleteError(null)
        const res = await deleteKeyAction(id)
        if (res.error) {
          setDeleteError(t(res.error))
        }
      })
    }
  }

  const getStatusBadge = (status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED') => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            {t('admin.statusActive')}
          </span>
        )
      case 'INACTIVE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
            {t('admin.statusRedeemed')}
          </span>
        )
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            {t('admin.statusExpired')}
          </span>
        )
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredKeys = initialKeys
    .filter((key) => {
      const effStatus = getEffectiveStatus(key)
      if (filter === 'ALL') return true
      return effStatus === filter
    })
    .filter((key) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        key.code.toLowerCase().includes(q) ||
        (key.redeemedBy && key.redeemedBy.toLowerCase().includes(q))
      )
    })

  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50/50 to-fuchsia-50/50">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/70 border-b border-indigo-100/40 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg text-white">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <span className="font-bold text-gray-900 tracking-tight text-lg">Trade</span>
            <span className="ml-1.5 px-2 py-0.5 text-[10px] font-semibold bg-indigo-100 text-indigo-700 rounded-full uppercase tracking-wider">Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-indigo-50/50 border border-indigo-100/40 rounded-full py-1.5 px-4">
            <User className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-medium text-indigo-900">{email}</span>
          </div>
          
          <LanguageSwitcher />

          <Link href="/dashboard" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> {t('common.back')}
          </Link>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm" className="text-gray-500 hover:text-rose-600 transition-colors cursor-pointer">
              <LogOut className="h-4 w-4 mr-1" /> {t('common.signOut')}
            </Button>
          </form>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column - Generation Form */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-0 shadow-lg shadow-indigo-100/60 bg-white/95 backdrop-blur-sm overflow-hidden">
            <div className="h-1.5 bg-indigo-600 w-full" />
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Plus className="h-5 w-5 text-indigo-600" /> {t('admin.generateKeys')}
              </CardTitle>
              <CardDescription className="text-xs text-gray-600">
                {t('admin.generateDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={formAction} className="space-y-4">
                {formState?.error && (
                  <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
                    <AlertDescription className="text-xs">{t(formState.error)}</AlertDescription>
                  </Alert>
                )}

                {formState?.success && (
                  <Alert className="bg-emerald-50 text-emerald-900 border-emerald-200">
                    <AlertDescription className="text-xs">
                      {t('admin.generateSuccess')}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="points" className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5 text-indigo-500" /> {t('admin.pointsPerKey')}
                  </Label>
                  <Input
                    id="points"
                    name="points"
                    type="number"
                    defaultValue="100"
                    min="1"
                    required
                    className="h-10 bg-gray-50/50 focus:bg-white focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  {formState?.fieldErrors?.points && (
                    <p className="text-xs text-red-500 font-medium">{t(formState.fieldErrors.points[0])}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="expiresIn" className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-indigo-500" /> {t('admin.expiresInDays')}
                  </Label>
                  <Input
                    id="expiresIn"
                    name="expiresIn"
                    type="number"
                    defaultValue="30"
                    min="1"
                    required
                    className="h-10 bg-gray-50/50 focus:bg-white focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  {formState?.fieldErrors?.expiresIn && (
                    <p className="text-xs text-red-500 font-medium">{t(formState.fieldErrors.expiresIn[0])}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="quantity" className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-indigo-500" /> {t('admin.quantity')}
                  </Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    defaultValue="1"
                    min="1"
                    max="100"
                    required
                    className="h-10 bg-gray-50/50 focus:bg-white focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  {formState?.fieldErrors?.quantity && (
                    <p className="text-xs text-red-500 font-medium">{t(formState.fieldErrors.quantity[0])}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md shadow-indigo-200 transition-all text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('admin.generating')}
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      {t('admin.generateKeys')}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Keys List Table */}
        <div className="lg:col-span-8 space-y-6">
          {deleteError && (
            <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200 shadow-sm">
              <AlertDescription className="text-xs">{deleteError}</AlertDescription>
            </Alert>
          )}

          <Card className="border-0 shadow-lg shadow-indigo-100/60 bg-white/95 backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-bold text-gray-900">{t('admin.keyManagement')}</CardTitle>
                  <CardDescription className="text-xs text-gray-600">
                    {t('admin.managementDesc')}
                  </CardDescription>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  {(['ALL', 'ACTIVE', 'INACTIVE', 'EXPIRED'] as const).map((item) => (
                    <Button
                      key={item}
                      variant="outline"
                      size="sm"
                      onClick={() => setFilter(item)}
                      className={`h-8 text-xs font-semibold px-3 py-1 cursor-pointer transition-all ${
                        filter === item
                          ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 hover:text-white'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {item === 'ALL' && t('admin.filterAll')}
                      {item === 'ACTIVE' && t('admin.filterActive')}
                      {item === 'INACTIVE' && t('admin.filterRedeemed')}
                      {item === 'EXPIRED' && t('admin.filterExpired')}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Search input */}
              <div className="relative mt-4">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('admin.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 bg-gray-50/50 focus:bg-white text-sm"
                />
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/80 border-y border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-3 font-semibold">{t('dashboard.keyCode')}</th>
                      <th className="px-6 py-3 font-semibold">{t('dashboard.pointsVal')}</th>
                      <th className="px-6 py-3 font-semibold">{t('admin.status')}</th>
                      <th className="px-6 py-3 font-semibold">{t('admin.expiresAt')}</th>
                      <th className="px-6 py-3 font-semibold">{t('admin.redeemedBy')}</th>
                      <th className="px-6 py-3 font-semibold">{t('admin.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {filteredKeys.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500 text-xs font-medium">
                          {t('admin.noKeys')}
                        </td>
                      </tr>
                    ) : (
                      filteredKeys.map((key) => {
                        const effStatus = getEffectiveStatus(key)
                        return (
                          <tr key={key.id} className="hover:bg-indigo-50/10 transition-colors group">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-gray-800 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded">
                                  {key.code}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCopy(key.id, key.code)}
                                  className="h-8 w-8 p-0 text-gray-400 hover:text-indigo-600 rounded-md cursor-pointer"
                                  title={copiedId === key.id ? t('admin.copied') : t('admin.copyTooltip')}
                                >
                                  {copiedId === key.id ? (
                                    <Check className="h-4 w-4 text-emerald-600 animate-bounce" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="font-bold text-gray-900 text-sm flex items-center gap-1">
                                <Coins className="h-3.5 w-3.5 text-amber-500" /> +{key.points}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {getStatusBadge(effStatus)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600">
                              {formatDate(key.expiresAt)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs">
                              {key.redeemedBy ? (
                                <div className="flex flex-col">
                                  <span className="font-semibold text-gray-800">{key.redeemedBy}</span>
                                  {key.redeemedAt && (
                                    <span className="text-[10px] text-gray-500">
                                      {t('admin.at')} {formatDate(key.redeemedAt)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(key.id)}
                                disabled={isDeleting}
                                className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer transition-colors"
                                title={t('admin.deleteTooltip')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
