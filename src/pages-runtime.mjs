const accessKeys=new Map();
function decodeSegment(value) {
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid JWT encoding.');
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
}
function decodeJSON(value) { return JSON.parse(new TextDecoder().decode(decodeSegment(value))); }
async function accessIdentity(request,env) {
  const issuer=String(env.ACCESS_TEAM_DOMAIN||'').replace(/\/$/,'');
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!env.ACCESS_AUD)return null;
  // The public content GET stays outside Access; browser writes carry its signed cookie.
  const token=request.headers.get('Cf-Access-Jwt-Assertion')||request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if(!token||token.length>16384)return null;
  try {
    const parts=token.split('.');if(parts.length!==3)return null;
    const header=decodeJSON(parts[0]),claims=decodeJSON(parts[1]);
    const now=Math.floor(Date.now()/1000),aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
    if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==issuer||!aud.includes(env.ACCESS_AUD)||!Number.isInteger(claims.exp)||claims.exp<=now||!Number.isInteger(claims.iat)||claims.iat>now+60||(claims.nbf!==undefined&&(!Number.isInteger(claims.nbf)||claims.nbf>now+60)))return null;
    if(typeof claims.sub!=='string'||!claims.sub||typeof claims.email!=='string')return null;
    const allowed=String(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    const email=claims.email.trim().toLowerCase();if(!allowed.includes(email))return null;
    let entry=accessKeys.get(issuer);
    if(!entry||entry.expires<=Date.now()) {
      const response=await fetch(`${issuer}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(10000)});
      if(!response.ok)return null;
      const keys=(await response.json()).keys;if(!Array.isArray(keys))return null;
      entry={keys,expires:Date.now()+300000};accessKeys.set(issuer,entry);
    }
    const jwk=entry.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256'));
    if(!jwk)return null;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeSegment(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
    return valid?{id:claims.sub,email}:null;
  } catch { return null; }
}
function setupResponse(adminPath,configured) {
  const message=configured?'请通过 Cloudflare Access 管理员登录后访问后台。':'Cloudflare 后台尚未配置：需要绑定 D1 数据库、R2 图片存储，并配置 Cloudflare Access 管理员登录。';
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  return adminPath
    ?new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>内容管理</title><body style="background:#151615;color:#eff0e7;font-family:sans-serif;padding:10vw"><h1>内容管理</h1><p>${message}</p><a style="color:#d9ef83" href="/">返回网站</a></body></html>`,{status:configured?403:503,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}})
    :new Response(JSON.stringify({error:message}),{status:configured?403:503,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
}
export function createPagesHandler(cms,defaults,principal) {
  return {
    async fetch(request,env) {
      const path=new URL(request.url).pathname;
      const adminPath=path==='/admin'||path.startsWith('/admin/');
      const apiPath=path.startsWith('/api/'),mediaPath=path.startsWith('/media/');
      const write=apiPath&&!['GET','HEAD'].includes(request.method);
      // Public visitors must never be able to forge the former platform's identity headers.
      const headers=new Headers(request.headers);
      for(const name of [...headers.keys()])if(name.startsWith('oai-authenticated-'))headers.delete(name);
      if(adminPath||write) {
        const configured=!!(env.ACCESS_TEAM_DOMAIN&&env.ACCESS_AUD&&env.ADMIN_EMAILS);
        const identity=await accessIdentity(request,env);
        if(!identity)return setupResponse(adminPath,configured);
        if(!env.DB||!env.BUCKET)return setupResponse(adminPath,false);
        headers.set('oai-authenticated-user-id',identity.id);
        headers.set('oai-authenticated-user-email',principal);
      }
      const clean=new Request(request,{headers});
      if(path==='/api/content'&&request.method==='GET'&&!env.DB)return new Response(JSON.stringify({content:defaults,revision:0,updatedAt:null}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      if(adminPath||apiPath||mediaPath)return cms.fetch(clean,env);
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
      return env.ASSETS.fetch(clean);
    }
  };
}
