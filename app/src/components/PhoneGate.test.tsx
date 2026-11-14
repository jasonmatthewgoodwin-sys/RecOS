import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../App'
import { AuthProvider } from '../lib/auth'

// P1-48: on a phone only Home, Inbox and Follow-ups show in full (25.8).

const owner = { firstName: 'Jason', role: 'owner' as const }

function pretendPhone(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width') ? matches : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
}

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <SignedIn session={owner} />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  // @ts-expect-error jsdom has no matchMedia; put it back the way it was
  delete window.matchMedia
})

describe('phone layout', () => {
  it('shows Best on a laptop for pages other than Home, Inbox and Follow-ups', async () => {
    pretendPhone(true)
    open('/people/signals')
    expect(await screen.findByText('Best on a laptop')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Get in touch/ })).not.toBeInTheDocument()
  })

  it('keeps Follow-ups and Inbox in full on a phone, and everything on a laptop', async () => {
    pretendPhone(true)
    const { unmount } = open('/leads/follow-ups')
    expect(await screen.findByRole('heading', { name: 'Business development' })).toBeInTheDocument()
    expect(screen.queryByText('Best on a laptop')).not.toBeInTheDocument()
    unmount()
    pretendPhone(false)
    open('/people/signals')
    expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument()
    expect(screen.queryByText('Best on a laptop')).not.toBeInTheDocument()
  })
})
