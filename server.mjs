import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {localBindings} from './local-storage.mjs';
// Development-only fixture identity. Never emitted by build.mjs or deployed.
const previewIdentity='preview-admin@example.test';
const source=(await readFile('dist/server/index.js','utf8')).replace(/const ADMIN_EMAILS=.*?;\n/,`const ADMIN_EMAILS=["${previewIdentity}"];\n`);
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const env=await localBindings('.local-data');
http.createServer(async (req,res) => {
  try {
    const headers=new Headers(req.headers);
    headers.set('oai-authenticated-user-id','local-preview-only');headers.set('oai-authenticated-user-email',previewIdentity);
    const request=new Request('http://127.0.0.1:4173'+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
    const response=await worker.fetch(request,env);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  } catch(error) {console.error(error.message);res.writeHead(500).end('Local preview error');}
}).listen(4173,'127.0.0.1', () => process.stdout.write('Local: http://127.0.0.1:4173\n'));
