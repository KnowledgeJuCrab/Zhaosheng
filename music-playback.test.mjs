import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusicPlayback} from './public/music-playback.js';

class AudioFixture extends EventTarget {
  constructor({ignoreVolume=false}={}){
    super();this.paused=true;this.ended=false;this.error=null;this.loop=false;this.autoplay=false;
    this.ignoreVolume=ignoreVolume;this.level=1;this.position=0;this.src='';
    this.playCalls=0;this.loadCalls=0;this.nextPlay=null;
  }
  set volume(value){if(!this.ignoreVolume)this.level=value;}
  get volume(){return this.level;}
  set currentTime(value){this.position=value;this.ended=false;}
  get currentTime(){return this.position;}
  load(){this.loadCalls++;this.currentTime=0;this.error=null;}
  removeAttribute(name){if(name==='src')this.src='';}
  pause(){if(this.paused)return;this.paused=true;this.dispatchEvent(new Event('pause'));}
  play(){
    this.playCalls++;
    if(this.nextPlay){const result=this.nextPlay;this.nextPlay=null;return result;}
    this.paused=false;this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  finish(){this.ended=true;this.pause();this.dispatchEvent(new Event('ended'));}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const denied=()=>Object.assign(new Error('Autoplay denied'),{name:'NotAllowedError'});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const track='https://local.example/audio/dusk.mp3';

test('the opening preloads silently and its real entry gesture starts playback synchronously at 10%',async()=>{
  const audio=new AudioFixture();const player=createMusicPlayback(audio,{deferStart:true});
  player.setTrack(track);await settle();
  audio.dispatchEvent(new Event('canplay'));player.autoplay();player.activate();player.resumeOutput();await settle();
  assert.equal(audio.src,track);assert.equal(audio.playCalls,0);assert.equal(audio.autoplay,false);assert.equal(audio.paused,true);
  // No promise/microtask is allowed between entering and the media's play() call.
  player.play();assert.equal(audio.playCalls,1);assert.equal(audio.autoplay,true);assert.equal(audio.volume,0.1);
  await settle();assert.equal(player.playing,true);
  audio.finish();await settle();assert.equal(audio.playCalls,2);
  player.toggle();player.autoplay();await settle();assert.equal(audio.paused,true);assert.equal(audio.playCalls,2);
});

test('page-load playback starts at 10%, enables native autoplay, and retains visitor volume and progress on refresh',async()=>{
  const audio=new AudioFixture(),states=[];
  const player=createMusicPlayback(audio,{onState:state=>states.push(state)});
  player.setTrack(track);await settle();
  assert.equal(audio.volume,0.1);assert.equal(audio.loop,true);assert.equal(audio.autoplay,true);
  assert.equal(audio.playCalls,1);assert.equal(player.playing,true);assert.equal(states.at(-1),'playing');
  audio.currentTime=37;audio.volume=0.35;
  player.setTrack(track);player.resumeOutput();await settle();
  assert.equal(audio.playCalls,1);assert.equal(audio.currentTime,37);assert.equal(audio.volume,0.35);
});

test('blocked autoplay waits for a gesture, starts once, and does not reset the song',async()=>{
  const audio=new AudioFixture(),states=[];
  const player=createMusicPlayback(audio,{onState:state=>states.push(state)});
  audio.nextPlay=Promise.reject(denied());player.setTrack(track);await settle();
  assert.equal(audio.paused,true);assert.equal(states.at(-1),'blocked');assert.equal(audio.playCalls,1);
  player.activate();await settle();
  assert.equal(player.playing,true);assert.equal(audio.playCalls,2);
  audio.currentTime=18;player.activate();await settle();
  assert.equal(audio.playCalls,2);assert.equal(audio.currentTime,18);
});

test('audio readiness retries an interrupted initial start once and page restoration retries a blocked start',async()=>{
  const audio=new AudioFixture(),states=[];const player=createMusicPlayback(audio,{onState:state=>states.push(state)});
  audio.nextPlay=Promise.reject(Object.assign(new Error('Source was loading'),{name:'AbortError'}));
  player.setTrack(track);await settle();assert.equal(audio.playCalls,1);
  audio.nextPlay=Promise.reject(denied());audio.dispatchEvent(new Event('canplay'));await settle();
  assert.equal(audio.playCalls,2);assert.equal(states.at(-1),'blocked');
  audio.dispatchEvent(new Event('canplay'));await settle();assert.equal(audio.playCalls,2);
  player.autoplay();await settle();assert.equal(audio.playCalls,3);assert.equal(player.playing,true);
  audio.currentTime=33;player.autoplay();await settle();assert.equal(audio.playCalls,3);assert.equal(audio.currentTime,33);
});

test('the first touch can start blocked playback while disabled music and manual pauses remain stopped',async()=>{
  const audio=new AudioFixture();const player=createMusicPlayback(audio);
  audio.nextPlay=Promise.reject(denied());player.setTrack(track);await settle();
  // activate() is called synchronously by the trusted touchend/pointerup handlers.
  player.activate();assert.equal(audio.playCalls,2);await settle();assert.equal(player.playing,true);
  player.toggle();assert.equal(audio.autoplay,false);
  player.activate();player.autoplay();audio.dispatchEvent(new Event('canplay'));await settle();
  assert.equal(audio.playCalls,2);assert.equal(audio.paused,true);
  player.toggle();await settle();assert.equal(audio.autoplay,true);
  player.setTrack('');assert.equal(audio.autoplay,false);
  player.autoplay();player.activate();await settle();assert.equal(audio.playCalls,3);
});

test('natural completion replays from the beginning; a loading error cannot cause a retry loop',async()=>{
  const audio=new AudioFixture();const player=createMusicPlayback(audio);
  player.setTrack(track);await settle();audio.currentTime=125;audio.finish();await settle();
  assert.equal(audio.playCalls,2);assert.equal(audio.currentTime,0);assert.equal(player.playing,true);
  audio.error={code:2};audio.dispatchEvent(new Event('error'));audio.finish();await settle();
  assert.equal(audio.playCalls,2);
});

test('manual pauses through either control stay paused across gestures, focus, and track changes',async()=>{
  const audio=new AudioFixture();const player=createMusicPlayback(audio);
  player.setTrack(track);await settle();audio.currentTime=24;player.toggle();
  player.activate();player.resumeOutput();player.autoplay();player.setTrack(track);audio.dispatchEvent(new Event('ended'));await settle();
  assert.equal(audio.playCalls,1);assert.equal(audio.paused,true);assert.equal(audio.currentTime,24);
  player.setTrack('https://local.example/audio/second.mp3');await settle();
  assert.equal(audio.paused,true);assert.equal(audio.playCalls,1);
  player.toggle();await settle();assert.equal(audio.playCalls,2);
  audio.pause();player.activate();player.resumeOutput();await settle();assert.equal(audio.playCalls,2);
  // The native player's play control is also an explicit request to resume.
  await audio.play();audio.finish();await settle();assert.equal(audio.playCalls,4);
});

test('stale play requests cannot alter a replacement track or disabled music',async()=>{
  const audio=new AudioFixture(),states=[];const player=createMusicPlayback(audio,{onState:state=>states.push(state)});
  const first=deferred();audio.nextPlay=first.promise;player.setTrack(track);
  player.setTrack('https://local.example/audio/second.mp3');await settle();
  first.reject(denied());await settle();assert.equal(states.at(-1),'playing');
  const second=deferred();audio.nextPlay=second.promise;player.setTrack('https://local.example/audio/third.mp3');
  player.setTrack('');second.resolve();await settle();
  assert.equal(states.at(-1),'disabled');assert.equal(audio.src,'');assert.equal(audio.paused,true);
  player.activate();assert.equal(audio.playCalls,3);
});

test('a delayed autoplay rejection does not override a manual pause',async()=>{
  const audio=new AudioFixture(),states=[];const player=createMusicPlayback(audio,{onState:state=>states.push(state)});
  const pending=deferred();audio.nextPlay=pending.promise;player.setTrack(track);
  // Simulate playback having started before its promise settles, then a manual pause.
  audio.paused=false;player.toggle();pending.reject(denied());await settle();
  assert.equal(states.at(-1),'paused');player.activate();assert.equal(audio.playCalls,1);
});

test('iOS-style immutable volume uses a single 10% gain node and resumes on a gesture',async()=>{
  const instances=[];
  class ContextFixture extends EventTarget {
    constructor(){super();this.state='suspended';this.destination={};this.resumeAllowed=false;this.resumeCalls=0;this.sources=0;instances.push(this);}
    createGain(){return this.gain={gain:{value:1},connect:target=>{this.gainDestination=target;}};}
    createMediaElementSource(audio){this.sources++;this.audio=audio;return {connect:target=>{this.sourceDestination=target;}};}
    resume(){this.resumeCalls++;if(!this.resumeAllowed)return Promise.reject(denied());this.state='running';this.dispatchEvent(new Event('statechange'));return Promise.resolve();}
  }
  const audio=new AudioFixture({ignoreVolume:true}),states=[];
  const player=createMusicPlayback(audio,{AudioContextClass:ContextFixture,onState:state=>states.push(state)});
  player.setTrack(track);await settle();
  const context=instances[0];assert.equal(audio.volume,1);assert.equal(context.gain.gain.value,0.1);
  assert.equal(context.sourceDestination,context.gain);assert.equal(context.gainDestination,context.destination);
  assert.equal(player.playing,false);assert.equal(states.at(-1),'blocked');
  context.resumeAllowed=true;player.activate();await settle();assert.equal(player.playing,true);
  audio.currentTime=48;context.state='interrupted';context.dispatchEvent(new Event('statechange'));
  player.resumeOutput();await settle();assert.equal(player.playing,true);assert.equal(audio.currentTime,48);
  player.setTrack('https://local.example/audio/second.mp3');await settle();
  assert.equal(instances.length,1);assert.equal(context.sources,1);assert.equal(context.gain.gain.value,0.1);
  player.toggle();const resumes=context.resumeCalls;player.resumeOutput();player.activate();
  assert.equal(context.resumeCalls,resumes);assert.equal(audio.paused,true);
});
