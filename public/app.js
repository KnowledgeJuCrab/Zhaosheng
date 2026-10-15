import {wrap,shortestDelta,scenePair,nearestChapter,picturePosition} from './journey-math.js';
import {prepareText,positionText} from './text-layout.js';
import {initMusicPlayer} from './music-player.js';
import {initOpening,updateOpeningContent} from './opening.js';
const music=initMusicPlayer();
initOpening({ready:music?.ready,onEnter:()=>music?.play()});
const chapters = [
  { id: 'campus', name: '认识校园', category: 'THE CAMPUS', caption: '一座校园，无数种可能。' },
  { id: 'programs', name: '专业探索', category: 'YOUR PASSION', caption: '找到热爱，探索更深的世界。' },
  { id: 'learning', name: '学习日常', category: 'KEEP EXPLORING', caption: '让每一天，都有新的发现。' },
  { id: 'life', name: '多彩生活', category: 'LIFE TOGETHER', caption: '在这里，遇见同行的人。' },
  { id: 'future', name: '未来方向', category: 'WHAT COMES NEXT', caption: '你的下一章，正等待开启。' },
  { id: 'admissions', name: '招生信息', category: 'ADMISSIONS', caption: '了解招生信息，梳理你的选择。' },
  { id: 'application', name: '报考指南', category: 'YOUR APPLICATION', caption: '认真准备，让下一步更加清晰。' },
  { id: 'faculty', name: '师资团队', category: 'OUR FACULTY', caption: '认识与你共同探索的老师。' },
  { id: 'practice', name: '实践成长', category: 'LEARNING IN ACTION', caption: '从学习出发，在实践中积累。' }
];
const links = [...document.querySelectorAll('.orbit-item')];
const scenes = [...document.querySelectorAll('.scene')];
const images = scenes.map(scene => scene.querySelector('img'));
const copies = scenes.map(scene => scene.querySelector('.scene-copy'));
copies.forEach(prepareText);
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const category = document.querySelector('#chapter-category');
const caption = document.querySelector('#chapter-caption');
const number = document.querySelector('#current-number');
const progressBar = document.querySelector('#page-progress');
const scrollLabel = document.querySelector('#scroll-label');
const announcement = document.querySelector('#announcement');
const journey = document.querySelector('#journey');
const pictureFrame = document.querySelector('.scenes');
const alignPicture = document.querySelector('#align-picture');
const orbitRotor=document.querySelector('#orbit-rotor');
const orbitInner=document.querySelector('#orbit-inner');
const orbitTrace=document.querySelector('#orbit-trace');
const orbitNumber=document.querySelector('#orbit-number');
document.querySelector('#orbit-total').textContent=String(chapters.length).padStart(2,'0');
const orbitTicks=document.querySelector('#orbit-ticks');
for(let i=0;i<36;i++){
  const tick=document.createElementNS('http://www.w3.org/2000/svg','line');
  tick.setAttribute('x1','100');tick.setAttribute('x2','100');tick.setAttribute('y1',i%4===0?'17':'20');tick.setAttribute('y2','24');
  tick.setAttribute('transform',`rotate(${i*10} 100 100)`);tick.setAttribute('class',i%4===0?'instrument-tick major-tick':'instrument-tick');orbitTicks.append(tick);
}
journey.style.height=`${(chapters.length*3+1)*100}svh`;
document.querySelector('.total').textContent=` / ${String(chapters.length).padStart(2,'0')}`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let current = -1;
let frame = 0;
let pageStep = 1;
let radius = 160;
let compact = false;
let loopOffset=-chapters.length;
let lastPosition=0;
let measured=false;
let rebaseTimer;
history.scrollRestoration='manual';
function measure() {
  const position=measured?lastPosition:Math.max(0,chapters.findIndex(chapter=>`#${chapter.id}`===location.hash));
  pageStep = (journey.offsetHeight - window.innerHeight) / (chapters.length*3);
  radius = parseFloat(getComputedStyle(document.querySelector('.orbit-outline')).width) / 2;
  compact = window.matchMedia('(max-width:700px)').matches;
  loopOffset=position-(chapters.length+wrap(position,chapters.length));
  window.scrollTo({top:(position-loopOffset)*pageStep,behavior:'instant'});
  measured=true;
  copies.forEach((copy,i)=>positionText(copy,chapters[i]));
  render();
}
function render() {
  frame = 0;
  const position = picturePosition(window.scrollY/Math.max(pageStep,1)+loopOffset,Math.max(pageStep,1));
  lastPosition=position;
  const selected = nearestChapter(position,chapters.length);
  const pair=scenePair(position,chapters.length);
  const between = position !== Math.round(position);
  pictureFrame.classList.toggle('is-between',between);
  alignPicture.hidden=!between;
  const progress=Math.min(1,wrap(position,chapters.length)/(chapters.length-1));
  const orbitPhase=reducedMotion.matches?0:position;
  orbitRotor.setAttribute('transform',`rotate(${-orbitPhase*40} 100 100)`);
  orbitInner.setAttribute('transform',`rotate(${orbitPhase*25} 100 100)`);
  orbitTrace.style.strokeDashoffset=String(1-progress);
  links.forEach((link, i) => {
    const count = chapters.length;
    const distance = shortestDelta(position,i,count);
    const angle = distance * (54 / Math.floor(count / 2));
    const compactY = distance * Math.min(30, radius / (Math.floor(count / 2) + 0.5));
    link.style.transform = compact
      ? `translate(${Math.sqrt(Math.max(0, radius * radius - compactY * compactY))}px, ${compactY}px)`
      : `rotate(${angle}deg) translateX(${radius}px)`;
    const boundaryFade = Math.min(1, (count / 2 - Math.abs(distance)) / 0.3);
    link.style.opacity = Math.max(0, Math.max(0.85, 1 - Math.abs(distance) * 0.075) * boundaryFade);
    link.style.color = Math.abs(distance) < 0.5 ? 'var(--accent)' : 'var(--muted)';
  });
  scenes.forEach((scene, i) => {
    const distance = shortestDelta(i,position,chapters.length);
    scene.style.visibility=(i===pair.outgoing||i===pair.incoming)?'visible':'hidden';
    scene.style.zIndex=i===pair.incoming?'2':'1';
    scene.style.clipPath=i===pair.incoming?`inset(${(1-pair.fraction)*100}% 0 0 0)`:'none';
    images[i].style.transform = reducedMotion.matches ? 'none' : `translateY(${Math.max(-1, Math.min(1, distance)) * 6}%) scale(1.025)`;
    copies[i].style.transform = reducedMotion.matches ? 'none' : `translateY(${-distance * 32}px)`;
    copies[i].style.opacity = Math.max(0, 1 - Math.abs(distance) * 0.9);
  });
  progressBar.style.transform = `scaleX(${progress})`;
  if (selected !== current) {
    current = selected;
    links.forEach((link, i) => {
      link.classList.toggle('is-active', i === current);
      if (i === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    scenes.forEach((scene, i) => {
      scene.classList.toggle('is-current', i === current);
      scene.setAttribute('aria-hidden', String(i !== current));
      scene.inert = i !== current;
    });
    const chapter = chapters[current];
    const displayNumber = String(current + 1).padStart(2, '0');
    category.textContent = `${displayNumber} — ${chapter.category}`;
    caption.textContent = chapter.caption;
    number.textContent = displayNumber;
    orbitNumber.textContent=displayNumber;
    previous.disabled=false;next.disabled=false;
    scrollLabel.textContent='转动转盘或点击箭头，以继续探索';
    announcement.textContent = `第 ${current + 1} 篇，共 ${chapters.length} 篇：${chapter.name}`;
  }
}
function rebase(force=false){
  const physical=lastPosition-loopOffset;
  if(force||physical<chapters.length/2||physical>chapters.length*2.5){
    loopOffset=lastPosition-(chapters.length+wrap(lastPosition,chapters.length));
    window.scrollTo({top:(lastPosition-loopOffset)*pageStep,behavior:'instant'});
  }
}
function schedule() { if (!frame) frame = requestAnimationFrame(render);clearTimeout(rebaseTimer);rebaseTimer=setTimeout(()=>rebase(),150); }
function goTo(index, updateHash = true) {
  // Read the current scroll position before rebasing, even if the next paint is pending.
  lastPosition=picturePosition(window.scrollY/Math.max(pageStep,1)+loopOffset,Math.max(pageStep,1));
  const bounded = wrap(index,chapters.length);
  rebase(true);
  const target=lastPosition+shortestDelta(lastPosition,bounded,chapters.length);
  if (updateHash) history.replaceState(null, '', `#${chapters[bounded].id}`);
  window.scrollTo({ top: (target-loopOffset)*pageStep, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}
links.forEach((link, i) => link.addEventListener('click', event => { event.preventDefault(); goTo(i); }));
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); goTo(0); });
previous.addEventListener('click', () => goTo(current - 1));
next.addEventListener('click', () => goTo(current + 1));

function showFullPicture() {
  const position=window.scrollY/Math.max(pageStep,1)+loopOffset;
  goTo(nearestChapter(position,chapters.length));
}
alignPicture.addEventListener('click',event=>{event.stopPropagation();showFullPicture();});
// Listen on the stable frame: a partly revealed scene may currently be inert.
let pictureGesture=null;
pictureFrame.addEventListener('pointerdown',event=>{
  pictureGesture={id:event.pointerId,x:event.clientX,y:event.clientY,scrollY:window.scrollY,moved:false};
},{passive:true});
pictureFrame.addEventListener('pointermove',event=>{
  if(pictureGesture?.id===event.pointerId&&Math.hypot(event.clientX-pictureGesture.x,event.clientY-pictureGesture.y)>10)pictureGesture.moved=true;
},{passive:true});
pictureFrame.addEventListener('pointercancel',()=>{if(pictureGesture)pictureGesture.moved=true;},{passive:true});
pictureFrame.addEventListener('click',event=>{
  const gesture=pictureGesture;pictureGesture=null;
  if(event.defaultPrevented||event.button!==0||gesture?.moved||(gesture&&Math.abs(window.scrollY-gesture.scrollY)>10))return;
  if(event.target.closest('button,a,input,audio,.scene-title-block,.scene-body')||window.getSelection()?.toString())return;
  if(pictureFrame.classList.contains('is-between'))showFullPicture();
});
document.querySelector('.orbit-items').addEventListener('keydown', event => {
  const activeIndex = links.indexOf(document.activeElement);
  if (activeIndex === -1) return;
  let target;
  if (['ArrowDown', 'ArrowRight'].includes(event.key)) target = wrap(activeIndex+1,chapters.length);
  if (['ArrowUp', 'ArrowLeft'].includes(event.key)) target = wrap(activeIndex-1,chapters.length);
  if (event.key === 'Home') target = 0;
  if (event.key === 'End') target = chapters.length - 1;
  if (target !== undefined) { event.preventDefault(); links[target].focus({preventScroll: true}); goTo(target); }
});
window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('scrollend',()=>rebase(),{passive:true});
window.addEventListener('resize', measure, { passive: true });
reducedMotion.addEventListener('change', schedule);
window.addEventListener('hashchange', () => {
  const index = chapters.findIndex(chapter => `#${chapter.id}` === window.location.hash);
  if (index !== -1) goTo(index, false);
});
measure();

function applyContent(content) {
  if (!content?.settings || !Array.isArray(content.chapters) || content.chapters.length !== scenes.length) throw new Error('内容格式不正确');
  const settings = content.settings;
  updateOpeningContent(settings);
  const brand = document.querySelector('.brand > span');
  const name = document.createElement('span');name.className='brand-name';name.textContent=settings.brand;brand.replaceChildren(name);
  const english = document.createElement('span');english.className='brand-en';english.textContent=settings.brandEnglish;brand.append(english);
  document.querySelector('.brand').setAttribute('aria-label',settings.brand+'，返回校园篇章');
  document.querySelector('.edition').lastChild.textContent=settings.edition;
  document.querySelector('.header-label').textContent=settings.badge;
  document.querySelector('.scene-heading > span:first-child').textContent=settings.exploreLabel;
  const footer=document.querySelector('.footer-left');
  footer.replaceChildren(document.createTextNode(settings.footerLeft));
  const separator=document.createElement('span');separator.className='footer-separator';separator.textContent='/';
  const footerEnglish=document.createElement('span');footerEnglish.className='footer-en';footerEnglish.textContent=settings.footerEnglish;footer.append(separator,footerEnglish);
  document.querySelector('.footer-right').textContent=settings.footerRight;
  document.title=settings.browserTitle;
  document.querySelector('meta[name="description"]').content=settings.description;
  content.chapters.forEach((chapter,i)=>{
    Object.assign(chapters[i],chapter);
    copies[i].style.setProperty('--title-size',`${chapter.titleSize??60}px`);
    copies[i].style.setProperty('--body-size',`${chapter.bodySize??16}px`);
    links[i].querySelector('span:last-child').textContent=chapter.name;
    scenes[i].querySelector('.scene-kicker').textContent=`${String(i+1).padStart(2,'0')} / ${chapter.name}`;
    const heading=scenes[i].querySelector('h1,h2');heading.textContent=chapter.title;heading.hidden=!chapter.title.trim();
    if(heading.hidden){scenes[i].removeAttribute('aria-labelledby');scenes[i].setAttribute('aria-label',chapter.name);}
    else{scenes[i].setAttribute('aria-labelledby',heading.id);scenes[i].removeAttribute('aria-label');}
    scenes[i].querySelector('.scene-copy p').textContent=chapter.body;
    images[i].src=chapter.image;images[i].alt=chapter.alt;
    images[i].style.objectPosition=`${chapter.positionX}% ${chapter.positionY}%`;
    positionText(copies[i],chapter);
  });
  current=-1;render();
}
let loadingContent=false;
async function refreshContent() {
  if(loadingContent)return;loadingContent=true;
  let notice=document.querySelector('#content-notice');
  try {
    const response=await fetch('/api/content',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw new Error('内容暂时无法加载');
    const data=await response.json();applyContent(data.content);notice?.remove();
  }catch{
    if(!notice){notice=document.createElement('button');notice.id='content-notice';notice.textContent='最新内容暂时无法加载，点击重试';notice.addEventListener('click',refreshContent);document.body.append(notice);}
  }finally{loadingContent=false;}
}
refreshContent();

if(typeof BroadcastChannel==='function'){
  const contentUpdates=new BroadcastChannel('admissions-content');
  contentUpdates.addEventListener('message',event=>{if(event.data==='saved')refreshContent();});
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshContent();});
window.addEventListener('focus',refreshContent);
