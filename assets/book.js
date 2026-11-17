/* WHITE ALBUM: paginate once, animate a separate pointer-transparent leaf. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const book=$('book'),inside=$('inside'),cover=$('cover'),left=$('left-slot'),right=$('right-slot'),stage=$('turn-stage'),measure=$('measure'),bank=$('page-bank');
const previous=$('previous'),next=$('next'),status=$('page-status'),announcer=$('reading-status'),articleRibbon=$('article-ribbon');
const mobile=matchMedia('(max-width:800px)'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
const sources=new Map(Array.from(document.querySelectorAll('#chapter-sources>template')).map(t=>[t.dataset.chapter,t]));
const aboutUrl=sources.get('about').dataset.url;
const alias=key=>{const source=sources.get(key);return source&&source.dataset.kind==='article'&&aboutUrl&&source.dataset.url===aboutUrl?'about':key;};
const order=Array.from(sources.keys()).filter(key=>alias(key)===key);
const cache=new Map();
let chapter='home',page=0,pages=[],opened=false,busy=false,pending=null,turnTimer,coverTimer,resizeTimer,ready=false;
let metrics={width:0,height:0,key:''};
let finishTurn=null;
const step=()=>mobile.matches?1:2;
const normalized=text=>text.replace(/\s+/g,'');
function createSheet(content,title,index,count){
 const sheet=document.createElement('section');sheet.className='sheet'+(content?'':' blank-page');
 const header=document.createElement('div');header.className='running-header';
 const name=document.createElement('span');name.className='chapter-name';name.textContent=title;
 const imprint=document.createElement('span');imprint.textContent='WHITE ALBUM';header.append(name,imprint);
 const body=document.createElement('div');body.className='page-body';body.tabIndex=0;body.dataset.page=String(index+1);
 if(content)body.append(content.content.cloneNode(true));
 const footer=document.createElement('span');footer.className='page-folio';footer.textContent=content?String(index+1).padStart(2,'0'):'';
 sheet.append(header,body,footer);return sheet;
}
function readMetrics(){
 left.replaceChildren(createSheet(null,'',0,0));right.replaceChildren(createSheet(null,'',1,0));
 const body=left.querySelector('.page-body'),rect=body.getBoundingClientRect();
 metrics={width:Math.floor(rect.width),height:Math.floor(rect.height),key:[Math.floor(rect.width),Math.floor(rect.height),step()].join(':')};
 if(metrics.width<50||metrics.height<100)throw Error('Book page is too small');
 measure.style.width=metrics.width+'px';measure.style.height=metrics.height+'px';
 const vars={'--media-height':Math.floor(metrics.height*.65)+'px','--block-height':(metrics.height-4)+'px'};
 for(const [key,value] of Object.entries(vars)){measure.style.setProperty(key,value);book.style.setProperty(key,value);}
}
function fits(){
 const last=measure.lastElementChild;
 return measure.scrollHeight<=metrics.height+1&&(!last||last.getBoundingClientRect().bottom<=measure.getBoundingClientRect().top+metrics.height+1);
}
function splitAt(element,offset){
 const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let textNode,remaining=offset;
 while((textNode=walker.nextNode())){if(remaining<=textNode.length)break;remaining-=textNode.length;}
 if(!textNode)return [element.cloneNode(true),null];
 const prefix=element.cloneNode(false),suffix=element.cloneNode(false),range=document.createRange();
 range.selectNodeContents(element);range.setEnd(textNode,remaining);prefix.append(range.cloneContents());
 range.selectNodeContents(element);range.setStart(textNode,remaining);suffix.append(range.cloneContents());range.detach();
 suffix.removeAttribute('id');
 // Ranges ending at a list boundary can leave an empty LI at either edge.
 for(const [container,last] of [[prefix,true],[suffix,false]]){
  let edge=last?container.lastElementChild:container.firstElementChild;
  while(edge&&edge.matches('li,ul,ol')&&!edge.textContent.trim()&&!edge.querySelector('img,br,iframe,video')){edge.remove();edge=last?container.lastElementChild:container.firstElementChild;}
 }
 if(element.tagName==='OL'){
  let consumed=0,complete=0;for(const child of element.childNodes){consumed+=child.textContent.length;if(child.nodeType===1&&child.tagName==='LI'&&consumed<=offset)complete++;}
  suffix.start=(Number(element.getAttribute('start'))||1)+complete;
 }
 return [prefix,suffix];
}
function graphemeEnds(text){
 if(typeof Intl.Segmenter==='function')return Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text),s=>s.index+s.segment.length);
 const result=[];let index=0;for(const char of text){index+=char.length;result.push(index);}return result;
}
function maxPrefix(node){
 const ends=graphemeEnds(node.textContent);let low=0,high=ends.length-1,best=-1;
 while(low<=high){const mid=(low+high)>>1,[test]=splitAt(node,ends[mid]);measure.append(test);const ok=fits();test.remove();if(ok){best=mid;low=mid+1;}else high=mid-1;}
 if(best<0)return null;
 let cut=ends[best];
 // Prefer a nearby word/sentence boundary, without discarding whitespace.
 const text=node.textContent,start=Math.max(0,cut-35);let boundary=-1;
 for(let i=start;i<cut;i++)if(/[\s，。！？；、,.!?;]/.test(text[i]))boundary=i+1;
 if(boundary>cut*.83&&ends.includes(boundary))cut=boundary;
 return splitAt(node,cut);
}
function paginate(key){
 key=alias(key);const cacheKey=key+'|'+metrics.key;
 if(cache.has(cacheKey))return cache.get(cacheKey);
 const source=sources.get(key),result=[];measure.replaceChildren();
 function commit(){if(!measure.childNodes.length)return;const t=document.createElement('template');t.dataset.page=String(result.length+1);t.content.append(...Array.from(measure.childNodes));result.push(t);}
 if(source.dataset.kind==='home'){
  for(const node of source.content.children){const t=document.createElement('template');t.dataset.page=String(result.length+1);t.content.append(node.cloneNode(true));result.push(t);}
 }else{
  const queue=Array.from(source.content.childNodes).filter(n=>n.nodeType===1||(n.nodeType===3&&n.textContent.trim())).map(n=>{if(n.nodeType===1)return n.cloneNode(true);const p=document.createElement('p');p.textContent=n.textContent;return p;});
  let guard=0;
  while(queue.length){
   if(++guard>10000)throw Error('Pagination did not converge');
   let node=queue.shift();
   const isHeading=/^H[1-6]$/.test(node.tagName)||node.classList.contains('article-heading');
   if(isHeading&&measure.childNodes.length){
    // Keep a heading with at least the first two lines of its following block.
    const following=queue[0];let shouldBreak=false;
    if(following){
     const sample=following.cloneNode(true);
     if(!sample.matches('img,figure,iframe,video')&&!sample.querySelector('img,iframe,video')){sample.style.maxHeight=Math.ceil(parseFloat(getComputedStyle(measure).lineHeight)*2)+'px';sample.style.overflow='hidden';sample.style.marginBottom='0';}
     measure.append(node,sample);shouldBreak=!fits();node.remove();sample.remove();
    }else{const bottom=measure.lastElementChild.getBoundingClientRect().bottom-measure.getBoundingClientRect().top;shouldBreak=metrics.height-bottom<100;}
    if(shouldBreak)commit();
   }
   measure.append(node);if(fits())continue;node.remove();
   const hadContent=measure.childNodes.length>0;
   const atomic=isHeading||node.matches('pre,table,figure,iframe,video,hr,.contents-entry')||Boolean(node.querySelector('img,iframe,video,pre,table'));
   if(hadContent){const last=measure.lastElementChild;const used=last?last.getBoundingClientRect().bottom-measure.getBoundingClientRect().top:0;if(atomic||metrics.height-used<metrics.height*.24){commit();queue.unshift(node);continue;}}
   if(!atomic&&node.textContent.length>1){
    const split=maxPrefix(node);
    if(split&&split[0].textContent.length){measure.append(split[0]);commit();if(split[1]&&(split[1].textContent.length||split[1].querySelector('img,br')))queue.unshift(split[1]);continue;}
   }
   if(hadContent){commit();queue.unshift(node);continue;}
   // Complex media and unusually tall indivisible blocks remain fully accessible.
   const wrapper=document.createElement('div');wrapper.className='oversize-block';wrapper.tabIndex=0;wrapper.append(node);measure.append(wrapper);commit();
  }
  commit();
 }
 if(!result.length){const t=document.createElement('template');t.content.append(document.createElement('p'));result.push(t);}
 // Text must never disappear while being split into pages.
 const original=normalized(source.content.textContent),paginated=normalized(result.map(t=>t.content.textContent).join(''));
 if(original!==paginated)throw Error('Article text changed during pagination');
 cache.set(cacheKey,result);return result;
}
function mount(){
 const source=sources.get(chapter);bank.replaceChildren(...pages);book.dataset.chapter=chapter;book.dataset.totalPages=String(pages.length);book.dataset.firstPage=String(page+1);
 left.replaceChildren(createSheet(pages[page],source.dataset.title,page,pages.length));
 right.replaceChildren(createSheet(pages[page+1],source.dataset.title,page+1,pages.length));
 const last=Math.min(page+step(),pages.length),label=source.dataset.title+' · '+(page+1)+(last>page+1?'–'+last:'')+' / '+pages.length;
 status.textContent=label;announcer.textContent=label;
 previous.disabled=chapter===order[0]&&page===0;
 next.disabled=chapter===order[order.length-1]&&page+step()>=pages.length;
 for(const button of document.querySelectorAll('[data-section]')){if(button.dataset.section===chapter)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
 const article=source.dataset.kind==='article';articleRibbon.hidden=!article;if(article){articleRibbon.setAttribute('aria-current','page');articleRibbon.title=source.dataset.title;}else articleRibbon.removeAttribute('aria-current');
 document.title=(chapter==='home'?'WHITE ALBUM':source.dataset.title)+' · L0ngD1';
}
function updateUrl(push){
 const hash=new URLSearchParams({section:chapter,page:String(page+1)}).toString();
 if(location.hash.slice(1)===hash)return;
 history[push?'pushState':'replaceState'](null,'','#'+hash);
}
function cloneForAnimation(slot){
 const clone=slot.firstElementChild.cloneNode(true);clone.removeAttribute('id');for(const node of clone.querySelectorAll('[id]'))node.removeAttribute('id');return clone;
}
function cancelTurn(){pending=null;if(finishTurn)finishTurn();}
function animate(oldLeft,oldRight,forward){
 if(reduced.matches||!opened)return;
 busy=true;const leaf=document.createElement('div');leaf.className='turning-leaf '+(forward?'forward':'backward');
 const front=document.createElement('div'),back=document.createElement('div');front.className='leaf-face front';back.className='leaf-face back';
 front.append(forward?(mobile.matches?oldLeft:oldRight):oldLeft);back.append(cloneForAnimation(forward?left:right));leaf.append(front,back);
 if(!mobile.matches){const stationary=document.createElement('div');stationary.className='stationary-leaf '+(forward?'left':'right');stationary.append(forward?oldLeft:oldRight);stage.append(stationary);}
 stage.append(leaf);book.classList.add('page-turning');
 let done=false;
 finishTurn=function(){if(done)return;done=true;clearTimeout(turnTimer);stage.replaceChildren();book.classList.remove('page-turning');busy=false;finishTurn=null;const action=pending;pending=null;if(action)requestAnimationFrame(()=>{if(action.key)go(action.key,action.page,action.forward);else advance(action.delta);});};
 leaf.addEventListener('animationend',event=>{if(event.target===leaf)finishTurn&&finishTurn();});
 turnTimer=setTimeout(()=>finishTurn&&finishTurn(),650);
}
function go(key,index=0,forward=true,options={}){
 key=alias(key);if(!sources.has(key))return;
 if(busy&&!options.immediate){pending={key,page:index,forward};return;}
 if(options.immediate)cancelTurn();
 const target=paginate(key);index=Math.max(0,Math.min(Number(index)||0,target.length-1));index=Math.floor(index/step())*step();
 if(key===chapter&&index===page&&pages.length&&!options.force)return;
 const oldLeft=left.firstElementChild?cloneForAnimation(left):null,oldRight=right.firstElementChild?cloneForAnimation(right):null,changed=chapter!==key;
 chapter=key;page=index;pages=target;mount();
 if(options.url!==false)updateUrl(changed);
 if(!options.immediate&&oldLeft&&oldRight)animate(oldLeft,oldRight,forward);
}
function advance(delta){
 if(!opened||!ready)return;if(busy){pending={delta};return;}
 const target=page+delta*step(),position=order.indexOf(chapter);
 if(target<0){if(position>0){const previousKey=order[position-1];go(previousKey,paginate(previousKey).length-1,false);}}
 else if(target>=pages.length){if(position<order.length-1)go(order[position+1],0,true);}
 else go(chapter,target,delta>0);
}
function finishCover(){
 clearTimeout(coverTimer);book.classList.remove('cover-moving');book.classList.toggle('cover-finished',opened);inside.inert=!opened;
 if(opened&&(document.activeElement===document.body||document.activeElement===cover))left.querySelector('.page-body').focus({preventScroll:true});
}
function openBook(){
 if(opened)return;if(!ready){bootPromise.then(openBook);return;}
 opened=true;book.classList.add('is-open','cover-moving');inside.inert=true;cover.setAttribute('aria-expanded','true');cover.tabIndex=-1;
 cover.inert=true;cover.setAttribute('aria-hidden','true');
 clearTimeout(coverTimer);if(reduced.matches)finishCover();else coverTimer=setTimeout(finishCover,820);
}
function closeBook(){
 if(!opened)return;cancelTurn();opened=false;book.classList.remove('cover-finished','is-open');book.classList.add('cover-moving');
 cover.inert=false;cover.removeAttribute('aria-hidden');cover.tabIndex=0;cover.setAttribute('aria-expanded','false');cover.focus({preventScroll:true});inside.inert=true;
 clearTimeout(coverTimer);if(reduced.matches)finishCover();else coverTimer=setTimeout(finishCover,820);
 history.replaceState(null,'',location.pathname+location.search);
}
function locationTarget(){
 const hash=new URLSearchParams(location.hash.slice(1)),requested=alias(hash.get('section'));
 if(sources.has(requested))return {key:requested,page:Math.max(0,(Number(hash.get('page'))||1)-1),open:true};
 const current=document.body.dataset.currentUrl,entry=Array.from(sources.entries()).find(([,source])=>source.dataset.url&&source.dataset.url===current);
 return entry?{key:alias(entry[0]),page:0,open:true}:{key:'home',page:0,open:false};
}
function rebuild(){
 if(!ready)return;cancelTurn();
 const offset=pages.slice(0,page).reduce((n,t)=>n+t.content.textContent.length,0),key=chapter;
 readMetrics();cache.clear();const updated=paginate(key);let consumed=0,index=0;
 for(let i=0;i<updated.length;i++){if(consumed+updated[i].content.textContent.length>offset){index=i;break;}consumed+=updated[i].content.textContent.length;index=i;}
 go(key,index,true,{immediate:true,force:true});
}
cover.addEventListener('click',openBook);cover.addEventListener('transitionend',event=>{if(event.target===cover&&event.propertyName==='transform')finishCover();});
$('close-book').addEventListener('click',closeBook);previous.addEventListener('click',()=>advance(-1));next.addEventListener('click',()=>advance(1));
document.querySelectorAll('[data-section]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.section;go(key,0,order.indexOf(key)>=order.indexOf(chapter));}));
articleRibbon.addEventListener('click',()=>{if(sources.get(chapter).dataset.kind==='article')go(chapter,0,false);});
inside.addEventListener('click',event=>{
 const a=event.target.closest('a');if(!a||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 let key=a.dataset.open;
 if(!key){try{const url=new URL(a.href,location.href);const entry=Array.from(sources.entries()).find(([,source])=>source.dataset.url&&new URL(source.dataset.url,location.href).pathname===url.pathname&&url.origin===location.origin);if(entry)key=entry[0];}catch(_){} }
 if(key&&sources.has(key)){event.preventDefault();go(key,0,true);return;}
 if(a.getAttribute('href')?.startsWith('#')){const id=decodeURIComponent(a.hash.slice(1));const index=pages.findIndex(t=>t.content.querySelector('#'+CSS.escape(id)));if(index>=0){event.preventDefault();go(chapter,index,index>=page);}}
});
// The lower paper corners are additional page-turn targets, not full-page overlays.
left.addEventListener('click',event=>{if(event.target.closest('a,button,input,video,iframe'))return;const r=left.getBoundingClientRect();if(event.clientY>r.bottom-85){if(mobile.matches&&event.clientX>r.right-30)advance(1);else if(event.clientX<r.left+30)advance(-1);}});
right.addEventListener('click',event=>{if(event.target.closest('a,button,input,video,iframe'))return;const r=right.getBoundingClientRect();if(event.clientX>r.right-30&&event.clientY>r.bottom-85)advance(1);});
document.addEventListener('keydown',event=>{if(!opened||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;if(event.key==='Escape'){event.preventDefault();closeBook();return;}if(window.getSelection()?.toString())return;if(event.key==='ArrowRight'||event.key==='PageDown'){event.preventDefault();advance(1);}else if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();advance(-1);}});
let touchStart=null;
inside.addEventListener('touchstart',event=>{if(event.target.closest('a,button,pre,table,iframe,video,.oversize-block'))return;const touch=event.touches[0];touchStart={x:touch.clientX,y:touch.clientY};},{passive:true});
inside.addEventListener('touchend',event=>{if(!touchStart)return;const touch=event.changedTouches[0],dx=touch.clientX-touchStart.x,dy=touch.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5&&!window.getSelection()?.toString())advance(dx<0?1:-1);},{passive:true});
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(rebuild,220);});
window.addEventListener('popstate',()=>{if(!ready)return;const target=locationTarget();go(target.key,target.page,true,{immediate:true,url:false,force:true});if(target.open)openBook();else if(opened)closeBook();});
const bootPromise=(async()=>{
 if(document.fonts?.ready)await document.fonts.ready;
 readMetrics();go('home',0,true,{immediate:true,url:false,force:true});ready=true;
 const target=locationTarget();if(target.key!=='home'||target.page)go(target.key,target.page,true,{immediate:true,url:false,force:true});if(target.open)openBook();
 // Resolve image dimensions outside page-turn frames, then repaginate only if needed.
 const jobs=[];for(const source of sources.values())for(const image of source.content.querySelectorAll('img')){
  if(image.width&&image.height)continue;
  const probe=new Image();probe.src=image.getAttribute('src');jobs.push(probe.decode().then(()=>{image.width=probe.naturalWidth;image.height=probe.naturalHeight;}).catch(()=>{}));
 }
 if(jobs.length)Promise.all(jobs).then(()=>{if(ready)rebuild();});
})().catch(error=>{console.error('Book setup failed',error);document.querySelector('.opening-hint').textContent='页面暂未排好，请刷新重试。';});
})();
