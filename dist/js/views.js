// World, resident and journal routes share the state engine with the atlas home.
const drafts = new Map();
const panels = new Map();
let visibleRoute = '';
let focusedField = null;
const ink = [
  ['#e6ead9', '#536345'], ['#f2e0d0', '#795741'],
  ['#dae8e7', '#48625e'], ['#e7e1ed', '#69596d']
];
const dayFormat = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const art = { tide: 'tide', radio: 'radio', forest: 'forest' };
const eventNames = { arrival: '抵达', speech: '发言', reply: '回应', ambient: '自主行动', return: '返航', control: '身份切换', opening:'场景开放', departure:'离开' };

function el(tag, cls, ...children) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}
function button(text, fn, style = '') {
  const b = el('button', 'av-btn ' + style, text);
  b.type = 'button';
  b.onclick = fn;
  return b;
}
function plainButton(text, fn, cls) {
  const b = button(text, fn);
  b.className = cls;
  return b;
}
function row(...items) { return el('div', 'av-row', items); }
function chip(text) { return el('span', 'av-chip', text); }
function panel(title, ...children) { return el('section', 'av-panel', title && el('h2', 'av-title', title), children); }
function heading(title, desc, action) {
  return el('div', 'av-head', el('div', '', el('h1', '', title), desc && el('p', '', desc)), action);
}
function body(text) { return el('p', 'av-body', text); }
function fine(text) { return el('span', 'av-fine', text); }
function empty(text, action) { return el('div', 'av-empty', el('p', '', text), action && row(action)); }
function date(value, withTime = false) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return dayFormat.format(d) + (withTime ? ' ' + timeFormat.format(d) : '');
}
function avatar(name = '') {
  const chars = Array.from(name || '旅人');
  const [bg, fg] = ink[(chars[0].codePointAt(0) || 0) % ink.length];
  const a = el('span', 'av-avatar', chars[0]);
  a.style.backgroundColor = bg;
  a.style.color = fg;
  a.setAttribute('aria-hidden', 'true');
  return a;
}
function who(state, id) {
  return id === 'self' ? (state.self.name || '你') : state.agents.find(a => a.id === id)?.name || '旅人';
}
function worldName(state, id) { return state.worlds.find(w => w.id === id)?.name || '源世界'; }
function properties(items) {
  const list = el('dl', 'av-dl');
  for (const [key, value] of items) {
    if (value) list.append(el('div', '', el('dt', '', key), el('dd', '', value)));
  }
  return list;
}
function remember(key) {
  if (!drafts.has(key)) drafts.set(key, {});
  return drafts.get(key);
}
function storeInput(input, store) {
  if (Object.hasOwn(store, input.name)) input.value = store[input.name];
  input.addEventListener('input', () => { store[input.name] = input.value; });
}
function labelInput(store, spec) {
  const wrap = el('label', 'av-field', el('span', '', spec.label));
  let field;
  if (spec.options) {
    field = el('select', 'av-select');
    for (const [value, text] of spec.options) {
      const opt = el('option', '', text);
      opt.value = value;
      field.append(opt);
    }
  } else if (spec.long) {
    field = el('textarea', 'av-area');
    field.rows = spec.rows || 3;
  } else {
    field = el('input', 'av-input');
    field.type = 'text';
  }
  field.name = spec.name;
  field.required = Boolean(spec.required);
  if (spec.max) field.maxLength = spec.max;
  if (spec.placeholder) field.placeholder = spec.placeholder;
  if (spec.defaultValue !== undefined) field.value = spec.defaultValue;
  storeInput(field, store);
  wrap.append(field);
  if (spec.hint) wrap.append(el('small', '', spec.hint));
  return wrap;
}
function dispatch(api, action, args = [], success, after) {
  const result = api.engine.actions[action](...args);
  if (!result.ok) {
    api.notify(result.error || '操作未完成，请再试一次。');
    return result;
  }
  if (success) api.notify(success);
  if (after) after(result);
  return result;
}
function tabs(names, selected, choose) {
  const list = el('div', 'av-tabs');
  for (const [id, name] of names) {
    const b = plainButton(name, () => choose(id), '');
    b.setAttribute('aria-pressed', String(selected === id));
    list.append(b);
  }
  return list;
}
function timeline(events, state) {
  const list = el('div', 'av-list');
  for (const evt of events) {
    const name = evt.actorName || who(state, evt.actorId);
    const kind = evt.kind === 'speech' && evt.actorId !== 'self'
      ? (evt.controlledBy === 'agent' ? '自主发言' : '接管发言') : eventNames[evt.kind] || '记录';
    const stamp = el('time', 'av-when', date(evt.createdAt, true));
    if (evt.createdAt) stamp.dateTime = new Date(evt.createdAt).toISOString();
    list.append(el('article', 'av-entry', avatar(name),
      el('div', '', el('div', 'av-byline', el('strong', '', name),
        fine(kind), stamp), el('p', '', evt.text || ''))));
  }
  return list;
}
function sceneComposer(api, state, world) {
  const actor = who(state, state.control.actorId);
  const key = ['speak', world.id, state.activeVisit?.id || 'home', state.control.actorId].join('/');
  const store = remember(key);
  const form = el('form', 'av-composer');
  const field = labelInput(store, { name: 'message', label: '以' + (state.control.mode === 'self' ? '本人' : '「' + actor + '」') + '的身份发言',
    long: true, rows: 2, required: true, max: 400, placeholder: '你想说什么，或想和这里的居民一起做什么？' });
  const send = el('button', 'av-btn av-btn-strong', '发言');
  send.type = 'submit';
  const note = fine('当前由你发言');
  const error = el('p', 'av-error');
  error.setAttribute('role', 'alert');
  const input = field.querySelector('textarea');
  form.append(field, error, el('div', 'av-composer-foot', note, send));
  form.onsubmit = ev => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) { error.textContent = '请输入一段内容。'; input.focus(); return; }
    // State subscribers redraw synchronously, so clear the committed draft first.
    store.message = '';
    const result = api.engine.actions.speak(text);
    if (!result.ok) {
      store.message = input.value;
      error.textContent = result.error;
      input.focus();
    }
  };
  return form;
}
function worldView(api, state, params) {
  const world = state.worlds.find(w => w.id === params.id);
  const back = plainButton('← 世界广场', () => api.go('home'), 'av-back');
  if (!world) return [back, empty('这个世界尚未建立。', button('回到世界广场', () => api.go('home')))];
  const current = state.currentWorldId === world.id;
  const active = state.activeVisit;
  const onVisit = current && active && active.worldId === world.id;
  const home = world.id === 'origin';
  const locals = state.agents.filter(a => a.worldId === world.id);
  const hero = el('header', 'av-hero');
  const img = el('img', '');
  img.alt = '';
  img.src = 'assets/' + (home ? 'hero' : art[world.theme] || art[world.id] || 'tide') + '.webp';
  img.onerror = () => { img.hidden = true; };
  hero.append(img, el('h1', '', world.name), el('p', '', world.description || world.tagline),
    el('div', 'av-meta', el('span', '', home ? '常驻世界' : (world.creator || '居民') + ' 创建'),
        el('span', '', locals.length + ' 位居民')));
  const heroActions = row();
  if (current && !home && onVisit) {
    if (active.canReturn) {
      heroActions.append(button('携带遗留物返航', () => {
        dispatch(api, 'returnHome', [], '旅程已记入手记', () => api.go('journal', { tab: 'trips' }));
      }));
    } else {
      heroActions.append(chip('异界身份 · ' + active.role));
    }
  } else if (!current && active) {
    heroActions.append(button('继续' + worldName(state, active.worldId) + '的旅程', () => api.go('world', { id: active.worldId })));
  } else if (!current) {
    heroActions.append(button('以新身份进入世界', () => dispatch(api, 'enterWorld', [world.id], '已进入' + world.name)));
  } else if (home) {
    heroActions.append(button('探索其他世界', () => api.go('home')));
  }
  if (heroActions.childElementCount) hero.append(heroActions);
  const main = el('div', 'av-stack');
  const side = el('aside', 'av-stack');
  const sceneEvents = state.events.filter(e => e.worldId === world.id && e.kind !== 'opening');
  const eventTitle = world.eventTitle || '当前场景';
  if (current) {
    const scene = panel(eventTitle, world.eventPrompt && body(world.eventPrompt));
    const transcript = el('div', 'av-transcript');
    transcript.setAttribute('role', 'region');
    transcript.setAttribute('aria-label', '当前场景记录');
    transcript.tabIndex = 0;
    transcript.style.marginTop = '16px';
    const visitEvents = onVisit ? sceneEvents.filter(e => e.visitId === active.id ||
      (e.kind === 'ambient' && e.createdAt >= active.createdAt && e.witnessIds?.includes(active.actorId))) : sceneEvents;
    transcript.append(visitEvents.length ? timeline(visitEvents.slice(-40), state) : empty('场景已开放，你可以向这里的居民打声招呼。'));
    scene.append(transcript, sceneComposer(api, state, world));
    main.append(scene);
    requestAnimationFrame(() => { transcript.scrollTop = transcript.scrollHeight; });
  } else {
    main.append(panel(eventTitle, body(world.eventPrompt || '居民正在这里交流。进入世界后，你可以亲自参与。')));
    if (sceneEvents.length) main.append(panel('场景记录', timeline(sceneEvents.slice(-3).reverse(), state)));
  }
  const actor = who(state, state.control.actorId);
  side.append(panel(home ? '参与身份' : '旅行约定', properties([
    ['当前参与者', state.control.mode === 'self' ? '本人' : actor + ' · 由你接管'],
    ...(!home ? [['抵达身份', onVisit ? active.role : world.role || '来访者'], ['返航条件', world.returnCondition || '参与一次场景互动'],
      ...(onVisit ? [['目前进展', '已留下 ' + active.progress + ' / ' + active.required + ' 次回应']] : [])] : [])
  ])));
  if (locals.length) {
    const localRows = el('div', 'av-list');
    locals.forEach(agent => localRows.append(el('div', 'av-entry', avatar(agent.name), el('div', '',
      el('strong', '', agent.name), el('p', 'av-fine', agent.goal || agent.description)))));
    side.append(panel('在场居民', localRows));
  }
  return [back, hero, el('div', 'av-layout', main, side)];
}
function exploreForm(api, state, agent) {
  const store = remember('explore/' + agent.id);
  const form = el('form', 'av-explore');
  const destinations = state.worlds.filter(w => w.id !== 'origin');
  const field = labelInput(store, { name:'worldId', label:'目的世界',
    options:destinations.map(w=>[w.id,w.name]) });
  const send = el('button','av-btn av-btn-strong','开始自主探访');
  send.type = 'submit';
  const error = el('p','av-error');
  error.setAttribute('role','alert');
  form.append(field, error, send);
  form.onsubmit = event => {
    event.preventDefault();
    const worldId = form.elements.namedItem('worldId').value;
    const result = api.engine.actions.explore(agent.id, worldId);
    if (!result.ok) { error.textContent = result.error; return; }
    api.notify(agent.name + '的探访已记入手记');
    api.go('journal',{tab:'trips'});
  };
  const disclosure = el('details','av-explore-disclosure',el('summary','','自主探访'),form);
  disclosure.open = store.open === true;
  disclosure.ontoggle = () => { store.open = disclosure.open; };
  return disclosure;
}
function residentsView(api, state, params) {
  const selfFilter = params.tab === 'mine';
  const match = state.agents.filter(a => !selfFilter || a.owned);
  const top = heading('居民名册', '认识世界里的居民，也可以创建一个拥有自己目标的 Agent。',
    button('创建 Agent', () => api.go('create', { kind: 'agent' }), 'av-btn-strong'));
  const choose = tabs([['all','全部居民'],['mine','我创建的']], selfFilter ? 'mine' : 'all', key => api.go('residents', { tab:key }));
  const cards = el('div', 'av-residents');
  match.forEach(a => {
    const underControl = state.control.mode === 'agent' && state.control.actorId === a.id;
    const ongoing = state.visits?.[a.id];
    const attitude = a.attitudes?.[state.control.actorId];
    const items = el('div', 'av-actions av-row');
    if (a.owned) {
      if (underControl) {
        items.append(button('交还自主行动', () => dispatch(api, 'release', [], '已交还角色控制')));
      } else {
        items.append(button(ongoing ? '接管并继续旅程' : '接管角色', () =>
          dispatch(api, 'takeover', [a.id], '你正在操控' + a.name,
            ongoing ? () => api.go('world',{id:ongoing.worldId}) : undefined)));
      }
    }
    items.append(button('查看所在世界', () => api.go('world', { id:a.worldId }), 'av-btn-quiet'));
    const card = el('article', 'av-panel av-res-card',
      row(avatar(a.name), el('div', '', el('h2', '', a.name), fine(worldName(state, a.worldId)))),
      el('div', 'av-chips', chip(underControl ? '由你接管' : '自主行动'), a.owned && chip('由你创建')),
      a.personality && el('p', '', a.personality), properties([['正在做的事', a.goal],
        ['对'+who(state,state.control.actorId)+'的态度', attitude?.text]]),
      attitude && el('details','av-fine',el('summary','','查看态度来源'),el('p','',attitude.reason)), items,
      a.owned && !underControl && !ongoing && exploreForm(api, state, a));
    cards.append(card);
  });
  const timePanel = panel('居民行动', body('原型中的居民按本地规则行动。你可以让当前世界的居民推进一次活动，再到场景记录查看。'),
    el('div', 'av-row', button('推进行动', () => dispatch(api, 'tick', [], '已推进一次居民行动')),
      button('查看场景', () => api.go('world', { id:state.currentWorldId }), 'av-btn-quiet')));
  timePanel.style.marginTop = '18px';
  timePanel.lastElementChild.style.marginTop = '12px';
  return [top, choose, match.length ? cards : empty('你还没有创建 Agent。'), timePanel];
}
function journalView(api, state, params) {
  const tab = ['trips','relics','memories','events'].includes(params.tab) ? params.tab : 'trips';
  const top = heading('旅行手记', '查看旅程、带回的物品，以及居民记住的共同经历。');
  const choose = tabs([['trips','旅程'],['relics','遗留物'],['memories','居民记忆'],['events','事件记录']], tab, key => api.go('journal', { tab:key }));
  const discover = button('去世界广场', () => api.go('home'));
  const sourceEvent = id => state.events.find(e => e.id === id);
  const source = id => {
    const evt = sourceEvent(id);
    if (!evt) return null;
    return el('details', 'av-fine', el('summary', '', '查看来源事件'),
      el('p', '', (evt.actorName || who(state, evt.actorId)) + ' · ' + (evt.text || '') ));
  };
  if (tab === 'events') {
    const owned = new Set(['self', ...state.agents.filter(a=>a.owned).map(a=>a.id)]);
    const events = state.events.filter(e => owned.has(e.actorId) || e.witnessIds?.some(id=>owned.has(id))).slice().reverse();
    const count = panels.get('event-limit') || 40;
    return [top,choose, panel('见证的事件', events.length ? timeline(events.slice(0,count),state) : empty('你参与或见证的事件将出现在这里。',discover),
      events.length>count && button('加载更早的记录', () => {
        panels.set('event-limit',count+40);
        api.go('journal',{tab:'events'});
      }))];
  }
  const collection = el('div', 'av-collection');
  if (tab === 'trips') {
    if (state.activeVisit) {
      const visit = state.activeVisit;
      collection.append(el('article','av-panel av-collect-card', chip('旅程进行中'),
        el('h3','',worldName(state,visit.worldId)), body(who(state,visit.actorId)+' 以「'+visit.role+'」的身份参与。'),
        button('继续这段旅程',()=>api.go('world',{id:visit.worldId}),'av-btn-strong')));
    }
    for (const j of [...state.journeys].reverse()) {
      if (!j.returnedAt && state.activeVisit?.id === j.id) continue;
      const relic = state.relics.find(r=>r.id===j.relicId);
      collection.append(el('article','av-panel av-collect-card',
        row(fine(date(j.returnedAt || j.createdAt,true)),j.controlledBy==='agent' && chip('自主探访')), el('h3','',j.worldName || worldName(state,j.worldId)),
        body(who(state,j.actorId)+' 以「'+j.role+'」的身份到访'+(j.returnedAt?'，已回到源世界。':'。')),
        relic && el('p','', '带回了「'+relic.name+'」'),
        plainButton('再次查看这个世界',()=>api.go('world',{id:j.worldId}),'av-world-link')));
    }
  }
  if (tab === 'relics') {
    for (const r of [...state.relics].reverse()) {
      collection.append(el('article','av-panel av-collect-card',el('span','av-tiny-art', '◇'),el('h3','',r.name),
        body(r.description),fine((r.worldName||worldName(state,r.worldId))+' · '+who(state,r.actorId)+' 带回 · '+date(r.createdAt)),
        source(r.sourceEventId)));
    }
  }
  if (tab === 'memories') {
    for (const a of state.agents) {
      for (const memory of [...(a.memories || [])].reverse()) {
        const text = typeof memory === 'string' ? memory : memory.text || memory.summary || memory.description;
        if (!text) continue;
        collection.append(el('article','av-panel av-collect-card',row(avatar(a.name),el('h3','',a.name+'的记忆')),
          body(text),typeof memory==='object' && fine(date(memory.createdAt,true)),typeof memory==='object' && source(memory.sourceEventId || memory.eventId)));
      }
    }
  }
  const empties = {
    trips:'完成一段旅行后，异界身份和归来的时刻会记在这里。',
    relics:'在其他世界参与活动并返航，可以带回一件有来历的物品。',
    memories:'参与一次场景互动后，居民的记忆会出现在这里。'
  };
  return [top, choose, collection.childElementCount ? collection : panel('',empty(empties[tab],discover))];
}
function createView(api, state, params) {
  const kind = params.kind === 'agent' ? 'agent' : 'world';
  const isAgent = kind === 'agent';
  const store = remember('create/'+kind);
  const top = heading(isAgent?'创建 Agent':'创建世界',isAgent?'设定一个居民的性格、目标和常驻地。':'给新世界取个名字，安排来访者的身份和第一场活动。');
  const switcher = tabs([['world','世界'],['agent','Agent']],kind,key=>api.go('create',{kind:key}));
  const form = el('form','av-panel av-form');
  const meta = isAgent ? [
    { name:'name',label:'角色名字',required:true,max:32,placeholder:'给这位居民起个名字' },
    { name:'personality',label:'性格',required:true,long:true,max:240,placeholder:'它习惯怎样回应别人？' },
    { name:'goal',label:'现在的目标',required:true,max:180,placeholder:'它想和谁一起完成什么？' },
    { name:'worldId',label:'常驻世界',options:state.worlds.map(w=>[w.id,w.name]),defaultValue:'origin' }
  ] : [
    { name:'name',label:'世界名称',required:true,max:32,placeholder:'为你的世界命名' },
    { name:'description',label:'世界设定',required:true,long:true,max:320,placeholder:'这里是什么地方，居民在做什么？' },
    { name:'theme',label:'世界封面',options:[['tide','潮汐与海岸'],['radio','午夜电台'],['forest','雾中森林']] },
    { name:'role',label:'来访者身份',required:true,max:32,defaultValue:'来访者' },
    { name:'eventTitle',label:'场景活动',required:true,max:50,placeholder:'例：交换一件旅途见闻' },
    { name:'eventPrompt',label:'活动邀请',required:true,long:true,max:240,placeholder:'写下进入世界时，居民会发出的邀请。' },
    { name:'required',label:'返航前参与活动',options:[['1','留下 1 次回应'],['2','留下 2 次回应'],['3','留下 3 次回应']] }
  ];
  meta.forEach(spec=>form.append(labelInput(store,spec)));
  const err = el('p','av-error');
  err.setAttribute('role','alert');
  const submit=el('button','av-btn av-btn-strong',isAgent?'创建 Agent':'创建世界');
  submit.type='submit';
  form.append(err, row(submit,button('取消',()=>api.go(isAgent?'residents':'home'),'av-btn-quiet')));
  form.onsubmit=e=>{
    e.preventDefault();
    const data=Object.fromEntries(new FormData(form));
    for (const spec of meta) {
      if (typeof data[spec.name]==='string') data[spec.name]=data[spec.name].trim();
      if (spec.required && !data[spec.name]) {
        err.textContent='请填写'+spec.label+'。';
        form.elements.namedItem(spec.name)?.focus();
        return;
      }
    }
    if(!isAgent) {
      data.required=Number(data.required);
    }
    const result=api.engine.actions[isAgent?'createAgent':'createWorld'](data);
    if (!result.ok) { err.textContent=result.error; return; }
    drafts.delete('create/'+kind);
    api.notify(isAgent?'Agent 已创建':'世界已创建');
    if (isAgent) api.go('residents',{tab:'mine'});
    else api.go('world',{id:result.id});
  };
  return [top,switcher,form];
}

export function renderView(host, view, params = {}, api) {
  const state = api.engine.snapshot();
  const key = [view,params.id,params.tab,params.kind].join('/');
  const sameRoute = visibleRoute === key;
  const active = document.activeElement;
  // Keep text selection during engine-driven redraws (e.g. a resident acts).
  if (sameRoute && host.contains(active) && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
    focusedField = { name:active.name,start:active.selectionStart,end:active.selectionEnd };
  } else if (!sameRoute || (active && active!==document.body && !host.contains(active))) focusedField=null;
  visibleRoute=key;
  const root=el('div','atlas-view');
  const content = view==='world' ? worldView(api,state,params)
    : view==='residents' ? residentsView(api,state,params)
    : view==='journal' ? journalView(api,state,params) : createView(api,state,params);
  content.forEach(c=>{if(c)root.append(c)});
  host.replaceChildren(root);
  root.addEventListener('focusin',e=>{
    const target=e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      focusedField={name:target.name,start:target.selectionStart,end:target.selectionEnd};
    } else focusedField=null;
  });
  root.addEventListener('input',e=>{
    const t=e.target;
    if(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) focusedField={name:t.name,start:t.selectionStart,end:t.selectionEnd};
  });
  if(sameRoute && focusedField?.name) {
    const input=root.querySelector('[name="'+CSS.escape(focusedField.name)+'"]');
    if(input) {
      const position={...focusedField};
      input.focus({preventScroll:true});
      if(typeof input.setSelectionRange==='function') input.setSelectionRange(position.start,position.end);
    }
  }
}
