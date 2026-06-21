'use client'

import { useActionState, useEffect, useRef } from 'react'
import { redeemKeyAction } from '@/app/actions/user-keys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, KeyRound } from 'lucide-react'

export function RedeemForm() {
  const [state, formAction, isPending] = useActionState(redeemKeyAction, null)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      ref.current?.reset()
    }
  }, [state])

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      {state?.error && (
        <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
          <AlertDescription className="text-xs">{state.error}</AlertDescription>
        </Alert>
      )}

      {state?.success && (
        <Alert className="bg-emerald-50 text-emerald-900 border-emerald-200">
          <AlertDescription className="text-xs font-semibold">
            兑换成功！获得积分 +{state.points}，当前余额：{state.newBalance}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="code" className="text-xs font-semibold text-gray-700">
          激活码 / Key Code
        </Label>
        <Input
          id="code"
          name="code"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          required
          className="h-11 bg-gray-50/50 uppercase tracking-wider font-mono text-center text-sm focus:bg-white focus:ring-indigo-500 focus:border-indigo-500"
        />
        {state?.fieldErrors?.code && (
          <p className="text-xs text-red-500 font-medium">{state.fieldErrors.code[0]}</p>
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
            兑换中 / Redeeming...
          </>
        ) : (
          <>
            <KeyRound className="h-4 w-4" />
            立即兑换 / Redeem Key
          </>
        )}
      </Button>
    </form>
  )
}
