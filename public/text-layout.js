const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function prepareText(layer){
  if(layer.querySelector('.scene-title-block'))return;
  const heading=layer.querySelector('h1,h2');
  const kicker=layer.querySelector('.scene-kicker,#preview-kicker');
  const group=document.createElement('div');group.className='scene-title-block';
  group.append(kicker,heading);layer.prepend(group);
  layer.querySelector('p').classList.add('scene-body');
}
export function positionText(layer,chapter){
  prepareText(layer);
  const {width,height}=layer.getBoundingClientRect();if(!width||!height)return;
  const padding=Math.min(32,Math.max(16,width*.045));
  const areaWidth=Math.max(1,width-padding*2),areaHeight=Math.max(1,height-padding*2);
  const title=layer.querySelector('.scene-title-block'),body=layer.querySelector('.scene-body');
  body.hidden=!body.textContent.trim();
  for(const block of [title,body]){block.classList.remove('has-overflow');block.style.width='max-content';block.style.maxWidth=areaWidth+'px';block.style.maxHeight='none';}
  const naturalTitle=title.getBoundingClientRect().height,naturalBody=body.hidden?0:body.getBoundingClientRect().height;
  const gap=naturalBody?16:0;
  let titleHeight=naturalTitle,bodyHeight=naturalBody;
  if(titleHeight+bodyHeight+gap>areaHeight){titleHeight=Math.min(titleHeight,areaHeight*.6);bodyHeight=Math.min(bodyHeight,Math.max(20,areaHeight-titleHeight-gap));}
  title.style.maxHeight=titleHeight+'px';body.style.maxHeight=bodyHeight+'px';
  const bodyBase=height-padding-bodyHeight,titleBase=bodyBase-gap-titleHeight;
  for(const [block,prefix,base,blockHeight] of [[title,'title',titleBase,titleHeight],[body,'body',bodyBase,bodyHeight]]){
    const blockWidth=Math.min(areaWidth,block.getBoundingClientRect().width);
    const x=padding+(chapter[prefix+'X']??0)/100*areaWidth;
    const y=base+(chapter[prefix+'Y']??0)/100*areaHeight;
    block.style.left=clamp(x,padding,width-padding-blockWidth)+'px';
    block.style.top=clamp(y,padding,height-padding-blockHeight)+'px';
    const overflow=block.scrollHeight>blockHeight+1;block.classList.toggle('has-overflow',overflow);
    if(overflow){block.setAttribute('tabindex','0');block.setAttribute('role','region');block.setAttribute('aria-label',prefix==='title'?'标题，滚动阅读':'正文，滚动阅读');}
    else{for(const key of ['tabindex','role','aria-label'])block.removeAttribute(key);}
  }
}
