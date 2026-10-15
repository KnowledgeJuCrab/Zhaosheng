import {createServer} from 'node:http';
import {createLocalWorkspace,LOCAL_ORIGIN} from './local-workspace.mjs';

const workspace=await createLocalWorkspace();
const server=createServer(async(req,res)=>{
  try{
    const request=new Request(LOCAL_ORIGIN+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
    const response=await workspace.fetch(request);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error.message);res.writeHead(500);res.end('Local workspace error');}
});
server.on('error',error=>{workspace.close();console.error(error.code==='EADDRINUSE'?'Local preview is already running on port 4175.':error.message);process.exitCode=1;});
server.listen(4175,'127.0.0.1',()=>{console.log('Local frontend: '+LOCAL_ORIGIN+'/');console.log('Local admin: '+LOCAL_ORIGIN+'/admin');});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{workspace.close();process.exit(0);}));
