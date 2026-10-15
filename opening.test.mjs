import test from 'node:test';
import assert from 'node:assert/strict';
import {initOpening,updateOpeningContent} from './public/opening.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({reduced=false}={}){
  let documentRoot;
  class Element extends EventTarget {
    constructor(){super();this.inert=false;this.disabled=false;this.hidden=false;this.textContent='';this.attributes={};this.classes=new Set();this.classList={add:value=>this.classes.add(value),remove:value=>this.classes.delete(value),contains:value=>this.classes.has(value)};}
    setAttribute(key,value){this.attributes[key]=value;}
    focus(){documentRoot.activeElement=this;}
  }
  const body=new Element(),opening=new Element(),button=new Element(),site=new Element(),journey=new Element();
  const title=new Element(),edition=new Element(),badge=new Element(),footer=new Element();
  body.classList.add('opening-open');
  opening.querySelector=selector=>selector==='#opening-enter'?button:null;
  const elements={'#opening':opening,'#site-content':site,'#journey':journey,'#opening-title':title,'#opening-edition':edition,'#opening-badge':badge,'#opening-footer':footer};
  documentRoot={body,activeElement:body,querySelector:selector=>elements[selector]||null};
  const timers=new Map();let nextTimer=0;
  const windowRoot={matchMedia:()=>({matches:reduced}),setTimeout:callback=>{timers.set(++nextTimer,callback);return nextTimer;},clearTimeout:id=>timers.delete(id)};
  return {documentRoot,windowRoot,body,opening,button,site,journey,title,edition,badge,footer,timers};
}

test('entry waits for prepared music and invokes playback inside the click before revealing the website',async()=>{
  const f=fixture();let ready,plays=0;
  const gate=initOpening({...f,ready:new Promise(resolve=>{ready=resolve;}),onEnter:()=>{
    plays++;assert.equal(f.site.inert,true);assert.equal(f.opening.hidden,false);
  }});
  assert.equal(f.button.disabled,true);assert.equal(f.site.inert,true);
  f.button.dispatchEvent(new Event('click'));assert.equal(plays,0);
  ready();await settle();assert.equal(f.button.disabled,false);assert.equal(f.documentRoot.activeElement,f.button);
  f.button.dispatchEvent(new Event('click'));
  assert.equal(plays,1);assert.equal(gate.entered,true);assert.equal(f.site.inert,false);assert.equal(f.opening.inert,true);
  assert.equal(f.documentRoot.activeElement,f.journey);assert.equal(f.body.classList.contains('opening-open'),false);
  f.button.dispatchEvent(new Event('click'));assert.equal(plays,1);
  for(const callback of [...f.timers.values()])callback();assert.equal(f.opening.hidden,true);
});

test('reduced motion enters immediately and a failed music load never traps the visitor',async()=>{
  const f=fixture({reduced:true});
  initOpening({...f,ready:Promise.reject(new Error('Audio unavailable')),onEnter:()=>{throw new Error('Playback unavailable');}});
  await settle();assert.equal(f.button.disabled,false);
  f.button.dispatchEvent(new Event('click'));
  assert.equal(f.opening.hidden,true);assert.equal(f.site.inert,false);assert.equal(f.timers.size,0);
});

test('the opening follows the editable website title, edition, badge and footer',()=>{
  const f=fixture();updateOpeningContent({browserTitle:'齐医 · 应用心理专业研究生招生简介',edition:'研究生生活，从这里开始',badge:'ADMISSIONS / 2026',footerLeft:'探索你的可能性'},f.documentRoot);
  assert.equal(f.title.textContent,'应用心理专业\n研究生招生简介');assert.equal(f.edition.textContent,'研究生生活，从这里开始');
  assert.equal(f.badge.textContent,'ADMISSIONS / 2026');assert.equal(f.footer.textContent,'探索你的可能性');
});
