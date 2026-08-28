export const RECOVERY_STORAGE_KEY = 'talentbridge.recovery.v1'

type RecoveryLocation = { hash:string; pathname:string; search:string; replace:(url:string)=>void }

export function consumeRecoveryFragment(locationLike:RecoveryLocation=window.location){
  if(!locationLike.hash.startsWith('#access_token='))return null
  const params=new URLSearchParams(locationLike.hash.slice(1))
  if(params.get('type')!=='recovery')return null
  const token=params.get('access_token')
  if(!token)return null
  sessionStorage.setItem(RECOVERY_STORAGE_KEY,token)
  locationLike.replace(`${locationLike.pathname}#/reset-password`)
  return token
}
