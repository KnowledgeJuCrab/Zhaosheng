import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPagesHandler} from './src/pages-runtime.mjs';
const defaults=JSON.parse(await readFile('src/default-content.json','utf8'));
const principal='pages-access-verified@internal.invalid';
const req=(path,options={})=>new Request('https://example.pages.dev'+path,options);
const assets={fetch:async request=>new Response(new URL(request.url).pathname,{headers:{'Content-Type':'text/html'}})};
const cms={fetch:async request=>new Response(JSON.stringify({id:request.headers.get('oai-authenticated-user-id'),email:request.headers.get('oai-authenticated-user-email')}))};
const handler=createPagesHandler(cms,defaults,principal);
await test('Pages homepage and scripts are served through the static assets binding',async()=>{for(const path of ['/','/app.js','/styles.css'])assert.equal((await handler.fetch(req(path),{ASSETS:assets})).status,200);});
await test('Pages includes the preset BGM without a database and serves MP3 ranges through assets',async()=>{
  const music={enabled:true,title:'Dusk',src:'/audio/dusk-peter-jeremias.mp3'};
  const player=createPagesHandler(cms,defaults,principal,null,music);
  assert.deepEqual((await (await player.fetch(req('/api/music'),{})).json()).music,music);
  const response=await player.fetch(req(music.src,{headers:{Range:'bytes=0-1'}}),{ASSETS:{fetch:async request=>{assert.equal(request.headers.get('Range'),'bytes=0-1');return new Response(new Uint8Array([255,251]),{status:206,headers:{'Content-Type':'audio/mpeg','Content-Range':'bytes 0-1/100'}});}}});assert.equal(response.status,206);
  assert.equal((await player.fetch(req(music.src),{ASSETS:assets})).status,404);
  assert.equal((await player.fetch(req('/api/audio',{method:'POST'}),{})).status,503);
});
await test('Pages provides correct MP3 ranges when the deployed asset binding returns the complete file',async()=>{
  const bytes=Uint8Array.from({length:100},(_,i)=>i),etag='"music-version"';
  const env={ASSETS:{fetch:async()=>new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Content-Length':'100',ETag:etag,'Last-Modified':'Wed, 14 Oct 2026 12:00:00 GMT'}})}};
  for(const [range,start,end] of [['bytes=0-1',0,1],['bytes=70-',70,99],['bytes=-10',90,99],['bytes=90-999',90,99]]){
    const response=await handler.fetch(req('/audio/dusk.mp3',{headers:{Range:range}}),env);
    assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),`bytes ${start}-${end}/100`);
    assert.equal(response.headers.get('Content-Length'),String(end-start+1));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes.slice(start,end+1));
  }
  for(const range of ['bytes=100-','bytes=90-10','bytes=-0']){
    const response=await handler.fetch(req('/audio/dusk.mp3',{headers:{Range:range}}),env);
    assert.equal(response.status,416);assert.equal(response.headers.get('Content-Range'),'bytes */100');assert.equal((await response.arrayBuffer()).byteLength,0);
  }
  for(const [validator,status] of [[etag,206],['"older-song"',200],['W/'+etag,200],['Wed, 14 Oct 2026 12:00:00 GMT',206],['Tue, 13 Oct 2026 12:00:00 GMT',200]]){
    const response=await handler.fetch(req('/audio/dusk.mp3',{headers:{Range:'bytes=0-1','If-Range':validator}}),env);
    assert.equal(response.status,status);
  }
  const complete=await handler.fetch(req('/audio/dusk.mp3'),env);
  assert.equal(complete.status,200);assert.deepEqual(new Uint8Array(await complete.arrayBuffer()),bytes);
});
await test('Pages serves nine default chapters before storage is bound',async()=>{const response=await handler.fetch(req('/api/content'),{});assert.equal(response.status,200);assert.deepEqual((await response.json()).content,defaults);});
await test('Pages denies admin and writes when authentication is not configured',async()=>{assert.equal((await handler.fetch(req('/admin'),{})).status,503);assert.equal((await handler.fetch(req('/api/content',{method:'PUT'}),{})).status,503);});
await test('Pages strips spoofed former-platform identity headers',async()=>{const response=await handler.fetch(req('/api/content',{headers:{'oai-authenticated-user-id':'attacker','oai-authenticated-user-email':principal}}),{DB:{}});assert.deepEqual(await response.json(),{id:null,email:null});});
await test('Pages serves migrated image files without an R2 binding and rejects an HTML fallback',async()=>{
  const path='/media/00000000-0000-0000-0000-000000000001.png';
  const response=await handler.fetch(req(path),{ASSETS:{fetch:async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}})}});
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');
  assert.equal((await handler.fetch(req(path),{ASSETS:assets})).status,404);
  assert.equal((await handler.fetch(req('/media/not-an-image'),{ASSETS:assets})).status,404);
});

const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);publicKey.kid='test-key';
const issuer='https://pages-fixture.cloudflareaccess.com';
const env={ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:'fixture-audience',ADMIN_EMAILS:'owner@example.test',DB:{},BUCKET:{}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{assert.equal(url,issuer+'/cdn-cgi/access/certs');return Response.json({keys:[publicKey]});};
async function token(overrides={}) {
  const now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const body=encode({alg:'RS256',kid:'test-key'})+'.'+encode({iss:issuer,aud:[env.ACCESS_AUD],exp:now+600,iat:now,sub:'owner-id',email:'owner@example.test',...overrides});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(body));
  return body+'.'+Buffer.from(signature).toString('base64url');
}
try {
  await test('Pages accepts a signed Access token for the allowed administrator',async()=>{const response=await handler.fetch(req('/api/content',{method:'PUT',headers:{'Cf-Access-Jwt-Assertion':await token()}}),env);assert.equal(response.status,200);assert.deepEqual(await response.json(),{id:'owner-id',email:principal});});
  await test('Pages verifies the Access cookie on writes to the publicly readable content endpoint',async()=>{const response=await handler.fetch(req('/api/content',{method:'PUT',headers:{Cookie:'CF_Authorization='+await token()}}),env);assert.equal(response.status,200);assert.equal((await response.json()).id,'owner-id');});
  await test('Pages rejects tokens with a wrong audience, expiry, issuer or administrator',async()=>{for(const changes of [{aud:['wrong']},{exp:0},{iss:'https://attacker.example'},{email:'viewer@example.test'}])assert.equal((await handler.fetch(req('/admin',{headers:{'Cf-Access-Jwt-Assertion':await token(changes)}}),env)).status,403);});
  await test('Pages rejects a forged signature even with correct administrator claims',async()=>{const signed=await token(),parts=signed.split('.');parts[2]=Buffer.alloc(256,1).toString('base64url');assert.equal((await handler.fetch(req('/admin',{headers:{'Cf-Access-Jwt-Assertion':parts.join('.'),'oai-authenticated-user-id':'fake','oai-authenticated-user-email':principal}}),env)).status,403);});
} finally { globalThis.fetch=originalFetch; }
