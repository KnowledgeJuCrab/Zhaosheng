import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createLocalWorkspace,LOCAL_ORIGIN} from './local-workspace.mjs';
import {loadBuildMusic} from './music-build.mjs';

test('a saved local BGM is exported with its bytes for a later deployment, even without local storage',async()=>{
  const root=path.resolve('.local-data','music-export-test-'+crypto.randomUUID());
  await mkdir(path.join(root,'src'),{recursive:true});await mkdir(path.join(root,'public'),{recursive:true});
  await writeFile(path.join(root,'src/default-content.json'),await readFile('src/default-content.json'));
  await writeFile(path.join(root,'src/worker.mjs'),await readFile('src/worker.mjs'));
  await writeFile(path.join(root,'public/music.json'),JSON.stringify({enabled:false,title:'背景音乐',src:''}));
  const workspace=await createLocalWorkspace({root});
  const headers={Origin:LOCAL_ORIGIN,'Content-Type':'audio/mpeg'};
  const frame=new Uint8Array(417);frame.set([255,251,144,100]);const bytes=new Uint8Array(834);bytes.set(frame);bytes.set(frame,417);
  try{
    const upload=await workspace.fetch(new Request(LOCAL_ORIGIN+'/api/audio',{method:'POST',headers,body:bytes}));assert.equal(upload.status,201);
    const music={enabled:true,title:'发布用背景音乐',src:(await upload.json()).url};
    const saved=await workspace.fetch(new Request(LOCAL_ORIGIN+'/api/music',{method:'PUT',headers,body:JSON.stringify({music,revision:0})}));assert.equal((await saved.json()).buildReady,true);
    assert.deepEqual(JSON.parse(await readFile(path.join(root,'public/music.json'),'utf8')),music);
    assert.deepEqual(new Uint8Array(await readFile(path.join(root,'public',music.src.slice(1)))),bytes);
    assert.deepEqual((await loadBuildMusic(root)).music,music);
    const clean=path.join(root,'clean-checkout');await mkdir(path.join(clean,'public/audio'),{recursive:true});
    await writeFile(path.join(clean,'public/music.json'),JSON.stringify(music));await writeFile(path.join(clean,'public',music.src.slice(1)),bytes);
    const built=await loadBuildMusic(clean);assert.deepEqual(built.music,music);assert.deepEqual(new Uint8Array(built.bytes),bytes);
  }finally{workspace.close();}
});
