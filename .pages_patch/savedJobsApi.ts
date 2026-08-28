import { supabase } from '../../lib/supabase'
import { getCurrentUserId } from '../auth/sessionManager'
export async function saveJob(jobId:string){const candidateId=getCurrentUserId();if(!candidateId)throw new Error('Sign in required');const{error}=await supabase.from('saved_jobs').upsert({candidate_id:candidateId,job_id:jobId});if(error)throw error}
export async function unsaveJob(jobId:string){const candidateId=getCurrentUserId();if(!candidateId)return;const{error}=await supabase.from('saved_jobs').delete().eq('candidate_id',candidateId).eq('job_id',jobId);if(error)throw error}
export async function listSavedJobs(){const candidateId=getCurrentUserId();if(!candidateId)return[];const{data,error}=await supabase.from('saved_jobs').select('created_at,jobs(*,categories(name))').eq('candidate_id',candidateId).order('created_at',{ascending:false});if(error)throw error;return data??[]}
