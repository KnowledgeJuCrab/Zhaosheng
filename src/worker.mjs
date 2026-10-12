const IDS = DEFAULT_CONTENT.chapters.map(chapter=>chapter.id);
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_CONTENT = 32 * 1024;
const CACHE_HEADERS = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
class HttpError extends Error { constructor(status, message) { super(message); this.status=status; } }
function json(data, status=200) { return new Response(JSON.stringify(data), {status,headers:{...CACHE_HEADERS,'Content-Type':'application/json; charset=utf-8'}}); }
function database(env) { if (!env.DB) throw new HttpError(503,'内容服务暂时不可用，请稍后重试。'); return env.DB; }
function bucket(env) { if (!env.BUCKET) throw new HttpError(503,'图片服务暂时不可用，请稍后重试。'); return env.BUCKET; }
function admin(request) {
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  return !!request.headers.get('oai-authenticated-user-id') && ADMIN_EMAILS.includes(email);
}
function protect(request) { if (!admin(request)) throw new HttpError(403,'请使用网站管理员账号登录。'); }
function sameOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new HttpError(403,'请求来源无效，请重新打开后台。');
}
async function readLimited(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) throw new HttpError(413,`文件或内容超过允许大小。`);
  if (!request.body) throw new HttpError(400,'内容不能为空。');
  const reader=request.body.getReader(); const chunks=[]; let total=0;
  while (true) {const {value,done}=await reader.read();if(done) break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new HttpError(413,'文件或内容超过允许大小。');}chunks.push(value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
function string(value,name,max=300,required=false) {
  if(typeof value!=='string' || value.length>max || (required&&!value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new HttpError(400,`${name}不能为空或超过 ${max} 个字符。`);
  return value.trim();
}
function normalizeContent(input) {
  if(!input||typeof input!=='object'||!input.settings||!Array.isArray(input.chapters)||input.chapters.length!==IDS.length) throw new HttpError(400,`需要网站设置及完整的 ${IDS.length} 个篇章。`);
  const settings={};
  for(const key of Object.keys(DEFAULT_CONTENT.settings)) settings[key]=string(input.settings[key],key,key==='description'?300:100,['brand','browserTitle'].includes(key));
  const chapters=input.chapters.map((chapter,i)=>{
    if(!chapter || chapter.id!==IDS[i]) throw new HttpError(400,'篇章编号或顺序无效。');
    const result={id:IDS[i]};
    for(const key of ['name','category','caption','title','body','alt']) result[key]=string(chapter[key],key,key==='body'?600:key==='title'?120:100,['name','alt'].includes(key));
    result.image=string(chapter.image,'图片地址',160,true);
    if(!/^\/assets\/(campus|students|library)\.jpg$/.test(result.image)&&!/^\/media\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(result.image)) throw new HttpError(400,'请通过后台上传图片。');
    for(const key of ['positionX','positionY']) {if(!Number.isFinite(chapter[key])||chapter[key]<0||chapter[key]>100) throw new HttpError(400,'图片位置必须为 0 到 100。');result[key]=chapter[key];}
    for(const [key,min,max] of [['titleSize',24,80],['bodySize',12,28]]) {
      if(!Number.isInteger(chapter[key])||chapter[key]<min||chapter[key]>max)throw new HttpError(400,`${key==='titleSize'?'主标题':'正文'}字号必须为 ${min} 到 ${max} 的整数。`);
      result[key]=chapter[key];
    }
    for(const key of ['titleX','titleY','bodyX','bodyY']){
      if(!Number.isInteger(chapter[key])||chapter[key]<-50||chapter[key]>50)throw new HttpError(400,'文字移动位置必须为 -50 到 50 的整数。');
      result[key]=chapter[key];
    }
    return result;
  });
  return {settings,chapters};
}
async function getContent(env) {
  const row=await database(env).prepare('SELECT payload, revision, updated_at FROM site_content WHERE id = ?').bind('site').first();
  if(!row) return {content:DEFAULT_CONTENT,revision:0,updatedAt:null};
  const saved=JSON.parse(row.payload);
  const existing=new Map(saved.chapters.map(chapter=>[chapter.id,chapter]));
  // Add missing chapters without rewriting or resetting previously saved content.
  const content={...saved,chapters:DEFAULT_CONTENT.chapters.map(chapter=>({...chapter,...existing.get(chapter.id)}))};
  return {content,revision:row.revision,updatedAt:row.updated_at};
}
async function saveContent(request,env) {
  protect(request);sameOrigin(request);
  let body;try{body=JSON.parse(new TextDecoder().decode(await readLimited(request,MAX_CONTENT)));}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'内容格式无效。');}
  if(!Number.isSafeInteger(body.revision)||body.revision<0)throw new HttpError(400,'内容版本无效，请重新加载。');
  let incoming=body.content;
  // Editors opened before expansion may still submit five- or seven-chapter drafts.
  // Keep all later chapters; optimistic revision checks still apply below.
  const incomingCount=incoming?.chapters?.length;
  const legacyChapters=Array.isArray(incoming?.chapters)&&[5,7].includes(incomingCount)&&incomingCount<IDS.length;
  const layoutKeys=['titleSize','bodySize','titleX','titleY','bodyX','bodyY'];
  const missingLayout=Array.isArray(incoming?.chapters)&&incoming.chapters.some(chapter=>chapter&&layoutKeys.some(key=>chapter[key]===undefined));
  if(legacyChapters||missingLayout) {
    const current=await getContent(env);
    const previous=new Map(current.content.chapters.map(chapter=>[chapter.id,chapter]));
    const chapters=legacyChapters?[...incoming.chapters,...current.content.chapters.slice(incomingCount)]:incoming.chapters;
    incoming={...incoming,chapters:chapters.map(chapter=>{
      const saved=previous.get(chapter?.id);if(!saved)return chapter;
      const result={...chapter};for(const key of layoutKeys)if(result[key]===undefined)result[key]=saved[key];return result;
    })};
  }
  const content=normalizeContent(incoming);
  // Confirm all uploaded files exist before publishing their references.
  for(const source of new Set(content.chapters.map(c=>c.image).filter(s=>s.startsWith('/media/')))) {
    if(!await bucket(env).head(source.slice(7)))throw new HttpError(400,'上传的图片不存在，请重新上传。');
  }
  const updatedAt=new Date().toISOString();const payload=JSON.stringify(content);const revision=body.revision+1;
  const db=database(env);
  const result=body.revision===0
    ? await db.prepare('INSERT OR IGNORE INTO site_content (id, payload, revision, updated_at) VALUES (?, ?, ?, ?)').bind('site',payload,revision,updatedAt).run()
    : await db.prepare('UPDATE site_content SET payload = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(payload,revision,updatedAt,'site',body.revision).run();
  if(result.meta.changes!==1)throw new HttpError(409,'内容已在其他窗口更新。请先重新加载，再进行修改。');
  return json({content,revision,updatedAt});
}
async function uploadImage(request,env) {
  protect(request);sameOrigin(request);
  const type=request.headers.get('Content-Type')?.split(';')[0];
  const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  if(!extensions[type])throw new HttpError(415,'请上传 JPG、PNG 或 WebP 图片。');
  const bytes=await readLimited(request,MAX_IMAGE);
  const valid=type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255
    :type==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)
    :new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
  if(!valid)throw new HttpError(400,'图片格式与文件内容不一致。');
  const key=`${crypto.randomUUID()}.${extensions[type]}`;
  await bucket(env).put(key,bytes,{httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'}});
  return json({url:`/media/${key}`,size:bytes.length},201);
}
function staticResponse(path) {
  const asset=STATIC_ASSETS[path];if(!asset)return new Response('Not found',{status:404});
  const body=asset.binary?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;
  return new Response(body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Cache-Control':asset.type.startsWith('image/')?'public, max-age=86400':'no-cache','Content-Security-Policy':"default-src 'self'; img-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"}});
}
export default {
  async fetch(request,env) {
    const path=new URL(request.url).pathname;
    try {
      if(path==='/api/content') {
        if(request.method==='GET')return json(await getContent(env));
        if(request.method==='PUT')return await saveContent(request,env);
        return json({error:'请求方法无效。'},405);
      }
      if(path==='/api/images')return request.method==='POST'?await uploadImage(request,env):json({error:'请求方法无效。'},405);
      if(path.startsWith('/api/'))return json({error:'接口不存在。'},404);
      if(path.startsWith('/media/')) {
        if(!/^\/media\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path))return new Response('Not found',{status:404});
        if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
        const object=await bucket(env).get(path.slice(7));if(!object)return new Response('Not found',{status:404});
        const headers=new Headers({'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=31536000, immutable'});object.writeHttpMetadata(headers);headers.set('ETag',object.httpEtag);
        if(request.headers.get('If-None-Match')===object.httpEtag)return new Response(null,{status:304,headers});
        return new Response(request.method==='HEAD'?null:object.body,{headers});
      }
      if(path==='/admin'||path.startsWith('/admin/')) {
        if(!admin(request))return new Response('<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>管理员登录</title><body style="background:#151615;color:#eff0e7;font-family:sans-serif;padding:10vw"><h1>需要管理员账号</h1><p>请使用网站管理员的 ChatGPT 账号打开后台。</p><a style="color:#d9ef83" href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top">登录后进入后台</a></body></html>',{status:403,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
        if(path==='/admin'||path==='/admin/')return staticResponse('/admin/index.html');
      }
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
      const response=staticResponse(path==='/'?'/index.html':path);
      return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
    }catch(error){if(!(error instanceof HttpError))console.error('CMS request failed',path,error.message);return json({error:error instanceof HttpError?error.message:'服务暂时不可用，请稍后重试。'},error.status||503);}
  }
};
