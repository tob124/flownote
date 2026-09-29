import {readFileSync,writeFileSync,mkdirSync,realpathSync,lstatSync,readdirSync,existsSync,unlinkSync,rmdirSync} from 'node:fs'
import {resolve,join,relative,isAbsolute,dirname} from 'node:path'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const buckets=['goals','artifacts','collections']
export function retireModules(source,backup,execute=false){
 const root=realpathSync(source),target=resolve(backup)
 const inside=(parent,child)=>{const rel=relative(parent,child);return !rel || (!rel.startsWith('..')&&!isAbsolute(rel))}
 if(inside(root,target)||inside(target,root))throw new Error('备份必须位于笔记目录之外，且不能是其上级目录')
 const files=[],dirs=[]
 function walk(path){
  const st=lstatSync(path)
  if(st.isSymbolicLink() || !inside(root,realpathSync(path)))throw new Error('检测到链接或越界路径，停止清理')
  if(st.isDirectory()){dirs.push(path);for(const name of readdirSync(path).sort())walk(join(path,name))}
  else if(st.isFile()){const bytes=readFileSync(path);files.push({path:relative(root,path).replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)})}
  else throw new Error('检测到非普通文件，停止清理')
 }
 for(const bucket of buckets){const path=join(root,bucket);if(existsSync(path))walk(path)}
 if(!execute)return {source:root,backup:target,files,directories:dirs.length,dry_run:true}
 if(existsSync(target)){
  const prior=join(target,'manifest.json')
  if(!files.length && existsSync(prior)){const manifest=JSON.parse(readFileSync(prior,'utf8'));for(const f of manifest.files)if(hash(readFileSync(join(target,'files',f.path)))!==f.sha256)throw new Error('现有备份校验失败');return {...manifest,already_complete:true}}
  throw new Error('备份位置已存在，禁止覆盖')
 }
 mkdirSync(target,{recursive:true})
 for(const f of files){const from=join(root,f.path),to=join(target,'files',f.path);mkdirSync(dirname(to),{recursive:true});const bytes=readFileSync(from);if(hash(bytes)!==f.sha256)throw new Error('源文件已变化，保留全部源数据');writeFileSync(to,bytes,{flag:'wx'})}
 const manifest={schema_version:1,source:root,created_at:new Date().toISOString(),files,directories:dirs.map(p=>relative(root,p)),status:'verified'}
 writeFileSync(join(target,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'})
 const checked=JSON.parse(readFileSync(join(target,'manifest.json'),'utf8'))
 for(const f of checked.files){if(hash(readFileSync(join(target,'files',f.path)))!==f.sha256)throw new Error('备份字节校验失败');const p=join(root,f.path);if(lstatSync(p).isSymbolicLink() || !inside(root,realpathSync(p)) || hash(readFileSync(p))!==f.sha256)throw new Error('源文件已变化，停止清理')}
 // Only individually verified files are removed. Never recursively delete unknown contents.
 for(const f of checked.files){const p=join(root,f.path);if(lstatSync(p).isSymbolicLink() || hash(readFileSync(p))!==f.sha256)throw new Error('源文件已变化，停止清理');unlinkSync(p)}
 for(const path of dirs.reverse()){if(!inside(root,realpathSync(path)) || lstatSync(path).isSymbolicLink())throw new Error('目录已变化');rmdirSync(path)}
 writeFileSync(join(target,'completed.json'),JSON.stringify({completed_at:new Date().toISOString(),files:files.length},null,2),{flag:'wx'})
 return {backup:target,verified_files:files.length,removed_directories:buckets}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const source=process.argv[2],backup=process.argv[3]
 if(!source || !backup)throw new Error('Usage: node retire-modules.mjs SOURCE BACKUP [--execute]')
 console.log(JSON.stringify(retireModules(source,backup,process.argv.includes('--execute')),null,2))
}
