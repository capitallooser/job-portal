import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

it('uses the TalentBridge accessToken callback and disables Supabase browser session management', () => {
  const source = fs.readFileSync(new URL('./supabase.ts', import.meta.url), 'utf8')
  expect(source).toContain('accessToken: getValidAccessToken')
  expect(source).toContain('persistSession: false')
  expect(source).toContain('autoRefreshToken: false')
  expect(source).toContain('detectSessionInUrl: false')
})
