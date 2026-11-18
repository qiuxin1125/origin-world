import { engine } from './engine.js';
import { renderView } from './views.js';
import { icon, wordmark } from './icons.js';
const side=document.querySelector('#sidebar'), top=document.querySelector('#topbar'), main=document.querySelector('#main'), dialog=document.querySelector('#search-dialog');
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const themeMeta={tide:{title:'海岸档案',image:'tide',icon:'wave'},radio:{title:'声音共创',image:'radio',icon:'radio'},forest:{title:'森林通信',image:'forest',icon:'leaf'}};
const titles={home:'世界广场',world:'世界现场',residents:'居民名册',journal:'旅行手记',create:'创作空间'};
let filter='all',timer;
function readRoute(){
  const [page,id]=location.hash.replace(/^#\/?/,'').split('/');
  const view=Object.hasOwn(titles,page)?page:'home';
  let arg;try{arg=decodeURIComponent(id||'')}catch{arg=''}
  if(view==='create')return {view,params:{kind:arg==='agent'?'agent':'world'}};
  if(view==='residents'||view==='journal')return {view,params:{tab:arg}};
  return {view,params:{id:arg||'origin'}};
}
function closeMenu(){document.body.classList.remove('menu-open');document.querySelector('#scrim').hidden=true;top.querySelector('.mobile-menu')?.setAttribute('aria-expanded','false')}
function go(view,params={}){
  closeMenu();if(dialog.open)dialog.close();
  const path='#/'+view+(view==='world'?'/'+encodeURIComponent(params.id||'origin'):view==='create'?'/'+(params.kind==='agent'?'agent':'world'):params.tab?'/'+encodeURIComponent(params.tab):'');
  if(location.hash===path)render();else location.hash=path;
}
function notify(message){
  const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('show');
  clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove('show'),3200);
}
function shell(state,route){
  const actor=state.agents.find(a=>a.id===state.control.actorId);
  const nav=(v,label,symbol)=>`<button class="nav-link ${route.view===v?'active':''}" data-nav="${v}" ${route.view===v?'aria-current="page"':''}>${icon(symbol,20)}<span>${label}</span></button>`;
  side.innerHTML=`<button class="brand" data-nav="home" aria-label="源界首页">${wordmark()}<span><strong>源界</strong><small>Origin Atlas</small></span></button>
    <nav><div class="nav-label">世界导航</div>${nav('home','世界广场','compass')}${nav('residents','居民名册','residents')}${nav('journal','旅行手记','journal')}</nav>
    <div class="side-create"><span class="nav-label">创作</span><button class="nav-link" data-new="world">${icon('atlas',20)}创建世界</button><button class="nav-link" data-new="agent">${icon('spark',20)}创建 Agent</button></div>
    <div class="side-bottom"><button data-nav="residents" class="identity"><span class="profile-disc">${icon(actor?'spark':'person',19)}</span><span><b>${escapeHTML(actor?.name||'旅行者')}</b><small><i></i>${actor?'正在接管角色':'本人参与'}</small></span>${icon('chevron',14)}</button></div>`;
  top.innerHTML=`<div class="crumb"><button class="icon-btn mobile-menu" data-menu aria-label="展开导航" aria-expanded="false">${icon('menu')}</button>${icon('atlas',17)}<span>源界</span><span class="slash">/</span><strong>${titles[route.view]}</strong></div>
    <div class="tools"><button class="search-trigger" data-search>${icon('search',15)}<span>搜索世界</span><kbd>/</kbd></button><span class="tool-divider"></span><button class="avatar" data-nav="residents" aria-label="查看当前身份">${icon(actor?'spark':'person',17)}</button></div>`;
  document.title=`${titles[route.view]} · 源界`;
}
function card(world,state){
  const meta=themeMeta[world.id]||themeMeta[world.theme]||themeMeta.forest;
  const owned=!Object.hasOwn(themeMeta,world.id), residents=state.agents.filter(a=>(a.homeWorldId||a.worldId)===world.id);
  return `<button class="world-card ${meta.image}" data-world="${escapeHTML(world.id)}" aria-label="查看${escapeHTML(world.name)}">
    <div class="card-pic"><img src="assets/${meta.image}.webp" alt="" loading="eager"><span class="world-kind">${icon(meta.icon,13)}${owned?'我的世界':meta.title}</span></div>
    <div class="card-copy"><div class="card-name"><h3>${escapeHTML(world.name)}</h3>${icon('diagonal',18)}</div><p>${escapeHTML(world.tagline||world.description)}</p>
    <div class="card-foot"><span>${icon('person',14)}${escapeHTML(world.creator||'源界编辑部')}</span><span>${icon('residents',15)}${residents.length} 位居民</span></div></div></button>`;
}
function home(state){
  const worlds=state.worlds.filter(w=>w.id!=='origin');
  const visited=new Set(state.journeys.map(j=>j.worldId));if(state.activeVisit)visited.add(state.activeVisit.worldId);
  const shown=worlds.filter(w=>filter==='all'||(filter==='visited'?visited.has(w.id):!Object.hasOwn(themeMeta,w.id)));
  const live=state.activeVisit,current=state.worlds.find(w=>w.id===state.currentWorldId);
  const events=state.events.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,3);
  const tabs=[['all','全部'],['visited','已探访'],['mine','我创建的']].map(([key,label])=>`<button data-filter="${key}" aria-pressed="${key===filter}" class="${key===filter?'chosen':''}">${label}</button>`).join('');
  main.innerHTML=`<div class="home"><header class="page-heading"><div><h1>世界广场</h1><p>探索创作者的世界，遇见这里的人与 Agent。</p></div><button class="btn primary" data-new="world">${icon('plus',17)}创建世界</button></header>
    <section class="hero" aria-label="公共源世界"><img class="hero-art" src="assets/hero.webp" alt=""><div class="hero-content"><span class="source-label"><i></i>${live?'旅程进行中':'公共源世界'}</span>
      <h2>${live?escapeHTML(current?.name):'群岛会客厅'}</h2><p>${live?'继续你在这个世界里的经历。':'一片共享的群岛。在这里与居民相识，交换见闻，或一起启程。'}</p><button class="hero-btn" data-world="${escapeHTML(live?state.currentWorldId:'origin')}">${live?'继续旅程':'进入会客厅'}${icon('arrow',16)}</button></div></section>
    <section class="catalog"><div class="section-head"><div class="section-title"><span class="title-icon">${icon('atlas',20)}</span><h2>创作者世界</h2><span class="count">${worlds.length}</span></div><div class="segments" aria-label="筛选世界">${tabs}</div></div>
    ${shown.length?`<div class="card-grid">${shown.map(w=>card(w,state)).join('')}</div>`:`<div class="empty"><b>${filter==='mine'?'你还没有创建世界':'还没有探访过的世界'}</b><button class="btn" ${filter==='mine'?'data-new="world"':'data-filter="all"'}>${filter==='mine'?'创建第一个世界':'浏览全部世界'}</button></div>`}</section>
    <section class="recent"><div class="section-head"><div class="section-title"><span class="title-icon">${icon('clock',20)}</span><h2>最近发生</h2></div><button class="text-link" data-nav="journal">查看手记 ${icon('arrow',14)}</button></div>
    ${events.length?`<div class="recent-list">${events.map(e=>`<div><span class="event-mark">${icon('journal',15)}</span><strong>${escapeHTML(e.actorName||'世界')}</strong><p>${escapeHTML(e.text)}</p><small>${escapeHTML(state.worlds.find(w=>w.id===e.worldId)?.name||'')}</small></div>`).join('')}</div>`:'<div class="recent-empty">进入会客厅发言后，你的第一段经历会出现在这里。</div>'}</section></div>`;
}
function render(){
  const state=engine.snapshot(),route=readRoute();shell(state,route);
  if(route.view==='home')home(state);else renderView(main,route.view,route.params,{go,notify,icon,state,engine});
}
function updateResults(q){
  const worlds=engine.snapshot().worlds.filter(w=>`${w.name} ${w.tagline||''} ${w.description}`.toLowerCase().includes(q.toLowerCase().trim()));
  dialog.querySelector('.results').innerHTML=worlds.map(w=>`<button data-world="${escapeHTML(w.id)}">${icon(w.id==='origin'?'globe':'atlas',19)}<span>${escapeHTML(w.name)}<small>${escapeHTML(w.tagline||w.role||'公共源世界')}</small></span>${icon('chevron',15)}</button>`).join('')||'<p>没有找到符合的世界。</p>';
}
function openSearch(){
  dialog.innerHTML=`<div class="search-line">${icon('search',21)}<input id="world-query" placeholder="搜索世界名称或介绍" aria-label="搜索世界名称或介绍" type="search" maxlength="120"><button class="icon-btn" data-close-search aria-label="关闭搜索">${icon('close',18)}</button></div><div class="results"></div>`;
  updateResults('');dialog.showModal();dialog.querySelector('input').focus();dialog.querySelector('input').oninput=e=>updateResults(e.target.value);
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-world'))go('world',{id:b.dataset.world});
  else if(b.dataset.nav)go(b.dataset.nav);
  else if(b.dataset.new)go('create',{kind:b.dataset.new});
  else if(b.dataset.filter){filter=b.dataset.filter;home(engine.snapshot());main.querySelector(`[data-filter="${filter}"]`)?.focus({preventScroll:true})}
  else if(b.hasAttribute('data-search'))openSearch();
  else if(b.hasAttribute('data-close-search'))dialog.close();
  else if(b.hasAttribute('data-menu')){document.body.classList.toggle('menu-open');document.querySelector('#scrim').hidden=!document.body.classList.contains('menu-open');b.setAttribute('aria-expanded',String(!document.querySelector('#scrim').hidden))}
});
document.querySelector('#scrim').addEventListener('click',closeMenu);
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeMenu();if(e.key==='/'&&!dialog.open&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target.closest('input,textarea,select,[contenteditable="true"]')){e.preventDefault();openSearch()}
});
window.addEventListener('hashchange',()=>{window.scrollTo(0,0);render();main.focus({preventScroll:true})});
engine.subscribe(render);
render();
