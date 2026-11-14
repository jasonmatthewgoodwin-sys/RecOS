import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { resetQueries } from '../lib/query'

afterEach(() => {
  cleanup()
  resetQueries()
})
