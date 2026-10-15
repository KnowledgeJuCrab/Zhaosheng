import {readFile,writeFile,mkdir,readdir,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {loadBuildMusic} from './music-build.mjs';
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.json':'application/json; charset=utf-8'};
const assets={};
async function collect(directory,prefix='') {
  for(const item of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,item.name),url=`${prefix}/${item.name}`;
    if(item.isDirectory())await collect(file,url);
    else{const bytes=await readFile(file);const type=types[path.extname(file)]||'application/octet-stream';const binary=(type.startsWith('image/')&&!type.includes('svg'))||type.startsWith('audio/');assets[url]={type,binary,body:binary?bytes.toString('base64'):bytes.toString('utf8')};}
  }
}
await collect('public');
const {music,bytes:musicBytes}=await loadBuildMusic();
assets['/music.json']={type:'application/json; charset=utf-8',binary:false,body:JSON.stringify(music)};
if(musicBytes)assets[music.src]={type:'audio/mpeg',binary:true,body:musicBytes.toString('base64')};
const defaults=JSON.parse(await readFile('src/default-content.json','utf8'));
let adminEmails=[];
if(process.env.ADMIN_EMAILS)adminEmails=process.env.ADMIN_EMAILS.split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
else try { adminEmails=JSON.parse(await readFile('src/admin-allowlist.json','utf8')); } catch(error) { if(error.code!=='ENOENT')throw error; }
if(!Array.isArray(adminEmails)||adminEmails.some(value=>typeof value!=='string'||!value.includes('@')))throw new Error('Invalid administrator configuration.');
const source=await readFile('src/worker.mjs','utf8');
const output=path.resolve('dist');
if(path.dirname(output)!==path.resolve('.')||path.basename(output)!=='dist')throw new Error('Build output must stay in this project.');
await rm(output,{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js',`const DEFAULT_CONTENT=${JSON.stringify(defaults)};\nconst DEFAULT_MUSIC=${JSON.stringify(music)};\nconst ADMIN_EMAILS=${JSON.stringify(adminEmails)};\nconst STATIC_ASSETS=${JSON.stringify(assets)};\n${source}`);
await mkdir('dist/.openai',{recursive:true});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log(`Built Worker: ${Object.keys(assets).length} embedded public assets, D1 content, R2 uploads.`);
