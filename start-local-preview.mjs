import {spawn} from 'node:child_process';
import {mkdir,open} from 'node:fs/promises';
import {createConnection} from 'node:net';
import path from 'node:path';

const root=import.meta.dirname;
const origin='http://127.0.0.1:4175';
const dataDirectory=path.join(root,'.local-preview');
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

async function isListening(){
  return new Promise((resolve,reject)=>{
    const socket=createConnection({host:'127.0.0.1',port:4175});
    socket.setTimeout(1500);
    socket.once('connect',()=>{socket.destroy();resolve(true);});
    socket.once('error',error=>{
      socket.destroy();
      if(error.code==='ECONNREFUSED')resolve(false);
      else reject(error);
    });
    socket.once('timeout',()=>{socket.destroy();reject(new Error('无法检查本地端口，请稍后重试。'));});
  });
}

async function verifyWorkspace(){
  const response=await fetch(origin+'/api/content',{signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw new Error('本地服务未能读取内容，请查看 .local-preview/server-error.log。');
  const content=await response.json();
  if(content.localOnly!==true||!Array.isArray(content.content?.chapters))throw new Error('4175 端口被其他程序占用，未启动或停止任何其他程序。');
  for(const pathname of ['/','/admin']){
    const page=await fetch(origin+pathname,{signal:AbortSignal.timeout(3000)});
    if(!page.ok||!page.headers.get('Content-Type')?.startsWith('text/html'))throw new Error('本地前台或后台暂时无法打开。');
    await page.body?.cancel();
  }
  return content.content.chapters.length;
}

try{
  if(Number(process.versions.node.split('.')[0])<24)throw new Error('本地预览需要 Node.js 24 或更高版本。');
  let reused=await isListening();
  if(!reused){
    await mkdir(dataDirectory,{recursive:true});
    const output=await open(path.join(dataDirectory,'server.log'),'a');
    let errors;
    try{
      errors=await open(path.join(dataDirectory,'server-error.log'),'a');
      const server=spawn(process.execPath,['preview-pages.mjs'],{
        cwd:root,detached:true,windowsHide:true,stdio:['ignore',output.fd,errors.fd]
      });
      await new Promise((resolve,reject)=>{server.once('spawn',resolve);server.once('error',reject);});
      server.unref();
    }finally{await output.close();await errors?.close();}
    for(let attempt=0;attempt<40;attempt++){
      if(await isListening())break;
      if(attempt===39)throw new Error('本地预览启动失败，请查看 .local-preview/server-error.log。');
      await delay(250);
    }
  }
  const chapters=await verifyWorkspace();
  console.log(reused?'本地预览已在运行，无需重复启动。':'本地预览已启动，关闭此窗口后仍可继续使用。');
  console.log('前台：'+origin+'/');
  console.log('后台：'+origin+'/admin');
  console.log('已读取 '+chapters+' 个篇章；后台编辑内容仍保存在本机。');
}catch(error){console.error('启动失败：'+error.message);process.exitCode=1;}
