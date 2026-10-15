export function initOpening({ready,onEnter,documentRoot=document,windowRoot=window}={}) {
  const opening=documentRoot.querySelector('#opening');
  if(!opening)return;
  const button=opening.querySelector('#opening-enter');
  const site=documentRoot.querySelector('#site-content');
  const journey=documentRoot.querySelector('#journey');
  let entered=false,finished=false,timer;
  site.inert=true;
  button.disabled=true;
  button.setAttribute('aria-busy','true');
  function finish(){
    if(finished)return;
    finished=true;
    windowRoot.clearTimeout(timer);
    opening.hidden=true;
  }
  function enter(){
    if(entered||button.disabled)return;
    entered=true;
    // Keep playback synchronous inside the actual button click for Safari / iOS.
    try{onEnter?.();}catch{}
    documentRoot.body.classList.remove('opening-open');
    opening.classList.add('is-leaving');
    opening.inert=true;
    site.inert=false;
    journey?.focus({preventScroll:true});
    if(windowRoot.matchMedia('(prefers-reduced-motion: reduce)').matches)finish();
    else timer=windowRoot.setTimeout(finish,720);
  }
  button.addEventListener('click',enter);
  opening.addEventListener('transitionend',event=>{
    if(entered&&event.target===opening&&event.propertyName==='opacity')finish();
  });
  opening.addEventListener('keydown',event=>{
    if(event.key==='Tab'&&!button.disabled){event.preventDefault();button.focus();}
  });
  Promise.resolve(ready).catch(()=>{}).then(()=>{
    button.disabled=false;
    button.setAttribute('aria-busy','false');
    if(!entered&&documentRoot.activeElement===documentRoot.body)button.focus({preventScroll:true});
  });
  return {get entered(){return entered;}};
}

export function updateOpeningContent(settings,documentRoot=document){
  const title=documentRoot.querySelector('#opening-title');
  if(!title)return;
  title.textContent=settings.browserTitle.replace(/^齐医\s*·\s*/,'').replace(/(研究生招生简介)$/,'\n$1');
  documentRoot.querySelector('#opening-edition').textContent=settings.edition;
  documentRoot.querySelector('#opening-badge').textContent=settings.badge;
  documentRoot.querySelector('#opening-footer').textContent=settings.footerLeft;
}
