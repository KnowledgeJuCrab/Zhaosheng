import {readFile} from 'node:fs/promises';
// Only the isolated loopback preview is touched, never the deployed Site.
const origin='http://127.0.0.1:4173';
const data=await (await fetch(origin+'/api/content')).json();
const content=JSON.parse(await readFile('src/default-content.json','utf8'));
const response=await fetch(origin+'/api/content',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({content,revision:data.revision})});
if(!response.ok)throw new Error('Could not restore local demo content.');
console.log('Local demo restored; deployed Site unchanged.');
