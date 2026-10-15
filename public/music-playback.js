const DEFAULT_VOLUME=0.1;

export function createMusicPlayback(audio,{onState=()=>{},AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext}={}) {
  let source='',version=0,attempt=0,ignoredPauses=0;
  let wanted=true,userPaused=false,waitingForGesture=false,readinessRetried=false,context=null;
  audio.loop=true;audio.autoplay=true;
  // iOS can ignore HTMLMediaElement.volume; attenuate the same MP3 with a gain node there.
  try{audio.volume=DEFAULT_VOLUME;}catch{}
  const needsGain=Math.abs(audio.volume-DEFAULT_VOLUME)>0.001;

  const playing=()=>Boolean(source&&!audio.paused&&!audio.ended&&!audio.error&&(!context||context.state==='running'));
  function blocked(){waitingForGesture=true;onState('blocked');}
  function prepareOutput(){
    if(!needsGain||context||!AudioContextClass)return;
    context=new AudioContextClass();
    const gain=context.createGain();
    gain.gain.value=DEFAULT_VOLUME;
    gain.connect(context.destination);
    context.createMediaElementSource(audio).connect(gain);
    context.addEventListener('statechange',()=>{
      if(!source||!wanted||audio.paused)return;
      if(context.state==='running'){waitingForGesture=false;onState('playing');}
      else blocked();
    });
  }
  function resumeOutput(){
    if(!context||context.state==='running')return;
    const currentVersion=version;
    // Call resume synchronously within the gesture, without delaying audio.play().
    waitingForGesture=true;
    try{
      Promise.resolve(context.resume()).catch(()=>{
        if(currentVersion===version&&source&&wanted)blocked();
      });
    }catch{if(source&&wanted)blocked();}
  }
  function start(){
    if(!source||!wanted)return;
    const currentVersion=version,currentAttempt=++attempt;
    waitingForGesture=false;
    onState('starting');
    try{
      prepareOutput();
      resumeOutput();
      // No await before play: Safari requires this call to stay inside a real gesture.
      Promise.resolve(audio.play()).then(()=>{
        if(currentVersion!==version||currentAttempt!==attempt||!wanted)return;
        if(playing()){waitingForGesture=false;onState('playing');}
        else if(context&&context.state!=='running')blocked();
      }).catch(error=>{
        if(currentVersion!==version||currentAttempt!==attempt||!wanted||error.name==='AbortError')return;
        if(error.name==='NotAllowedError')blocked();
        else{waitingForGesture=false;onState('error');}
      });
    }catch{waitingForGesture=false;onState('error');}
  }
  function pause(){
    userPaused=true;wanted=false;waitingForGesture=false;attempt++;
    audio.autoplay=false;
    audio.pause();
    onState('paused');
  }
  function play(){
    if(!source)return;
    userPaused=false;wanted=true;
    audio.autoplay=true;
    if(audio.ended)audio.currentTime=0;
    start();
  }
  audio.addEventListener('play',()=>{
    if(!source||audio.paused)return;
    // Native audio controls can also resume a deliberately paused track.
    userPaused=false;wanted=true;audio.autoplay=true;
    resumeOutput();
  });
  audio.addEventListener('playing',()=>{
    if(!source||audio.paused||!wanted)return;
    if(playing()){waitingForGesture=false;onState('playing');}
    else blocked();
  });
  audio.addEventListener('pause',()=>{
    if(ignoredPauses){ignoredPauses--;return;}
    if(!source||audio.ended||!audio.paused)return;
    userPaused=true;wanted=false;waitingForGesture=false;attempt++;audio.autoplay=false;
    onState('paused');
  });
  audio.addEventListener('ended',()=>{
    // Native loop normally handles this; retain a fallback for interrupted end events.
    if(!source||!wanted||userPaused||audio.error)return;
    audio.currentTime=0;
    start();
  });
  audio.addEventListener('canplay',()=>{
    if(!source||!wanted||userPaused||!audio.paused||readinessRetried)return;
    readinessRetried=true;
    start();
  });
  audio.addEventListener('error',()=>{
    if(!source)return;
    attempt++;waitingForGesture=false;
    onState('error');
  });
  return {
    get playing(){return playing();},
    setTrack(src){
      if(source===src)return;
      version++;attempt++;waitingForGesture=false;readinessRetried=false;
      if(!audio.paused)ignoredPauses++;
      audio.pause();
      source=src;
      if(src)audio.src=src;
      else audio.removeAttribute('src');
      audio.load();
      wanted=Boolean(src)&&!userPaused;
      audio.autoplay=wanted;
      if(wanted)start();
      else onState(src?'paused':'disabled');
    },
    toggle(){if(!audio.paused&&!waitingForGesture)pause();else play();},
    activate({controlsOnly=false}={}){
      if(!source)return;
      if(controlsOnly){try{prepareOutput();resumeOutput();}catch{onState('error');}return;}
      if(waitingForGesture&&!userPaused)start();
      else if(wanted&&!audio.paused)resumeOutput();
    },
    autoplay(){
      if(!source||!wanted||userPaused)return;
      if(audio.paused||waitingForGesture)start();
      else resumeOutput();
    },
    resumeOutput(){if(source&&wanted&&!audio.paused)resumeOutput();}
  };
}
