'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'

import { signInAction, type FormState } from '@/app/actions/auth'
import { signInSchema, type SignInInput } from '@/lib/schemas/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const inputClass =
  'h-11 rounded-lg border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'

export function SignInForm() {
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    mode: 'onSubmit',
  })

  const onSubmit = handleSubmit((data) => {
    setServerError(null)
    const fd = new FormData()
    fd.append('email', data.email)
    fd.append('password', data.password)

    startTransition(async () => {
      const result = (await signInAction(null, fd)) as FormState
      if (result?.error) setServerError(result.error)
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="signin-email">邮箱 / Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          className={inputClass}
          aria-invalid={errors.email ? 'true' : 'false'}
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signin-password">密码 / Password</Label>
        <div className="relative">
          <Input
            id="signin-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className={`${inputClass} pr-10`}
            aria-invalid={errors.password ? 'true' : 'false'}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={showPassword ? '隐藏密码' : '显示密码'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-red-600">{errors.password.message}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md shadow-indigo-200"
      >
        {isPending ? '登录中… / Signing in…' : '登录 / Sign in'}
      </Button>

      <p className="text-center text-sm text-gray-500">
        还没账号?{' '}
        <Link href="/?tab=signup" className="text-indigo-600 hover:underline">
          去注册 / Sign up
        </Link>
      </p>
    </form>
  )
}
