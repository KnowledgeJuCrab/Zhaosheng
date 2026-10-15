import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {localBindings} from './local-storage.mjs';

const defaults=JSON.parse(await readFile('src/default-content.json','utf8'));
const initial={enabled:false,title:'背景音乐',src:''},owner='music-fixture@example.test';
const prefix='const DEFAULT_CONTENT='+JSON.stringify(defaults)+';const DEFAULT_MUSIC='+JSON.stringify(initial)+';const ADMIN_EMAILS='+JSON.stringify([owner])+';const STATIC_ASSETS={};';
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(prefix+await readFile('src/worker.mjs','utf8')).toString('base64'));
const directory=path.resolve('.local-data','music-test-'+crypto.randomUUID());
let env=await localBindings(directory),audioUrl;
const origin='https://music.example.test';
const headers={'oai-authenticated-user-id':'fixture','oai-authenticated-user-email':owner,Origin:origin};
const request=(route,options={})=>new Request(origin+route,{headers,...options});
const call=(route,options)=>worker.fetch(request(route,options),env);
const frame=new Uint8Array(417);frame.set([255,251,144,100]);
const mp3=new Uint8Array(417*3);for(let i=0;i<3;i++)mp3.set(frame,i*417);
try{
  await test('MP3 upload verifies MPEG frames and keeps writes restricted to the owner',async()=>{
    assert.equal((await call('/api/audio',{method:'POST',headers:{'Content-Type':'audio/mpeg'},body:mp3})).status,403);
    assert.equal((await call('/api/audio',{method:'POST',headers:{...headers,'Content-Type':'audio/mpeg'},body:new Uint8Array([73,68,51,4,0,0,0,0,0,0])})).status,400);
    assert.equal((await call('/api/audio',{method:'POST',headers:{...headers,'Content-Type':'audio/mpeg','Content-Length':String(20*1024*1024+1)},body:mp3})).status,413);
    const upload=await call('/api/audio',{method:'POST',headers:{...headers,'Content-Type':'audio/mpeg'},body:mp3});assert.equal(upload.status,201);audioUrl=(await upload.json()).url;
  });
  await test('saved global music survives restarts and does not alter the nine chapters',async()=>{
    const before=await (await call('/api/content')).json();
    const music={enabled:true,title:'测试背景音乐',src:audioUrl};
    const saved=await call('/api/music',{method:'PUT',headers,body:JSON.stringify({music,revision:0})});assert.equal(saved.status,200);
    env.close();env=await localBindings(directory);
    assert.deepEqual((await (await call('/api/music',{headers:{}})).json()).music,music);
    assert.deepEqual(await (await call('/api/content')).json(),before);
    assert.equal((await call('/api/music',{method:'PUT',headers,body:JSON.stringify({music,revision:0})})).status,409);
  });
  await test('music rejects missing or external files and supports disabling the BGM',async()=>{
    assert.equal((await call('/api/music',{method:'PUT',headers,body:'null'})).status,400);
    for(const src of ['https://external.example/song.mp3','/audio/missing.mp3',''])assert.equal((await call('/api/music',{method:'PUT',headers,body:JSON.stringify({revision:1,music:{enabled:true,title:'invalid',src}})})).status,400);
    const saved=await call('/api/music',{method:'PUT',headers,body:JSON.stringify({revision:1,music:{enabled:false,title:'测试背景音乐',src:audioUrl}})});assert.equal(saved.status,200);
    assert.equal((await (await call('/api/music')).json()).music.enabled,false);
  });
  await test('MP3 streaming supplies correct partial responses for playback and seeking',async()=>{
    for(const [range,start,end] of [['bytes=0-99',0,99],['bytes=417-',417,mp3.length-1],['bytes=-10',mp3.length-10,mp3.length-1]]){
      const response=await call(audioUrl,{headers:{Range:range}});assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes '+start+'-'+end+'/'+mp3.length);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),mp3.slice(start,end+1));
    }
    assert.equal((await call(audioUrl,{headers:{Range:'bytes=999999-'}})).status,416);
    const head=await call(audioUrl,{method:'HEAD',headers:{}});assert.equal(head.headers.get('Content-Type'),'audio/mpeg');assert.equal(head.headers.get('Content-Length'),String(mp3.length));assert.equal((await head.arrayBuffer()).byteLength,0);
  });
  await test('the provided Dusk file is accepted as an MP3 without changing its bytes',async()=>{
    const bytes=await readFile('public/audio/dusk-peter-jeremias.mp3');
    const response=await call('/api/audio',{method:'POST',headers:{...headers,'Content-Type':'audio/mpeg'},body:bytes});assert.equal(response.status,201);
    const url=(await response.json()).url;assert.deepEqual(Buffer.from(await (await call(url,{headers:{}})).arrayBuffer()),bytes);
  });
}finally{env.close();}
