import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/components/providers/language-provider'

// mock 必须在 import 之前
vi.mock('@/app/actions/auth', () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn().mockResolvedValue(null),
  signOutAction: vi.fn(),
}))

import { signUpAction } from '@/app/actions/auth'
import { SignUpForm } from './sign-up-form'

describe('SignUpForm', () => {
  it('renders email, password, confirmPassword, submit', () => {
    render(
      <LanguageProvider initialLang="zh">
        <SignUpForm />
      </LanguageProvider>
    )
    expect(screen.getByLabelText(/邮箱|email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^密码$|^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/确认|confirm/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /注册|sign up/i })).toBeInTheDocument()
  })

  it('blocks submit when password too short (zod)', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="zh">
        <SignUpForm />
      </LanguageProvider>
    )
    await user.type(screen.getByLabelText(/邮箱|email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/^密码$|^password$/i), 'short')
    await user.type(screen.getByLabelText(/确认|confirm/i), 'short')
    await user.click(screen.getByRole('button', { name: /注册|sign up/i }))
    expect(signUpAction).not.toHaveBeenCalled()
  })

  it('blocks submit when confirmPassword mismatches', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="zh">
        <SignUpForm />
      </LanguageProvider>
    )
    await user.type(screen.getByLabelText(/邮箱|email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/^密码$|^password$/i), 'password1')
    await user.type(screen.getByLabelText(/确认|confirm/i), 'password2')
    await user.click(screen.getByRole('button', { name: /注册|sign up/i }))
    expect(signUpAction).not.toHaveBeenCalled()
  })

  it('blocks submit when password lacks digit', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="zh">
        <SignUpForm />
      </LanguageProvider>
    )
    await user.type(screen.getByLabelText(/邮箱|email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/^密码$|^password$/i), 'abcdefgh')
    await user.type(screen.getByLabelText(/确认|confirm/i), 'abcdefgh')
    await user.click(screen.getByRole('button', { name: /注册|sign up/i }))
    expect(signUpAction).not.toHaveBeenCalled()
  })

  it('calls signUpAction on valid submit', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="zh">
        <SignUpForm />
      </LanguageProvider>
    )
    await user.type(screen.getByLabelText(/邮箱|email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/^密码$|^password$/i), 'password1')
    await user.type(screen.getByLabelText(/确认|confirm/i), 'password1')
    await user.click(screen.getByRole('button', { name: /注册|sign up/i }))
    expect(signUpAction).toHaveBeenCalled()
  })
})