import { supabase } from '../../lib/supabase'
import { getCurrentUserId } from '../auth/sessionManager'
import type { JobDraftInput } from './jobSchemas'
import type { JobRecord } from './jobTypes'

function requireUserId(){const userId=getCurrentUserId();if(!userId)throw new Error('Sign in required');return userId}
function dbPayload(input:JobDraftInput){return {title:input.title,company_name:input.companyName||null,client_name:input.clientName||null,category_id:input.categoryId,short_summary:input.shortSummary,description:input.description,duration_text:input.durationText||null,duration_months:input.durationMonths,experience_min_years:input.experienceMinYears,experience_max_years:input.experienceMaxYears,employment_type:input.employmentType,work_mode:input.workMode,salary_text:input.salaryText||null,keywords:input.keywords,locations_text:input.locations,mandatory_skills_text:input.mandatorySkills,preferred_skills_text:input.preferredSkills,closes_at:input.closesAt}}
export async function createDraft(input:JobDraftInput,source?:{rawText?:string;aiGenerated?:boolean}){const userId=requireUserId();const{data,error}=await supabase.from('jobs').insert({...dbPayload(input),owner_id:userId,status:'draft',source_text:source?.rawText||null,ai_generated:source?.aiGenerated??false}).select().single();if(error)throw error;return data as JobRecord}
export async function updateDraft(jobId:string,input:JobDraftInput){const{data,error}=await supabase.from('jobs').update(dbPayload(input)).eq('id',jobId).select().single();if(error)throw error;return data as JobRecord}
export async function getJobForEdit(jobId:string){const{data,error}=await supabase.from('jobs').select('*').eq('id',jobId).single();if(error)throw error;return data as JobRecord}
export async function listManagedJobs(){const{data,error}=await supabase.from('jobs').select('*,categories(name)').is('deleted_at',null).order('created_at',{ascending:false});if(error)throw error;return data??[]}
