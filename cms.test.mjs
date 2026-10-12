import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {localBindings} from './local-storage.mjs';
// Only test fixtures can administer this isolated test database. No real account grant.
const owner='fixture-owner@example.test';
const defaults=JSON.parse(await readFile('src/default-content.json','utf8'));
const workerSource=await readFile('src/worker.mjs','utf8');
const prefix=`const DEFAULT_CONTENT=${JSON.stringify(defaults)};const ADMIN_EMAILS=${JSON.stringify([owner])};const STATIC_ASSETS={'/admin/index.html':{body:'admin',type:'text/html',binary:false}};`;
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(prefix+workerSource).toString('base64'));
const directory=path.resolve('.local-data','test-'+crypto.randomUUID());await mkdir(directory,{recursive:true});
let env=await localBindings(directory);let imageUrl;
const auth={'oai-authenticated-user-id':'fixture-id','oai-authenticated-user-email':owner,Origin:'https://example.test'};
function request(route,method='GET',data,headers=auth){return new Request('https://example.test'+route,{method,headers,...(data!==undefined?{body:typeof data==='string'||data instanceof Uint8Array?data:JSON.stringify(data)}:{})});}
async function call(...args){return worker.fetch(request(...args),env);}
try {
await test('initial content has nine chapters without runtime schema creation',async()=>{const response=await call('/api/content');const data=await response.json();assert.equal(response.status,200);assert.equal(data.revision,0);assert.equal(data.content.chapters.length,9);assert.deepEqual(data.content,defaults);});
await test('anonymous and non-admin visitors cannot access admin or write content',async()=>{assert.equal((await call('/admin','GET',undefined,{})).status,403);assert.equal((await call('/api/content','PUT',{revision:0,content:defaults},{})).status,403);assert.equal((await call('/api/content','PUT',{revision:0,content:defaults},{...auth,'oai-authenticated-user-email':'viewer@example.test'})).status,403);assert.equal((await call('/admin')).status,200);});
await test('cross-origin write is rejected',async()=>{assert.equal((await call('/api/content','PUT',{revision:0,content:defaults},{...auth,Origin:'https://other.test'})).status,403);});
await test('malformed content and unsupported image formats fail without changes',async()=>{assert.equal((await call('/api/content','PUT','{broken')).status,400);assert.equal((await call('/api/content','PUT',{revision:0,content:{...defaults,chapters:[]}})).status,400);assert.equal((await call('/api/images','POST','<svg></svg>',{...auth,'Content-Type':'image/svg+xml'})).status,415);assert.equal((await call('/api/images','POST',new Uint8Array([1,2,3]),{...auth,'Content-Type':'image/png'})).status,400);});
await test('large payloads are bounded',async()=>{assert.equal((await call('/api/content','PUT','x'.repeat(33000))).status,413);assert.equal((await call('/api/images','POST',new Uint8Array(8*1024*1024+1),{...auth,'Content-Type':'image/jpeg'})).status,413);});
await test('image upload stores bytes and returns a durable URL',async()=>{const bytes=await readFile('public/assets/campus.jpg');const response=await call('/api/images','POST',bytes,{...auth,'Content-Type':'image/jpeg'});assert.equal(response.status,201);imageUrl=(await response.json()).url;const image=await call(imageUrl);assert.equal(image.headers.get('Content-Type'),'image/jpeg');assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);});
await test('save persists text and uploaded image in one atomic revision',async()=>{const content=structuredClone(defaults);content.chapters[0].title='新标题\n新篇章';content.chapters[0].image=imageUrl;const response=await call('/api/content','PUT',{revision:0,content});assert.equal(response.status,200);const data=await response.json();assert.equal(data.revision,1);assert.equal(data.content.chapters[0].title,content.chapters[0].title);assert.equal(data.content.chapters[0].image,imageUrl);});
await test('stale windows cannot overwrite a newer revision',async()=>{const response=await call('/api/content','PUT',{revision:0,content:defaults});assert.equal(response.status,409);assert.equal((await (await call('/api/content')).json()).content.chapters[0].image,imageUrl);});
await test('unuploaded or remote image references are rejected',async()=>{const content=structuredClone(defaults);content.chapters[0].image='/media/'+crypto.randomUUID()+'.jpg';assert.equal((await call('/api/content','PUT',{revision:1,content})).status,400);content.chapters[0].image='https://unsafe.example/image.svg';assert.equal((await call('/api/content','PUT',{revision:1,content})).status,400);});
await test('database and image values survive a reopened connection',async()=>{env.close();env=await localBindings(directory);const data=await (await call('/api/content')).json();assert.equal(data.revision,1);assert.equal(data.content.chapters[0].title,'新标题\n新篇章');assert.equal((await call(imageUrl)).status,200);});
for(const count of [5,7])await test(`${count} saved chapters expand to nine without resetting user content or newer modules`,async()=>{
  const legacy=await localBindings(path.join(directory,'legacy-'+count));
  try {
    const saved={settings:{...defaults.settings,brand:'用户的学校'},chapters:structuredClone(defaults.chapters.slice(0,count))};
    saved.chapters[0].name='用户的校园';saved.chapters[0].title='已保存的标题';saved.chapters[0].image=imageUrl;saved.chapters[0].positionX=23;
    await legacy.DB.prepare('INSERT INTO site_content (id, payload, revision, updated_at) VALUES (?, ?, ?, ?)').bind('site',JSON.stringify(saved),3,'2026-10-06T00:00:00Z').run();
    const bindings={DB:legacy.DB,BUCKET:env.BUCKET};
    const data=await (await worker.fetch(request('/api/content'),bindings)).json();
    assert.equal(data.revision,3);assert.equal(data.content.chapters.length,9);assert.deepEqual(data.content.chapters.slice(0,count),saved.chapters);assert.deepEqual(data.content.settings,saved.settings);
    assert.equal(JSON.parse((await legacy.DB.prepare('SELECT payload FROM site_content WHERE id = ?').bind('site').first()).payload).chapters.length,count);
    data.content.chapters[count].title='用户的新模块内容';
    const response=await worker.fetch(request('/api/content','PUT',{revision:3,content:data.content}),bindings);assert.equal(response.status,200);
    const readBack=await (await worker.fetch(request('/api/content'),bindings)).json();assert.equal(readBack.revision,4);assert.equal(readBack.content.chapters.length,9);assert.equal(readBack.content.chapters[count].title,'用户的新模块内容');assert.deepEqual(readBack.content.chapters.slice(0,count),saved.chapters);
    const oldDraft=structuredClone(saved);oldDraft.chapters[0].title='旧窗口的修改';
    const legacySave=await worker.fetch(request('/api/content','PUT',{revision:4,content:oldDraft}),bindings);assert.equal(legacySave.status,200);
    const legacyResult=await legacySave.json();assert.equal(legacyResult.content.chapters.length,9);assert.equal(legacyResult.content.chapters[count].title,'用户的新模块内容');assert.equal(legacyResult.content.chapters[0].title,'旧窗口的修改');
    const staleSave=await worker.fetch(request('/api/content','PUT',{revision:4,content:oldDraft}),bindings);assert.equal(staleSave.status,409);
  }finally{legacy.close();}
});
await test('empty and whitespace-only titles persist with an uploaded ninth-chapter image after reopening storage',async()=>{
  const data=await (await call('/api/content')).json();data.content.chapters[0].title='  \n  ';data.content.chapters[8].title='';data.content.chapters[8].image=imageUrl;
  const saved=await call('/api/content','PUT',{revision:data.revision,content:data.content});assert.equal(saved.status,200);
  env.close();env=await localBindings(directory);
  const readBack=await (await call('/api/content')).json();assert.equal(readBack.content.chapters.length,9);assert.equal(readBack.content.chapters[0].title,'');assert.equal(readBack.content.chapters[8].title,'');assert.equal(readBack.content.chapters[8].image,imageUrl);
});
await test('optional titles still require bounded text and chapter names remain required',async()=>{
  const data=await (await call('/api/content')).json();const content=structuredClone(data.content);
  for(const title of [null,'x'.repeat(121)]){content.chapters[8].title=title;assert.equal((await call('/api/content','PUT',{revision:data.revision,content})).status,400);}
  content.chapters[8].title='';content.chapters[8].name='';assert.equal((await call('/api/content','PUT',{revision:data.revision,content})).status,400);
  assert.equal((await (await call('/api/content')).json()).revision,data.revision);
});
await test('font sizes persist independently and old editor payloads preserve them',async()=>{
  const data=await (await call('/api/content')).json();
  data.content.chapters[0].titleSize=72;data.content.chapters[0].bodySize=20;
  data.content.chapters[8].titleSize=32;data.content.chapters[8].bodySize=12;
  assert.equal((await call('/api/content','PUT',{revision:data.revision,content:data.content})).status,200);
  env.close();env=await localBindings(directory);
  const reopened=await (await call('/api/content')).json();
  assert.equal(reopened.content.chapters[0].titleSize,72);assert.equal(reopened.content.chapters[0].bodySize,20);
  assert.equal(reopened.content.chapters[8].titleSize,32);assert.equal(reopened.content.chapters[8].bodySize,12);
  for(const chapter of reopened.content.chapters){delete chapter.titleSize;delete chapter.bodySize;}
  const oldSave=await call('/api/content','PUT',{revision:reopened.revision,content:reopened.content});assert.equal(oldSave.status,200);
  const preserved=await oldSave.json();assert.equal(preserved.content.chapters[0].titleSize,72);assert.equal(preserved.content.chapters[8].bodySize,12);
});
await test('older stored content receives font defaults without rewriting the record',async()=>{
  const legacy=await localBindings(path.join(directory,'typography'));
  try{
    const content=structuredClone(defaults);for(const chapter of content.chapters){delete chapter.titleSize;delete chapter.bodySize;}
    content.chapters[0].title='';content.chapters[0].body='已保存的正文';
    await legacy.DB.prepare('INSERT INTO site_content (id, payload, revision, updated_at) VALUES (?, ?, ?, ?)').bind('site',JSON.stringify(content),6,'2026-10-08T00:00:00Z').run();
    const migrated=await (await worker.fetch(request('/api/content'),legacy)).json();
    assert.equal(migrated.content.chapters[0].titleSize,60);assert.equal(migrated.content.chapters[0].bodySize,16);
    assert.equal(migrated.content.chapters[0].title,'');assert.equal(migrated.content.chapters[0].body,'已保存的正文');
    const raw=JSON.parse((await legacy.DB.prepare('SELECT payload FROM site_content WHERE id = ?').bind('site').first()).payload);assert.equal(raw.chapters[0].titleSize,undefined);
  }finally{legacy.close();}
});
await test('invalid font sizes cannot change saved content',async()=>{
  const data=await (await call('/api/content')).json();
  for(const [key,value] of [['titleSize',23],['titleSize',81],['titleSize',60.5],['titleSize',null],['titleSize','60px'],['bodySize',11],['bodySize',29]]){
    const content=structuredClone(data.content);content.chapters[0][key]=value;
    assert.equal((await call('/api/content','PUT',{revision:data.revision,content})).status,400);
  }
  assert.equal((await (await call('/api/content')).json()).revision,data.revision);
});
await test('title and body positions persist independently and older payloads retain them',async()=>{
  const data=await (await call('/api/content')).json();
  Object.assign(data.content.chapters[0],{titleX:18,titleY:-24,bodyX:-12,bodyY:31});
  data.content.chapters[0].tag='旧版本短句';
  const saved=await call('/api/content','PUT',{revision:data.revision,content:data.content});assert.equal(saved.status,200);
  assert.equal((await saved.json()).content.chapters[0].tag,undefined);
  env.close();env=await localBindings(directory);const reopened=await (await call('/api/content')).json();
  for(const [key,value] of Object.entries({titleX:18,titleY:-24,bodyX:-12,bodyY:31}))assert.equal(reopened.content.chapters[0][key],value);
  for(const chapter of reopened.content.chapters)for(const key of ['titleX','titleY','bodyX','bodyY'])delete chapter[key];
  const old=await call('/api/content','PUT',{revision:reopened.revision,content:reopened.content});assert.equal(old.status,200);
  const kept=await old.json();assert.equal(kept.content.chapters[0].titleY,-24);assert.equal(kept.content.chapters[0].bodyY,31);
});
await test('invalid text positions fail without changing the saved revision',async()=>{
  const data=await (await call('/api/content')).json();
  for(const value of [-51,51,1.5,null,'25%']){const content=structuredClone(data.content);content.chapters[0].titleX=value;assert.equal((await call('/api/content','PUT',{revision:data.revision,content})).status,400);}
  assert.equal((await (await call('/api/content')).json()).revision,data.revision);
});
await test('storage failure returns an explicit error instead of success',async()=>{const response=await worker.fetch(request('/api/content'),{});assert.equal(response.status,503);assert.match((await response.json()).error,/暂时不可用/);});
}finally{env.close();}
