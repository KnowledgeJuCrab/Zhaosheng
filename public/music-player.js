import {createMusicPlayback} from './music-playback.js';

export function initMusicPlayer() {
  const root=document.querySelector('#music-player');
  if(!root)return;
  const audio=root.querySelector('audio');
  const play=root.querySelector('#music-play');
  const options=root.querySelector('#music-options');
  const panel=root.querySelector('#music-panel');
  const close=root.querySelector('#music-close');
  const name=root.querySelector('#music-name');
  const status=root.querySelector('#music-status');
  const opening=document.querySelector('#opening');
  let loadingMusic=false;
  root.hidden=true;
  const playback=createMusicPlayback(audio,{deferStart:Boolean(opening),onState(state){
    const messages={starting:'正在启动背景音乐…',playing:'正在循环播放。',blocked:'轻触页面或点击播放，即可开始聆听。',paused:'已暂停，点击播放可继续。',error:'音乐暂时无法播放，请稍后重试。'};
    if(messages[state])status.textContent=messages[state];
    updatePlayback();
    if(state==='error')setPanel(true);
  }});

  function setPanel(open,returnFocus=false) {
    panel.hidden=!open;
    options.setAttribute('aria-expanded',String(open));
    options.setAttribute('aria-label',open?'收起音乐播放器':'展开音乐播放器');
    if(returnFocus)options.focus({preventScroll:true});
  }
  function updatePlayback() {
    const playing=playback.playing;
    root.classList.toggle('is-playing',playing);
    play.setAttribute('aria-pressed',String(playing));
    play.setAttribute('aria-label',playing?'暂停背景音乐':'播放背景音乐');
  }
  function loadTrack(src,title) {
    name.textContent=title;name.title=title;
    playback.setTrack(src);
  }
  play.addEventListener('click',()=>{
    if(!audio.getAttribute('src')){setPanel(true);return;}
    playback.toggle();
  });
  function activateMusic(event){
    if(!event.isTrusted||play.contains(event.target)||(opening&&!opening.hidden))return;
    playback.activate({controlsOnly:audio.contains(event.target)});
  }
  document.addEventListener('click',activateMusic,{capture:true});
  document.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse')activateMusic(event);
  },{capture:true,passive:true});
  document.addEventListener('pointerup',event=>{
    if(event.pointerType!=='mouse')activateMusic(event);
  },{capture:true,passive:true});
  document.addEventListener('touchend',activateMusic,{capture:true,passive:true});
  document.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&!event.ctrlKey&&!event.metaKey&&!event.altKey)activateMusic(event);
  },{capture:true});
  options.addEventListener('click',()=>setPanel(panel.hidden));
  close.addEventListener('click',()=>setPanel(false,true));
  document.addEventListener('pointerdown',event=>{if(!root.contains(event.target))setPanel(false);},{passive:true});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();setPanel(false,true);}});
  async function refreshMusic(){
    if(loadingMusic)return;loadingMusic=true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch('/api/music',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      if(!response.ok)throw new Error('Music unavailable');
      const {music}=await response.json();
      if(!music?.enabled||!music.src){
        playback.setTrack('');
        root.hidden=true;setPanel(false);return;
      }
      const url=new URL(music.src,location.href);
      if(url.origin!==location.origin||!/\.mp3$/i.test(url.pathname))throw new Error('Invalid music source');
      root.hidden=false;
      const title=typeof music.title==='string'&&music.title.trim()?music.title:'背景音乐';
      // A title edit or a content refresh must not reset the playing track.
      if(audio.getAttribute('src')!==url.href)loadTrack(url.href,title);
      else{name.textContent=title;name.title=title;}
    }catch{status.textContent='背景音乐暂时无法加载，请稍后重试。';}
    finally{clearTimeout(timeout);loadingMusic=false;}
  }
  const ready=refreshMusic();
  function restoreMusic(){refreshMusic();playback.autoplay();}
  window.addEventListener('pageshow',restoreMusic);
  window.addEventListener('focus',restoreMusic);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)restoreMusic();});
  if(typeof BroadcastChannel==='function'){
    const updates=new BroadcastChannel('admissions-content');
    updates.addEventListener('message',event=>{if(event.data==='music-saved')refreshMusic();});
  }
  return {ready,play:()=>playback.play()};
}
