import { describe, expect, it, vi } from 'vitest'
import { withTimeout } from './authApi'

describe('withTimeout', () => {
  it('returns a fast result normally', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok')
  })

  it('rejects instead of leaving signup spinning forever', async () => {
    vi.useFakeTimers()
    try {
      const never = new Promise<string>(() => {})
      const result = withTimeout(never, 1000)
      const rejection = expect(result).rejects.toThrow('Signup is taking longer than expected')

      await vi.advanceTimersByTimeAsync(1000)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('supports a sign-in specific timeout message', async () => {
    vi.useFakeTimers()
    try {
      const never = new Promise<string>(() => {})
      const result = withTimeout(never, 1000, 'Sign in is taking longer than expected. Please refresh and try again.')
      const rejection = expect(result).rejects.toThrow('Sign in is taking longer than expected')

      await vi.advanceTimersByTimeAsync(1000)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })
})
