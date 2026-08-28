import type { ParsedJobDraft } from '../ai-import/aiTypes'; import type { JobDraftInput } from './jobSchemas'; import type { JobRecord } from './jobTypes'

export type PublishField='title'|'categoryId'|'description'
export type PublishIssue={field:PublishField;message:string}

export function validateJobForPublish(job:Pick<JobRecord,'title'|'category_id'|'description'>):PublishIssue[]{
  const issues:PublishIssue[]=[]
  if(!job.title?.trim()||job.title.trim().length<2)issues.push({field:'title',message:'Job title is required before publishing'})
  if(!job.category_id)issues.push({field:'categoryId',message:'Category is required before publishing'})
  if(!job.description?.trim()||job.description.trim().length<20)issues.push({field:'description',message:'Job description must be at least 20 characters'})
  return issues
}

export function parsedToDraft(p:ParsedJobDraft,categoryId:string|null=null):JobDraftInput{return {title:p.title,companyName:p.companyName,clientName:p.clientName,categoryId,shortSummary:p.shortSummary,description:p.description,durationText:p.durationText,durationMonths:p.durationMonths,experienceMinYears:p.experienceMinYears,experienceMaxYears:p.experienceMaxYears,employmentType:p.employmentType,workMode:p.workMode,salaryText:p.salaryText,locations:p.locations,mandatorySkills:p.mandatorySkills,preferredSkills:p.preferredSkills,keywords:p.keywords,closesAt:null}}
export function recordToDraft(j:JobRecord):JobDraftInput{return {title:j.title,companyName:j.company_name,clientName:j.client_name,categoryId:j.category_id,shortSummary:j.short_summary,description:j.description,durationText:j.duration_text,durationMonths:j.duration_months,experienceMinYears:j.experience_min_years,experienceMaxYears:j.experience_max_years,employmentType:j.employment_type,workMode:j.work_mode,salaryText:j.salary_text,locations:j.locations_text??[],mandatorySkills:j.mandatory_skills_text??[],preferredSkills:j.preferred_skills_text??[],keywords:j.keywords??[],closesAt:j.closes_at}}
