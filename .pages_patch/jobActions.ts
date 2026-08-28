import { supabase } from '../../lib/supabase'
import type { JobStatus } from '../../types/domain'
import { getJobForEdit, createDraft } from './jobsApi'
import { recordToDraft } from './jobMappers'

export function lifecycleActionLabel(status: JobStatus) {
  return ({
    draft: 'Save draft',
    pending_review: 'Submit for review',
    published: 'Publish job',
    closed: 'Close job',
    archived: 'Archive job',
  } as Record<JobStatus, string>)[status]
}

async function transition(jobId: string, next: JobStatus) {
  const { data, error } = await supabase.rpc('transition_job', {
    p_job_id: jobId,
    p_next: next,
  })
  if (error) throw error
  return data
}

export const publishJob = (jobId: string) => transition(jobId, 'published')
export const closeJob = (jobId: string) => transition(jobId, 'closed')
export const reopenJob = (jobId: string) => transition(jobId, 'published')
export const unpublishJob = (jobId: string) => transition(jobId, 'draft')
export const archiveJob = (jobId: string) => transition(jobId, 'archived')
export const submitForReview = (jobId: string) => transition(jobId, 'pending_review')

export async function softDeleteJob(jobId: string) {
  const { error } = await supabase.rpc('soft_delete_job', { p_job_id: jobId })
  if (error) throw error
}

export async function duplicateJob(jobId: string) {
  const j = await getJobForEdit(jobId)
  return createDraft(
    { ...recordToDraft(j), title: `${j.title} (Copy)` },
    { rawText: j.source_text ?? undefined, aiGenerated: j.ai_generated },
  )
}
