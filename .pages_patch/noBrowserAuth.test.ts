import fs from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
function files(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{const full=path.join(dir,entry.name);return entry.isDirectory()?files(full):/\.(ts|tsx)$/.test(entry.name)?[full]:[]})}
it('contains no forbidden browser Supabase Auth session calls',()=>{const root=path.resolve('src');const methodNames=['getUser','getSession','signInWithPassword','onAuthStateChange','signOut'];const forbidden=methodNames.map((name)=>`supabase.auth.${name}(`);const violations=files(root).flatMap((file)=>{const source=fs.readFileSync(file,'utf8');return forbidden.filter((needle)=>source.includes(needle)).map((needle)=>`${file}: ${needle}`)});expect(violations).toEqual([])})
