import fs from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

it('uses the TalentBridge accessToken callback and disables Supabase browser session management', () => {
  const sourcePath = path.resolve(process.cwd(), 'src/lib/supabase.ts')
  const source = fs.readFileSync(sourcePath, 'utf8')
  expect(source).toContain('accessToken: getValidAccessToken')
  expect(source).toContain('persistSession: false')
  expect(source).toContain('autoRefreshToken: false')
  expect(source).toContain('detectSessionInUrl: false')
})
