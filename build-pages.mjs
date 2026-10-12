import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import path from 'node:path';

const output=path.resolve('dist');
if(path.dirname(output)!==path.resolve('.')||path.basename(output)!=='dist')throw new Error('Build output must stay in this project.');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp('public',output,{recursive:true});

let defaults=JSON.parse(await readFile('src/default-content.json','utf8'));
let published=null;
try { published=JSON.parse(await readFile('src/published-content.json','utf8')); }
catch(error) { if(error.code!=='ENOENT')throw error; }
if(published) {
  if(!published.content?.settings||published.content.chapters?.length!==defaults.chapters.length||published.content.chapters.some((chapter,i)=>chapter.id!==defaults.chapters[i].id)||!Number.isSafeInteger(published.revision))throw new Error('Invalid published content snapshot.');
  defaults=published.content;
}
const assets={};
for(const [file,type] of [['index.html','text/html; charset=utf-8'],['admin.js','text/javascript; charset=utf-8'],['admin.css','text/css; charset=utf-8']]) {
  assets[`/admin/${file}`]={body:await readFile(`public/admin/${file}`,'utf8'),type,binary:false};
}
const worker=await readFile('src/worker.mjs','utf8');
if((worker.match(/export default \{/g)||[]).length!==1)throw new Error('Unexpected CMS entry point.');
const runtime=await readFile('src/pages-runtime.mjs','utf8');
// The internal principal is injected only after a Cloudflare Access JWT is verified.
const prefix=`const DEFAULT_CONTENT=${JSON.stringify(defaults)};\nconst PUBLISHED_SNAPSHOT=${JSON.stringify(published)};\nconst ADMIN_EMAILS=["pages-access-verified@internal.invalid"];\nconst STATIC_ASSETS=${JSON.stringify(assets)};\n`;
await writeFile(path.join(output,'_worker.js'),prefix+worker.replace('export default {','const CMS = {')+'\n'+runtime+'\nexport default createPagesHandler(CMS,DEFAULT_CONTENT,ADMIN_EMAILS[0],PUBLISHED_SNAPSHOT);\n');
await writeFile(path.join(output,'_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:[]},null,2)+'\n');
console.log('Built Cloudflare Pages: dist/index.html, static assets and dist/_worker.js.');
