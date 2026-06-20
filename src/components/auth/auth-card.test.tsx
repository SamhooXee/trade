import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/app/actions/auth', () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  signOutAction: vi.fn(),
}))

import { AuthCard } from './auth-card'

describe('AuthCard', () => {
  it('renders two tabs (signin / signup)', () => {
    render(<AuthCard />)
    expect(screen.getByRole('tab', { name: /登录.*sign in/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /注册.*sign up/i })).toBeInTheDocument()
  })

  it('shows sign-in form by default', () => {
    render(<AuthCard />)
    expect(screen.getByLabelText(/邮箱.*email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /登录.*sign in/i })).toBeInTheDocument()
  })

  it('switches to sign-up form when signup tab clicked', async () => {
    const user = userEvent.setup()
    render(<AuthCard />)
    await user.click(screen.getByRole('tab', { name: /注册.*sign up/i }))
    expect(screen.getByRole('button', { name: /注册.*sign up/i })).toBeInTheDocument()
  })
})
