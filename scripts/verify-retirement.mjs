import {retireModules} from './retire-modules.mjs'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const root=mkdtempSync(join(tmpdir(),'flownote-retire-test-'))
try{
 const source=join(root,'library'),backup=join(root,'backup')
 for(const kind of ['notes','wikis','goals','artifacts','collections']){mkdirSync(join(source,kind),{recursive:true});writeFileSync(join(source,kind,'sample.bin'),Buffer.from([0,1,2,254,255]))}
 retireModules(source,backup,true)
 assert(existsSync(join(source,'notes','sample.bin')));assert(existsSync(join(source,'wikis','sample.bin')))
 const manifest=JSON.parse(readFileSync(join(backup,'manifest.json'),'utf8'))
 for(const f of manifest.files){const bytes=readFileSync(join(backup,'files',f.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);assert(!existsSync(join(source,f.path)));const restored=join(root,'restore',f.path);mkdirSync(join(restored,'..'),{recursive:true});writeFileSync(restored,bytes);assert.deepEqual(readFileSync(restored),Buffer.from([0,1,2,254,255]))}
 assert(retireModules(source,backup,true).already_complete)
 console.log(JSON.stringify({ok:true,checks:['raw byte backup','SHA-256 re-read','restore equality','unrelated files untouched','idempotence']}))
}finally{rmSync(root,{recursive:true,force:true})}
