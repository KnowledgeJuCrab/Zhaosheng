import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createLocalWorkspace,LOCAL_ORIGIN} from './local-workspace.mjs';

const snapshot=JSON.parse(await readFile('src/published-content.json','utf8'));
const snapshotBefore=await readFile('src/published-content.json');
const directory=path.resolve('.local-data','workspace-test-'+crypto.randomUUID());
let workspace=await createLocalWorkspace({dataDirectory:directory});
const request=(pathname,options={})=>new Request(LOCAL_ORIGIN+pathname,options);
try {
  await test('local admin and frontend share all nine migrated chapters and original images',async()=>{
    const data=await (await workspace.fetch(request('/api/content'))).json();
    assert.deepEqual(data.content,snapshot.content);assert.equal(data.revision,snapshot.revision);assert.equal(data.localOnly,true);
    const admin=await workspace.fetch(request('/admin'));assert.equal(admin.status,200);assert.match(await admin.text(),/本地工作区/);
    assert.equal((await workspace.fetch(request('/'))).status,200);
    for(const chapter of data.content.chapters){
      const image=await workspace.fetch(request(chapter.image));assert.equal(image.status,200);
      assert.deepEqual(Buffer.from(await image.arrayBuffer()),await readFile('public'+chapter.image));
    }
  });
  await test('local save and upload persist after a restart without replacing the source snapshot',async()=>{
    const data=await (await workspace.fetch(request('/api/content'))).json();
    const bytes=await readFile('public'+data.content.chapters[1].image);
    const upload=await workspace.fetch(request('/api/images',{method:'POST',headers:{Origin:LOCAL_ORIGIN,'Content-Type':'image/jpeg'},body:bytes}));
    assert.equal(upload.status,201);const image=(await upload.json()).url;
    data.content.chapters[0].title='本地修改的主标题';data.content.chapters[0].image=image;
    const saved=await workspace.fetch(request('/api/content',{method:'PUT',headers:{Origin:LOCAL_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({content:data.content,revision:data.revision})}));
    assert.equal(saved.status,200);
    workspace.close();workspace=await createLocalWorkspace({dataDirectory:directory});
    const reopened=await (await workspace.fetch(request('/api/content'))).json();
    assert.equal(reopened.content.chapters[0].title,'本地修改的主标题');assert.equal(reopened.content.chapters[0].image,image);assert.equal(reopened.revision,data.revision+1);
    assert.deepEqual(Buffer.from(await (await workspace.fetch(request(image))).arrayBuffer()),bytes);
    assert.deepEqual(await readFile('src/published-content.json'),snapshotBefore);
  });
  await test('local identity is never granted to foreign hosts or cross-origin writes',async()=>{
    assert.equal((await workspace.fetch(new Request('https://attacker.example/api/content'))).status,403);
    assert.equal((await workspace.fetch(request('/admin',{headers:{Host:'attacker.example:4175'}}))).status,403);
    assert.equal((await workspace.fetch(request('/api/content',{method:'PUT',headers:{Origin:'https://attacker.example'},body:'{}'}))).status,403);
  });
}finally{workspace.close();}
