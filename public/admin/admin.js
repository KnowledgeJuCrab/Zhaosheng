import {prepareText,positionText} from '/text-layout.js';
const $=selector=>document.querySelector(selector);
prepareText($('.preview-copy'));
let content,revision=0,selected=0,dirty=false,busy=false,uploadedName='',toastTimer;
const saveButton=$('#save');const chapterForm=$('#chapter-form');const settingsForm=$('#settings-form');
function error(message=''){$('#error').textContent=message;$('#error').hidden=!message;}
function status(message,unsaved=false){$('#status').textContent=message;$('#status').classList.toggle('dirty',unsaved);}
function updateButtons(){saveButton.disabled=!content||!dirty||busy;$('#reload').disabled=busy;for(const form of [chapterForm,settingsForm])for(const input of form.elements)input.disabled=busy;for(const button of document.querySelectorAll('.chapter-tab,#settings-tab'))button.disabled=busy;}
function markDirty(){dirty=true;status('有未保存的更改',true);updateButtons();}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4000);}
async function api(url,options={}){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});let data;try{data=await response.json();}catch{throw new Error('服务返回异常，请稍后重试。');}if(!response.ok)throw new Error(data.error||'操作失败，请重试。');return data;}
function setSavedTime(value){$('#saved-time').textContent=value?'上次保存：'+new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'尚未修改';}
function navigation(){const nav=$('#chapter-nav');nav.replaceChildren();content.chapters.forEach((chapter,i)=>{const button=document.createElement('button');button.type='button';button.className='chapter-tab'+(selected===i?' active':'');button.setAttribute('aria-pressed',String(selected===i));const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');button.append(number,document.createTextNode(chapter.name));button.addEventListener('click',()=>select(i));nav.append(button);});$('#settings-tab').classList.toggle('active',selected==='settings');$('#settings-tab').setAttribute('aria-pressed',String(selected==='settings'));}
function select(index){selected=index;uploadedName='';error();navigation();const settings=selected==='settings';$('#editor').hidden=settings;settingsForm.hidden=!settings;$('#editor-kicker').textContent=settings?'SITE SETTINGS':`CHAPTER ${String(selected+1).padStart(2,'0')} / ${String(content.chapters.length).padStart(2,'0')}`;$('#editor-title').textContent=settings?'网站设置':content.chapters[selected].name;if(settings){for(const input of settingsForm.elements)if(input.name)input.value=content.settings[input.name];}else{for(const input of chapterForm.elements)if(input.name)input.value=content.chapters[selected][input.name];preview();}}
function preview(){
  if(!content||selected==='settings')return;
  const chapter=content.chapters[selected];
  $('#preview-image').src=chapter.image;$('#preview-image').alt=chapter.alt;$('#preview-image').style.objectPosition=`${chapter.positionX}% ${chapter.positionY}%`;
  $('#preview-kicker').textContent=`${String(selected+1).padStart(2,'0')} / ${chapter.name}`;
  $('#preview-title').textContent=chapter.title;$('#preview-title').hidden=!chapter.title.trim();
  $('#preview-body').textContent=chapter.body;$('#preview-caption').textContent=chapter.caption;
  $('.preview-card').style.setProperty('--title-size',`${chapter.titleSize}px`);$('.preview-card').style.setProperty('--body-size',`${chapter.bodySize}px`);
  $('#title-size-value').textContent=chapter.titleSize+' px';$('#body-size-value').textContent=chapter.bodySize+' px';
  for(const key of ['titleX','titleY','bodyX','bodyY'])$('#'+key+'-value').textContent=chapter[key]+'%';
  positionText($('.preview-copy'),chapter);
  $('#x-value').textContent=chapter.positionX+'%';$('#y-value').textContent=chapter.positionY+'%';$('#image-name').textContent=uploadedName||'当前篇章图片';
}
async function load(){if(busy)return;if(dirty&&!confirm('重新加载会放弃尚未保存的更改。继续吗？'))return;busy=true;updateButtons();status('正在获取网站内容…');error();try{const data=await api('/api/content');content=structuredClone(data.content);revision=data.revision;dirty=false;setSavedTime(data.updatedAt);if(selected!=='settings'&&selected>=content.chapters.length)selected=0;select(selected);status('所有更改已保存');}catch(e){error(e.message);status('内容加载失败，请点击重新加载');}finally{busy=false;updateButtons();}}
async function save(){if(busy||!dirty)return;const form=selected==='settings'?settingsForm:chapterForm;if(!form.reportValidity())return;busy=true;updateButtons();error();status('正在保存…');saveButton.textContent='正在保存…';try{const data=await api('/api/content',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,revision})});revision=data.revision;content=data.content;dirty=false;setSavedTime(data.updatedAt);status('所有更改已保存');toast('保存成功，前台内容已更新');}catch(e){error(e.message);status('保存未成功，更改已保留',true);}finally{busy=false;saveButton.textContent='保存并更新';updateButtons();}}
chapterForm.addEventListener('input',event=>{const input=event.target;if(!input.name||!content||selected==='settings')return;content.chapters[selected][input.name]=input.type==='range'?Number(input.value):input.value;markDirty();preview();if(input.name==='name'){navigation();$('#editor-title').textContent=input.value||'未命名篇章';}});
settingsForm.addEventListener('input',event=>{if(!event.target.name||!content)return;content.settings[event.target.name]=event.target.value;markDirty();});
for(const form of [chapterForm,settingsForm])form.addEventListener('submit',event=>{event.preventDefault();save();});
$('#image-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){error('请选择 JPG、PNG 或 WebP 图片。');event.target.value='';return;}if(file.size>8*1024*1024){error('图片不能超过 8 MB。');event.target.value='';return;}const target=selected;busy=true;updateButtons();status('正在上传图片…');error();try{const data=await api('/api/images',{method:'POST',headers:{'Content-Type':file.type},body:file});content.chapters[target].image=data.url;if(target===selected)uploadedName=file.name;markDirty();preview();toast('图片已上传，保存后会更新到前台');}catch(e){error(e.message);status(dirty?'有未保存的更改':'图片上传失败，请重试',dirty);}finally{busy=false;event.target.value='';updateButtons();}});
$('#settings-tab').addEventListener('click',()=>{if(content)select('settings');});$('#reload').addEventListener('click',load);saveButton.addEventListener('click',save);
window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();save();}});
load();
window.addEventListener('resize',preview);
