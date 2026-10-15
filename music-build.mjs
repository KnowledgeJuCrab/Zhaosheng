import {readFile,access} from 'node:fs/promises';
import path from 'node:path';

// Include the locally saved BGM in a future build without publishing local credentials.
export async function loadBuildMusic(root=import.meta.dirname){
  let music=JSON.parse(await readFile(path.join(root,'public/music.json'),'utf8'));
  const database=path.join(root,'.local-preview/content.sqlite');
  try{
    await access(database);
    const {DatabaseSync}=await import('node:sqlite');
    const sqlite=new DatabaseSync(database,{readOnly:true});
    try{const row=sqlite.prepare('SELECT payload FROM site_content WHERE id = ?').get('music');if(row)music=JSON.parse(row.payload);}finally{sqlite.close();}
  }catch(error){if(error.code!=='ENOENT')throw error;}
  if(typeof music.enabled!=='boolean'||typeof music.title!=='string'||music.title.length>100||typeof music.src!=='string'||(music.src&&!/^\/audio\/[a-z0-9][a-z0-9-]{0,80}\.mp3$/.test(music.src))||(music.enabled&&!music.src))throw new Error('Invalid saved BGM configuration.');
  let bytes=null;
  if(music.src){
    try{bytes=await readFile(path.join(root,'public',music.src.slice(1)));}
    catch(error){if(error.code!=='ENOENT')throw error;bytes=await readFile(path.join(root,'.local-preview/images',path.basename(music.src)));}
    if(!bytes.length||bytes.length>20*1024*1024)throw new Error('The BGM file must be a nonempty MP3 no larger than 20 MB.');
  }
  return {music,bytes};
}
