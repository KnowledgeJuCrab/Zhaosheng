import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export async function localBindings(directory) {
  await mkdir(path.join(directory,'images'),{recursive:true});
  const sqlite=new DatabaseSync(path.join(directory,'content.sqlite'));
  sqlite.exec('CREATE TABLE IF NOT EXISTS site_content (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)');
  const DB={prepare(query){let values=[];return{bind(...args){values=args;return this;},async first(){return sqlite.prepare(query).get(...values)||null;},async run(){const result=sqlite.prepare(query).run(...values);return{success:true,meta:{changes:Number(result.changes)}};}};}};
  const BUCKET={
    async put(key,bytes,options){await writeFile(path.join(directory,'images',key),bytes);await writeFile(path.join(directory,'images',key+'.json'),JSON.stringify(options.httpMetadata));},
    async head(key){try{await readFile(path.join(directory,'images',key+'.json'));return{key,size:(await stat(path.join(directory,'images',key))).size};}catch{return null;}},
    async get(key,options={}){try{
      const bytes=await readFile(path.join(directory,'images',key));
      const metadata=JSON.parse(await readFile(path.join(directory,'images',key+'.json'),'utf8'));
      const body=options.range?bytes.subarray(options.range.offset,options.range.offset+options.range.length):bytes;
      return{body,size:bytes.length,httpEtag:'"'+createHash('sha256').update(bytes).digest('hex')+'"',writeHttpMetadata(headers){headers.set('Content-Type',metadata.contentType);}};
    }catch{return null;}}
  };
  return {DB,BUCKET,close:()=>sqlite.close()};
}
