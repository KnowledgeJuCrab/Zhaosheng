import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';

export async function exportMusicAssets(root,music,bucket){
  const publicRoot=path.resolve(root,'public');
  if(music.src){
    if(!/^\/audio\/[a-z0-9][a-z0-9-]{0,80}\.mp3$/.test(music.src))throw new Error('Invalid music asset path.');
    const target=path.resolve(publicRoot,music.src.slice(1));
    if(path.dirname(target)!==path.join(publicRoot,'audio'))throw new Error('Music must stay in this project.');
    try{await readFile(target);}catch(error){
      if(error.code!=='ENOENT')throw error;
      const object=await bucket.get(path.basename(music.src));if(!object)throw new Error('Music file is missing.');
      await mkdir(path.dirname(target),{recursive:true});await writeFile(target,object.body,{flag:'wx'});
    }
  }
  const target=path.join(publicRoot,'music.json'),temporary=target+'.'+crypto.randomUUID()+'.tmp';
  try{await writeFile(temporary,JSON.stringify(music,null,2)+'\n',{flag:'wx'});await rename(temporary,target);}
  catch(error){try{await unlink(temporary);}catch{}throw error;}
}
