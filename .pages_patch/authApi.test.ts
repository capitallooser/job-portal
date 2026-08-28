import { describe, expect, it, vi } from 'vitest'
import { withTimeout } from './authApi'

describe('withTimeout', () => {
  it('returns a fast signup result normally', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok')
  })

  it('rejects instead of leaving signup spinning forever', async () => {
    vi.useFakeTimers()
    const never = new Promise<string>(() => {})
    const result = withTimeout(never, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(result).rejects.toThrow('Signup is taking longer than expected')
    vi.useRealTimers()
  })
})
