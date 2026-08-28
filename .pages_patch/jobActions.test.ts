import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))

import { publishJob } from './jobActions'

describe('publishJob', () => {
  beforeEach(() => mocks.rpc.mockReset())

  it('publishes through the secured transition_job RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'published' }, error: null })

    await publishJob('job-123')

    expect(mocks.rpc).toHaveBeenCalledWith('transition_job', {
      p_job_id: 'job-123',
      p_next: 'published',
    })
  })
})
