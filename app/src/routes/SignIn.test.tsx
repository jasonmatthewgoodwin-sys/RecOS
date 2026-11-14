import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The password sign-in and the Profile page that sets it (docs/decisions.md,
// 14 November 2026). The auth service is stood in for here.

const auth = {
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
}

vi.mock('../lib/supabase', () => ({ supabase: { auth, rpc: vi.fn(async () => ({})) }, usingSampleData: false }))

const { AuthProvider } = await import('../lib/auth')
const { SignIn } = await import('./SignIn')
const { Profile } = await import('./settings/Profile')

afterEach(() => vi.clearAllMocks())

describe('SignIn with a password', () => {
  async function openPasswordForm() {
    render(
      <AuthProvider>
        <SignIn problem={null} />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with a password' }))
  }

  it('is the quietest choice: two fields, one primary button, no password asked for until chosen', async () => {
    render(
      <AuthProvider>
        <SignIn problem={null} />
      </AuthProvider>,
    )
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with a password' }))
    expect(screen.getByLabelText('Work email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(document.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('sends the address cleaned and says nothing on success', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null })
    await openPasswordForm()
    await userEvent.type(screen.getByLabelText('Work email'), '  Owner@Example.test ')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.test', password: 'correct horse battery' }))
    expect(screen.queryByText(/did not match/)).not.toBeInTheDocument()
  })

  it('gives one neutral line for a wrong address or a wrong password', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    await openPasswordForm()
    await userEvent.type(screen.getByLabelText('Work email'), 'stranger@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'not the password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Email or password did not match.')).toBeInTheDocument()
    expect(screen.queryByText(/does not have access/)).not.toBeInTheDocument()
  })
})

describe('Settings, Profile: setting the password', () => {
  function open() {
    render(
      <MemoryRouter initialEntries={['/settings/profile']}>
        <AuthProvider>
          <Profile />
        </AuthProvider>
      </MemoryRouter>,
    )
  }

  it('refuses a short password or two that differ, in words under the field', async () => {
    open()
    await userEvent.type(screen.getByLabelText('New password'), 'short')
    await userEvent.type(screen.getByLabelText('Again'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Use at least 12 characters')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('New password'))
    await userEvent.type(screen.getByLabelText('New password'), 'long enough password')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('The two do not match')).toBeInTheDocument()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('saves a good password and says so once', async () => {
    auth.updateUser.mockResolvedValue({ error: null })
    open()
    await userEvent.type(screen.getByLabelText('New password'), 'long enough password')
    await userEvent.type(screen.getByLabelText('Again'), 'long enough password')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: 'long enough password' }))
    expect(await screen.findByText('Saved. Use it next time.')).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })
})
