import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {localBindings} from './local-storage.mjs';
import {exportMusicAssets} from './music-export.mjs';

export const LOCAL_ORIGIN='http://127.0.0.1:4175';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg'};

// Development only. This identity is used only by the loopback server, never by a build.
export async function createLocalWorkspace({root=import.meta.dirname,dataDirectory=path.join(root,'.local-preview'),exportMusic=dataDirectory===path.join(root,'.local-preview')}={}) {
  let snapshot;
  try {snapshot=JSON.parse(await readFile(path.join(root,'src/published-content.json'),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;snapshot={content:JSON.parse(await readFile(path.join(root,'src/default-content.json'),'utf8')),revision:0,updatedAt:null};}
  const env=await localBindings(dataDirectory);
  try {
    const existing=await env.DB.prepare('SELECT payload, revision, updated_at FROM site_content WHERE id = ?').bind('site').first();
    if(!existing){
      // Seed once, including the original image bytes. Restarts preserve local edits.
      for(const image of new Set(snapshot.content.chapters.map(chapter=>chapter.image))){
        if(!/^\/media\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(image))continue;
        const key=image.slice(7);
        const bytes=await readFile(path.join(root,'public','media',key));
        await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:types[path.extname(key)]}});
      }
      await env.DB.prepare('INSERT OR IGNORE INTO site_content (id, payload, revision, updated_at) VALUES (?, ?, ?, ?)').bind('site',JSON.stringify(snapshot.content),snapshot.revision,snapshot.updatedAt??'').run();
    }
    const identity='local-workspace@example.test';
    const music=JSON.parse(await readFile(path.join(root,'public/music.json'),'utf8'));
    const prefix=`const DEFAULT_CONTENT=${JSON.stringify(snapshot.content)};const DEFAULT_MUSIC=${JSON.stringify(music)};const ADMIN_EMAILS=${JSON.stringify([identity])};const STATIC_ASSETS={};`;
    const source=await readFile(path.join(root,'src/worker.mjs'),'utf8');
    const {default:cms}=await import('data:text/javascript;base64,'+Buffer.from(prefix+source).toString('base64'));
    const publicRoot=path.resolve(root,'public');

    async function fetch(request) {
      const url=new URL(request.url);
      // Reject foreign Host names before attaching the local fixture identity.
      if(url.origin!==LOCAL_ORIGIN||(request.headers.has('Host')&&request.headers.get('Host')!==new URL(LOCAL_ORIGIN).host))return new Response('Local workspace only',{status:403});
      if(url.pathname.startsWith('/audio/')){
        const response=await cms.fetch(request,env);
        if(response.status!==404)return response;
      }
      if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/media/')){
        const headers=new Headers(request.headers);
        headers.set('oai-authenticated-user-id','local-workspace-only');headers.set('oai-authenticated-user-email',identity);
        const response=await cms.fetch(new Request(request,{headers}),env);
        if(url.pathname==='/api/music'&&request.method==='PUT'&&response.ok&&exportMusic){
          const data=await response.json();
          try{await exportMusicAssets(root,data.music,env.BUCKET);data.buildReady=true;}
          catch{data.exportError='音乐已保存，但发布素材未能更新，请再次保存重试。';}
          return Response.json(data,{headers:response.headers});
        }
        if(url.pathname==='/api/content'&&request.method==='GET'&&response.ok)return Response.json({...await response.json(),localOnly:true},{headers:response.headers});
        return response;
      }
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
      let pathname;
      try {pathname=decodeURIComponent(url.pathname);}catch{return new Response('Not found',{status:404});}
      if(pathname==='/')pathname='/index.html';
      if(pathname==='/admin'||pathname==='/admin/')pathname='/admin/index.html';
      const file=path.resolve(publicRoot,'.'+pathname);
      if(!file.startsWith(publicRoot+path.sep))return new Response('Not found',{status:404});
      try {
        const info=await stat(file);if(!info.isFile())return new Response('Not found',{status:404});
        let bytes=await readFile(file);
        if(pathname==='/admin/index.html')bytes=Buffer.from(bytes.toString('utf8').replace('<div class="sidebar-note">','<div class="sidebar-note">本地工作区 · 保存仅影响本机。<br>'));
        const headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':String(bytes.length),'Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"};
        const range=request.headers.get('Range')?.match(/^bytes=(\d+)-(\d*)$/);
        if(range){
          const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
          if(start>=bytes.length||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});
          return new Response(request.method==='HEAD'?null:bytes.subarray(start,end+1),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${bytes.length}`}});
        }
        return new Response(request.method==='HEAD'?null:bytes,{headers});
      }catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return new Response('Not found',{status:404});throw error;}
    }
    return {fetch,close:()=>env.close(),dataDirectory};
  }catch(error){env.close();throw error;}
}
