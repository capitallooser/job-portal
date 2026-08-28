import { describe, expect, it } from 'vitest'
import { resolveEffectiveRole } from './authProfileApi'

describe('effective role resolver', () => {
  it('selects the highest privilege role without deleting candidate', () => {
    expect(resolveEffectiveRole(['candidate', 'admin'])).toBe('admin')
    expect(resolveEffectiveRole(['candidate', 'super_admin'])).toBe('super_admin')
    expect(resolveEffectiveRole(['candidate'])).toBe('candidate')
  })
})
