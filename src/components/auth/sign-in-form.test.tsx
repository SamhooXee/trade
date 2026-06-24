import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/components/providers/language-provider'

// mock 必须在 import 之前
vi.mock('@/app/actions/auth', () => ({
  signInAction: vi.fn().mockResolvedValue(null),
  signUpAction: vi.fn(),
  signOutAction: vi.fn(),
}))

import { signInAction } from '@/app/actions/auth'
import { SignInForm } from './sign-in-form'

describe('SignInForm', () => {
  it('renders email, password, submit button', () => {
    render(
      <LanguageProvider initialLang="zh">
        <SignInForm />
      </LanguageProvider>
    )
    expect(screen.getByLabelText(/邮箱|email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^密码$|^password$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /登录|sign in/i })).toBeInTheDocument()
  })

  it('shows zod error for invalid email (RHF blocks submit)', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="zh">
        <SignInForm />
      </LanguageProvider>
    )
    await user.type(screen.getByLabelText(/邮箱|email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/^密码$|^password$/i), '123456')
    await user.click(screen.getByRole('button', { name: /登录|sign in/i }))
    // RHF 客户端校验,action 不应被调用
    expect(signInAction).not.toHaveBeenCalled()
    expect(await screen.findByText(/邮箱格式不正确|invalid email/i)).toBeInTheDocument()
  })

  it('shows zod error for password < 6', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="zh">
        <SignInForm />
      </LanguageProvider>
    )
    await user.type(screen.getByLabelText(/邮箱|email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/^密码$|^password$/i), '12345')
    await user.click(screen.getByRole('button', { name: /登录|sign in/i }))
    expect(signInAction).not.toHaveBeenCalled()
  })

  it('calls signInAction on valid submit', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="zh">
        <SignInForm />
      </LanguageProvider>
    )
    await user.type(screen.getByLabelText(/邮箱|email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/^密码$|^password$/i), '123456')
    await user.click(screen.getByRole('button', { name: /登录|sign in/i }))
    expect(signInAction).toHaveBeenCalled()
  })

})

