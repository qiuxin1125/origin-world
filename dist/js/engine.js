// The same character keeps its position, experiences and possessions when its controller changes.
const STORAGE_KEY = 'origin-world.community.v1';
const VERSION = 1;
const originId = 'origin';

const presets = [
  {
    id: 'origin', theme: 'origin', name: '群岛会客厅', creator: '源界',
    description: '一道道航线交在这里。归来的人把旅途里的东西放上长桌，等下一位来客问起。',
    tagline: '所有航线的起点', role: '群岛来客', eventTitle: '归港长桌',
    eventPrompt: '桌上留着一处空位。今天，你想和这里的居民聊些什么？',
    returnCondition: '', required: 0, relicName: '', station: '长桌'
  },
  {
    id: 'tide', theme: 'tide', name: '潮汐档案馆', creator: '岛屿编辑部',
    description: '涨潮时，档案架的最底层会浸进海水。守档人正在寻找一页缺失的潮汐记录。',
    tagline: '把一段经历存进潮水', role: '潮线抄录员', eventTitle: '失落的第七码头',
    eventPrompt: '第七码头的记录少了一页。替它留下一条观察、一段回忆，或一个还没有答案的问题。',
    returnCondition: '在第七码头的缺页上留下一条记录。', required: 1,
    relicName: '潮线拓片', station: '潮汐档案'
  },
  {
    id: 'radio', theme: 'radio', name: '午夜电台', creator: '无眠频率',
    description: '零点之后，收音机才能调到这个频率。播音室为每一个迟到的声音留着一段空白。',
    tagline: '把声音留给夜航的人', role: '午夜替班主播', eventTitle: '留给未眠者的频率',
    eventPrompt: '播音灯亮了。给此刻还醒着的人说一句话，节目就能继续。',
    returnCondition: '在本期午夜节目中留下一段话。', required: 1,
    relicName: '午夜录音带', station: '播音台'
  },
  {
    id: 'forest', theme: 'forest', name: '雾林邮局', creator: '林间来信',
    description: '邮路会在浓雾里移动。邮局把投不出去的信摊开，请每一位过客补上一点线索。',
    tagline: '为迷路的信找到去处', role: '林间代投员', eventTitle: '两张没有地址的明信片',
    eventPrompt: '两张空白明信片正在等人落笔。你可以为它们分别写下一句线索或祝愿。',
    returnCondition: '给两张明信片各留一句不同的话。', required: 2,
    relicName: '雾林返程邮戳', station: '分拣台'
  }
];

const locals = [
  ['tide-keeper', '闻汐', 'tide', '谨慎、耐心，习惯先核对见过的细节。', '补齐第七码头遗失的记录。'],
  ['radio-host', '弦音', 'radio', '敏锐而直率，会把停顿也听进录音。', '让失眠的人收到一段回应。'],
  ['forest-post', '雾禾', 'forest', '好奇而细心，相信每一封信都值得抵达。', '给无主的明信片找到去向。'],
  ['origin-scout', '拾一', 'origin', '喜欢追问，会把旅途线索画在随身笔记里。', '替归来的人记下一件值得再去看看的事。']
];

function createResident(id, name, worldId, personality, goal, owned, description = '') {
  return {
    id, name, worldId, homeWorldId: worldId,
    personality, goal, description: description || goal, owned,
    memories: [], attitudes: {}, lastAutonomousAt: 0, autonomousTurns: 0
  };
}

function initialState(now) {
  const worlds = presets.map(w => ({ ...w, preset: true, createdAt: now }));
  const agents = locals.map(([id, name, worldId, personality, goal]) =>
    createResident(id, name, worldId, personality, goal, worldId === originId));
  return {
    version: VERSION, revision: 0, lastSavedAt: now, worlds, agents,
    self: { id: 'self', name: '你', worldId: originId, memories: [], attitudes: {} },
    control: { actorId: 'self', mode: 'self', epoch: 1 },
    visits: {}, journeys: [], relics: [], events: worlds.map(w => ({
      id: 'opening-' + w.id, worldId: w.id, visitId: null, actorId: 'world',
      actorName: w.name, kind: 'opening', text: w.eventPrompt, createdAt: now,
      witnessIds: agents.filter(a => a.worldId === w.id).map(a => a.id),
      preset: true
    }))
  };
}

const copy = value => JSON.parse(JSON.stringify(value));
const tidy = value => typeof value === 'string' ? value.trim() : '';
const canonical = text => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{Z}]+/gu, '');
const excerpt = (text, limit = 50) => Array.from(text).length > limit
  ? Array.from(text).slice(0, limit - 1).join('') + '…' : text;
const actorIn = (s, id) => id === 'self' ? s.self : s.agents.find(a => a.id === id);
const worldIn = (s, id) => s.worlds.find(w => w.id === id);
const nearby = (s, worldId) => [s.self, ...s.agents].filter(a => a.worldId === worldId);
const requiredText = (value, label, limit) => {
  const text = tidy(value);
  if (!text || Array.from(text).length > limit) throw new Error(label + '须填写 1 至 ' + limit + ' 个字。');
  return text;
};

function stamp(s, ids, now, worldId, actor, kind, text, extra = {}) {
  const e = {
    id: ids('event'), worldId, visitId: null, actorId: actor.id, actorName: actor.name,
    kind, text, createdAt: now, witnessIds: nearby(s, worldId).map(a => a.id), ...extra
  };
  s.events.push(e);
  return e;
}

function remember(s, event) {
  for (const id of event.witnessIds) {
    const observer = actorIn(s, id);
    if (!observer) continue;
    observer.memories.push({
      id: event.id, eventId: event.id, worldId: event.worldId, visitId: event.visitId,
      actorId: event.actorId, actorName: event.actorName, kind: event.kind,
      text: event.text, createdAt: event.createdAt,
      sourceEventId: event.sourceEventId || null
    });
  }
}

function interpret(text) {
  if (/[？?]|怎么|如何|为什么|请问|何处|在哪|谁/.test(text)) return 'question';
  if (/不想|不愿|不答应|别播|不公开|保密|别说|拒绝/.test(text)) return 'boundary';
  if (/抱歉|对不起|道歉|后悔/.test(text)) return 'regret';
  if (/答应|约定|下次|我会|保证|我来帮|我可以/.test(text)) return 'promise';
  if (/害怕|孤独|难过|想念|想家|担心|心疼|想你/.test(text)) return 'feeling';
  if (/看见|看到|听到|听见|记得|发现|以前|当时/.test(text)) return 'observation';
  return 'contribution';
}

const behaviors = {
  tide: {
    question: '我把有缺口的这一页翻给你。现在能确认的只有页码，缺掉的内容仍可以补证。',
    boundary: '我把这页翻过去。你已经说清楚的边界，也值得在记录旁留个记号。',
    regret: '我在旧记录旁添了一栏。你可以更正它，也可以让两个版本一起留下。',
    promise: '我给这页夹上待核的纸签。等你回来时，我们再一起核对。',
    feeling: '我抽出一张没有格线的纸。这一页留给你的感受。',
    observation: '我把你亲见的那一段放进见闻夹，和仍待核实的空白分开。',
    contribution: '我给这页编了号，在旁边留出空行。以后再来，你可以接着写。'
  },
  radio: {
    question: '我把麦克风留在开放频道。这个问题会保留在节目里，等有人愿意回答。',
    boundary: '我把转播推子拉下来了。下次打开话筒前，我会先问你的意思。',
    regret: '我留了一段安静，然后把话筒推回去。你有重新说一遍的机会。',
    promise: '我给下一期节目空出一个位置。等你回来，我们再接这段话。',
    feeling: '我把背景乐推低了一点。夜里听见这样一句话的人，也许会多坐一会儿。',
    observation: '我把你听见的细节放进本期录音的开头。这样下一位听众知道从哪里听起。',
    contribution: '我按下录音键，这一期有了它自己的片头。'
  },
  forest: {
    question: '我把待投地图摊开。你可以指一处地方，我们从那条小路找起。',
    boundary: '我把信封重新封好，暂时留在柜内。什么时候寄出由你决定。',
    regret: '我给你换了一张新卡，原来的也一起收好。这两份都能找到。',
    promise: '我在回邮栏留了一个空位。你下次经过时，这封信还能接着走。',
    feeling: '我给这张卡多套了一层信封。这样的心意，慢一点送也值得。',
    observation: '我沿着你说的线索，在分拣图上别了一枚图钉。',
    contribution: '我把这句话抄进待投簿，放在下一位来客也能找到的抽屉里。'
  },
  origin: {
    question: '我翻开归港簿。要找这件事的线索，可以从亲自去过那个世界的人问起。',
    boundary: '好，我收起笔。你愿意继续的时候我还在。',
    regret: '我把刚才那页留着，也给你留一张新的。人的想法可以改变。',
    promise: '我把这句话当作一个约定。以后再相遇，我会问你后来发生了什么。',
    feeling: '我把椅子往你这边挪了一点。先坐一会儿也好。',
    observation: '我把这个细节记在你的名字旁，下次就知道该从哪里问起。',
    contribution: '我给这段话留了一页。要是还有后续，我想听你接着说。'
  }
};

const attitudes = {
  question: '愿意和你一起追问', boundary: '会先征求你的同意', regret: '愿意听你的新解释',
  promise: '记挂着你们的约定', feeling: '愿意安静地听你说', observation: '愿意和你核对见闻',
  contribution: '愿意接续上次的话题', return: '对你带回的见闻有了好奇'
};

function setAttitude(resident, subject, source, label) {
  resident.attitudes[subject.id] = {
    text: label, reason: excerpt(source.text, 64), eventId: source.id, updatedAt: source.createdAt
  };
}

function response(s, ids, now, speaker, source, world, visit) {
  const present = s.agents.filter(a => a.worldId === world.id && a.id !== speaker.id &&
    !(s.control.mode === 'agent' && s.control.actorId === a.id));
  if (!present.length) return null;
  // Prioritize the station's local keeper, then take turns between equally local agents.
  const mentioned = present.filter(a => source.text.includes(a.name));
  const natives = present.filter(a => a.homeWorldId === world.id);
  const pool = mentioned.length ? mentioned : natives.length ? natives : present;
  const previousReplies = visit?.replyCount ?? s.events.filter(e =>
    e.worldId === world.id && e.kind === 'reply' && e.targetId === speaker.id).length;
  const index = previousReplies % pool.length;
  const resident = pool[index];
  if (visit) visit.replyCount++;
  const intent = interpret(source.text);
  let text;
  if (resident.owned && resident.id !== 'origin-scout' && intent !== 'boundary') {
    const approach = /谨慎|安静|内向|慎重/.test(resident.personality)
      ? '我先记下来，等多一些线索再判断。'
      : /好奇|提问|活泼|追问/.test(resident.personality)
        ? '我想追问一句：是什么让你特别留意这件事？'
        : '我也想从自己的经历说说这件事。';
    text = approach + '我来这里，是想「' + excerpt(resident.goal, 65) + '」。';
  } else if (world.preset) {
    text = (behaviors[world.id] || behaviors.origin)[intent];
  } else if (intent === 'boundary') {
    text = '好，我先把笔放下。你愿意时，我们再接着聊。';
  } else if (intent === 'question') {
    text = '我们现在面对的是「' + world.eventTitle + '」。我想先从你提出的这个问题查起。';
  } else if (resident.owned && /谨慎|内向|安静/.test(resident.personality)) {
    text = '我先把原话写好。关于「' + world.eventTitle + '」，我想留些时间想清楚。';
  } else {
    text = '我把你的话添进「' + world.eventTitle + '」的现场记录。' +
      (/好奇|追问/.test(resident.personality) ? '我很想知道，你为什么选了这一句？' : '下一位来时，我们就有了可以接下去的线索。');
  }
  setAttitude(resident, speaker, source, attitudes[intent]);
  const reply = stamp(s, ids, now, world.id, resident, 'reply', text, {
    visitId: visit?.id || null, sourceEventId: source.id, targetId: speaker.id
  });
  remember(s, reply);
  return reply;
}

function newVisit(s, ids, now, actor, world) {
  const previousWorld = actor.worldId;
  const fromRole = actor.id === 'self' ? '本人' : actor.name;
  const visit = {
    id: ids('visit'), worldId: world.id, worldName: world.name, actorId: actor.id,
    previousWorld, fromRole,
    actorName: actor.name, role: world.role, progress: 0, required: world.required,
    canReturn: false, createdAt: now, evidenceIds: [], contributionKeys: [], replyCount: 0
  };
  actor.worldId = world.id;
  s.visits[actor.id] = visit;
  const arrival = stamp(s, ids, now, world.id, actor, 'arrival',
    '身份坍缩后，以「' + world.role + '」的身份抵达' + world.name + '。',
    { visitId: visit.id, previousWorld, fromRole, toRole: world.role });
  remember(s, arrival);
  const resident = s.agents.find(a => a.worldId === world.id && a.id !== actor.id && a.homeWorldId === world.id);
  if (resident && resident.id !== s.control.actorId) {
    const old = [...resident.memories].reverse().find(m =>
      m.worldId === world.id && m.kind === 'speech' && m.actorId === actor.id && m.visitId !== visit.id);
    if (old) {
      const last = interpret(old.text);
      const continuation = {
        promise: '我还给你留着上次的位置。那个约定后来怎么样了？',
        boundary: '我记得你当时的意思。今天你想公开说，还是先听一会儿？',
        question: '上次你把问题留在这里。这一次要沿着它继续找吗？',
        regret: '那张修改过的记录还在。要一起回头看一眼吗？',
        feeling: '你上次留的那一页我还收着。今天感觉怎么样？',
        observation: '我把那条线索拿出来了。今天有没有新的发现？',
        contribution: '我把上次那页翻开了。今天可以从这里接下去。'
      }[last];
      const recall = stamp(s, ids, now, world.id, resident, 'reply',
        '你上次说过「' + excerpt(old.text, 38) + '」。' + continuation,
        { visitId: visit.id, sourceEventId: old.eventId, targetId: actor.id });
      remember(s, recall);
    }
  }
  return visit;
}

export function createEngine(options = {}) {
  let storage = options.storage;
  if (storage === undefined) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  const key = options.storageKey || STORAGE_KEY;
  const clock = options.now || Date.now;
  const ids = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() ||
    Math.random().toString(36).slice(2) + '-' + clock().toString(36));
  function read(raw) {
    try {
      const data = JSON.parse(raw);
      if (data?.version === VERSION && data.worlds?.some(w => w.id === originId) &&
        Array.isArray(data.agents) && Array.isArray(data.events) && Array.isArray(data.journeys) &&
        Array.isArray(data.relics) && data.visits && data.self?.id === 'self' &&
        actorIn(data, data.control?.actorId)) return data;
    } catch { /* An unavailable or obsolete browser save starts a fresh session. */ }
    return null;
  }
  let state;
  try { state = read(storage?.getItem(key)); } catch { /* Storage can be unavailable in private mode. */ }
  const fresh = !state;
  state ||= initialState(clock());
  let persistent = Boolean(storage);
  const listeners = new Set();
  function snapshot() {
    return copy({
      ...state, currentWorldId: actorIn(state, state.control.actorId).worldId,
      activeVisit: state.visits[state.control.actorId] || null,
      persistence: persistent ? 'local' : 'memory'
    });
  }
  function emit() {
    for (const listener of listeners) {
      try { listener(snapshot()); } catch (error) { console.error('Origin World view update:', error); }
    }
  }
  function save() {
    if (!storage) return;
    try { storage.setItem(key, JSON.stringify(state)); persistent = true; }
    catch { persistent = false; }
  }
  if (fresh) save();
  // Re-read the latest local commit before acting when a second tab shares the save.
  const mutate = action => (...args) => {
    try {
      if (storage) {
        try {
          const remote = read(storage.getItem(key));
          if (remote && remote.revision > state.revision) state = remote;
        } catch { /* Continue with in-memory state. */ }
      }
      const draft = copy(state);
      const now = clock();
      const result = action(draft, now, ...args);
      draft.revision++;
      draft.lastSavedAt = now;
      state = draft;
      save();
      emit();
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '操作未能完成。' };
    }
  };
  const current = s => actorIn(s, s.control.actorId);
  function speakFor(s, now, actor, raw) {
    const text = requiredText(raw, '留言', 1200);
    const world = worldIn(s, actor.worldId);
    const visit = s.visits[actor.id];
    const e = stamp(s, ids, now, world.id, actor, 'speech', text, {
      visitId: visit?.id || null, controlledBy: s.control.actorId === actor.id ? 'human' : 'agent'
    });
    remember(s, e);
    const entry = canonical(text);
    let advanced = false;
    if (visit && entry && !visit.contributionKeys.includes(entry)) {
      visit.evidenceIds.push(e.id);
      visit.contributionKeys.push(entry);
      const previous = visit.progress;
      visit.progress = Math.min(visit.required, visit.evidenceIds.length);
      visit.canReturn = visit.progress >= visit.required;
      advanced = visit.progress > previous;
    }
    const reply = response(s, ids, now, actor, e, world, visit);
    return { id: e.id, eventId: e.id, replyId: reply?.id || null, advanced, canReturn: !!visit?.canReturn };
  }
  function enterFor(s, now, actor, id) {
      const world = worldIn(s, id);
      if (!world) throw new Error('这个世界尚未建立。');
      if (world.id === originId) throw new Error('通过返航回到群岛会客厅。');
      if (s.visits[actor.id]) throw new Error('请先完成当前旅程并返航。');
      const visit = newVisit(s, ids, now, actor, world);
      return { id: visit.id, visitId: visit.id, worldId: world.id };
  }
  function returnFor(s, now, actor) {
      const visit = s.visits[actor.id];
      if (!visit) throw new Error('当前没有需要返航的旅程。');
      if (!visit.canReturn) throw new Error('还需留下 ' + (visit.required - visit.progress) + ' 条不同的留言才能返航。');
      const world = worldIn(s, visit.worldId);
      const evidence = s.events.find(e => e.id === visit.evidenceIds[0]);
      if (!evidence) throw new Error('这段旅程缺少来源记录。');
      const relic = {
        id: ids('relic'), name: world.relicName, worldId: world.id, worldName: world.name,
        actorId: actor.id, actorName: actor.name, role: visit.role, visitId: visit.id, createdAt: now,
        sourceEventId: evidence.id, description: '来自' + world.name + '的' + world.relicName +
          '，保存着' + actor.name + '当时留下的话：「' + excerpt(evidence.text, 80) + '」。'
      };
      s.relics.push(relic);
      const depart = stamp(s, ids, now, world.id, actor, 'departure', '收好「' + relic.name + '」，离开了' + world.name + '。',
        { visitId: visit.id, relicId: relic.id, sourceEventId: evidence.id });
      remember(s, depart);
      actor.worldId = originId;
      delete s.visits[actor.id];
      const arrival = stamp(s, ids, now, originId, actor, 'return',
        '从' + world.name + '带回「' + relic.name + '」，上面留下了「' + excerpt(evidence.text, 45) + '」。',
        { visitId: visit.id, relicId: relic.id, sourceEventId: evidence.id, sourceWorldId: world.id });
      remember(s, arrival);
      const resident = s.agents.find(a => a.worldId === originId && a.id !== actor.id && a.id !== s.control.actorId);
      if (resident) {
        setAttitude(resident, actor, arrival, attitudes.return);
        const follow = stamp(s, ids, now, originId, resident, 'reply',
          '原来「' + relic.name + '」是从' + world.name + '带来的。我给它留了一个位置，下次想听听你为什么写下那句话。',
          { visitId: visit.id, targetId: actor.id, sourceEventId: arrival.id });
        remember(s, follow);
      }
      const journey = {
        id: visit.id, worldId: world.id, worldName: world.name, role: visit.role,
        actorId: actor.id, actorName: actor.name, createdAt: visit.createdAt, returnedAt: now,
        relicId: relic.id, sourceEventId: evidence.id, returnEventId: arrival.id,
        evidenceIds: [...visit.evidenceIds], controlledBy: s.control.actorId === actor.id ? 'human' : 'agent'
      };
      s.journeys.push(journey);
      return { id: journey.id, relicId: relic.id, journeyId: journey.id };
  }
  const actions = {
    enterWorld: mutate((s, now, id) => enterFor(s, now, current(s), id)),
    speak: mutate((s, now, raw) => speakFor(s, now, current(s), raw)),
    returnHome: mutate((s, now) => returnFor(s, now, current(s))),
    explore: mutate((s, now, agentId, worldId) => {
      const agent = s.agents.find(a => a.id === agentId && a.owned);
      if (!agent) throw new Error('只能邀请自己创建的 Agent 出访。');
      if (s.control.actorId === agentId) throw new Error('请先交还控制，让这位居民独立行动。');
      if (s.visits[agentId]) throw new Error('这位居民正在途中，请先接管并完成当前旅程。');
      const world = worldIn(s, worldId);
      if (!world || world.id === originId) throw new Error('请选择群岛会客厅以外的世界。');
      enterFor(s, now, agent, worldId);
      let heard = '';
      for (let turn = 0; turn < world.required; turn++) {
        const goal = excerpt(agent.goal, 65);
        const first = {
          tide: '我想在缺页上留一个问题：要怎样从这一页接着寻找「' + goal + '」的线索？',
          radio: '这里是' + agent.name + '。在今夜的开放频道，我想说说这个愿望：「' + goal + '」。',
          forest: '第一张卡想寄给路上和我一样的人。我的愿望是「' + goal + '」。'
        };
        const observation = heard ? '刚才听见的「' + heard + '」' : '这里的「' + world.eventTitle + '」';
        const notes = [
          first[world.id] || '我正在参与「' + world.eventTitle + '」。我的目标是「' + goal + '」。我想从这里开始找。',
          '我把' + observation + '记下来。这一份，想留给以后会经过这里的人。',
          '关于' + observation + '，我还有个问题：回来时还能在哪一页找到它？',
          '我愿意把' + observation + '和初来时的想法放在一起，回去再读一遍。',
          '返航前再留一条约定：下次遇见，我们就从' + observation + '接着说。'
        ];
        const result = speakFor(s, now, agent, notes[turn]);
        // Only use a reply actually witnessed by this character on this visit.
        const reply = agent.memories.find(m => m.eventId === result.replyId && m.visitId === s.visits[agentId].id);
        heard = reply ? excerpt(reply.text, 26) : '';
      }
      const outcome = returnFor(s, now, agent);
      return { ...outcome, agentId, worldId };
    }),
    takeover: mutate((s, now, id) => {
      const agent = s.agents.find(a => a.id === id && a.owned);
      if (!agent) throw new Error('只能接管属于你的居民 Agent。');
      if (s.control.actorId === id) throw new Error('你已在扮演这位居民。');
      s.control = { actorId: id, mode: 'agent', epoch: s.control.epoch + 1 };
      if (agent.worldId !== originId && !s.visits[id]) newVisit(s, ids, now, agent, worldIn(s, agent.worldId));
      stamp(s, ids, now, agent.worldId, agent, 'control', '你开始以' + agent.name + '的身份行动。', { visitId: s.visits[id]?.id || null });
      return { id };
    }),
    release: mutate((s, now) => {
      if (s.control.mode !== 'agent') throw new Error('你正在以本人身份行动。');
      const agent = current(s);
      stamp(s, ids, now, agent.worldId, agent, 'control', '已交还控制，' + agent.name + '将从此刻的经历继续行动。', { visitId: s.visits[agent.id]?.id || null });
      s.control = { actorId: 'self', mode: 'self', epoch: s.control.epoch + 1 };
      return { id: agent.id };
    }),
    createAgent: mutate((s, now, form = {}) => {
      const name = requiredText(form.name, '居民名字', 32);
      const worldId = form.worldId || originId;
      if (!worldIn(s, worldId)) throw new Error('请选择已建立的世界。');
      const personality = requiredText(form.personality || '好奇，愿意倾听。', '性格', 300);
      const goal = requiredText(form.goal || '观察身边的人，记住相遇的经过。', '目标', 300);
      const agent = createResident(ids('agent'), name, worldId, personality, goal, true, excerpt(tidy(form.description), 400));
      s.agents.push(agent);
      const e = stamp(s, ids, now, worldId, agent, 'arrival', name + '在这里开始了自己的生活。');
      remember(s, e);
      return { id: agent.id };
    }),
    createWorld: mutate((s, now, form = {}) => {
      const name = requiredText(form.name, '世界名', 48);
      const description = requiredText(form.description, '世界简介', 500);
      const count = form.required === undefined || form.required === '' ? 1 : Number(form.required);
      if (!Number.isInteger(count) || count < 1 || count > 5) throw new Error('返航需要的不同留言数须为 1 至 5。');
      const theme = ['tide', 'radio', 'forest'].includes(form.theme) ? form.theme : 'tide';
      const rule = '参与现场事件，留下 ' + count + ' 条不同的留言。';
      const world = {
        id: ids('world'), theme, name, description, tagline: excerpt(description, 32), creator: '你',
        role: excerpt(tidy(form.role) || '巡游记录员', 40),
        eventTitle: excerpt(tidy(form.eventTitle) || '第一份现场记录', 70),
        eventPrompt: excerpt(tidy(form.eventPrompt) || '世界刚刚打开。留下你的第一条观察，值守人会在这里回应。', 500),
        returnCondition: tidy(form.returnCondition)
          ? excerpt(tidy(form.returnCondition), 120) + (tidy(form.returnCondition).includes(String(count)) ? '' : '（' + rule + '）') : rule,
        required: count, relicName: excerpt(tidy(form.relicName) || name + '的见闻笺', 80),
        station: '现场记录簿', preset: false, createdAt: now
      };
      s.worlds.push(world);
      const keeper = createResident(ids('keeper'), '值守人', world.id, '好奇，愿意记录不同的意见。', '照看「' + world.eventTitle + '」的现场记录。', false);
      s.agents.push(keeper);
      const e = stamp(s, ids, now, world.id, { id: 'world', name }, 'opening', world.eventPrompt);
      remember(s, e);
      return { id: world.id, agentId: keeper.id };
    }),
    tick: mutate((s, now) => {
      const world = worldIn(s, current(s).worldId);
      const candidates = s.agents.filter(a => a.worldId === world.id && a.id !== s.control.actorId);
      if (!candidates.length) throw new Error('此处暂时没有能自主行动的居民。');
      candidates.sort((a, b) => a.autonomousTurns - b.autonomousTurns || a.lastAutonomousAt - b.lastAutonomousAt);
      const agent = candidates[0];
      const turn = agent.autonomousTurns++;
      agent.lastAutonomousAt = now;
      const memory = [...agent.memories].reverse().find(m =>
        m.actorId !== agent.id && (m.kind === 'speech' || m.kind === 'return') && m.worldId === world.id &&
        !s.events.some(e => e.kind === 'ambient' && e.actorId === agent.id && e.sourceEventId === m.eventId));
      let text;
      if (memory) {
        text = memory.kind === 'return'
          ? '把' + memory.actorName + '带回的见闻编进归港簿，还留了一栏给下一段旅程。'
          : '重新读到' + memory.actorName + '留下的「' + excerpt(memory.text, 32) + '」，在' + world.station + '旁留了一张待续的便笺。';
      } else {
        const phrases = {
          tide: ['把受潮的档案翻到窗边晾着。', '沿架子查看缺页的编号，记下尚待核实的地方。', '收起一叠已经风干的记录。'],
          radio: ['试了一遍麦克风，给今晚的频道留出一段空白。', '在节目表上圈出下一段开放时段。', '把窗外的声音录作下一期节目的片头。'],
          forest: ['重新清点信筐，为两张空白明信片留了位置。', '查看林道上的木牌，把方向记在投递图上。', '在等候回信的抽屉上系了一段细绳。'],
          origin: ['把归港簿翻到新的一页，等下一位归来的人。', '整理长桌上散乱的地图，把缺少记录的岛圈了出来。', '在留言板旁留下一支削好的铅笔。']
        };
        const pool = world.preset ? phrases[world.id] : ['检查了「' + world.eventTitle + '」的记录。', '把现场看过的线索整理到' + world.station + '旁。'];
        text = pool[turn % pool.length];
        if (agent.owned && turn % 3 === 2) text = '在个人笔记里重新写下目标：「' + agent.goal + '」。';
      }
      const e = stamp(s, ids, now, world.id, agent, 'ambient', text, {
        sourceEventId: memory?.eventId || null, visitId: s.visits[agent.id]?.id || null, controlledBy: 'agent'
      });
      remember(s, e);
      return { id: e.id, actorId: agent.id };
    })
  };
  const sync = e => {
    if (e.key !== key || !e.newValue) return;
    const next = read(e.newValue);
    if (next && next.revision >= state.revision) { state = next; emit(); }
  };
  if (options.browserEvents) globalThis.addEventListener?.('storage', sync);
  // Only simulate while the page is visible. The UI also exposes an explicit step.
  const timer = options.autoTick && typeof document !== 'undefined' ? setInterval(() => {
    const here = current(state).worldId;
    const recent = state.events.filter(e => e.worldId === here).slice(-3);
    const resting = recent.length === 3 && recent.every(e => e.kind === 'ambient');
    if (!resting && !document.hidden && (typeof document.hasFocus !== 'function' || document.hasFocus())) actions.tick();
  }, 60000) : null;
  return {
    snapshot, actions,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() {
      if (timer !== null) clearInterval(timer);
      if (options.browserEvents) globalThis.removeEventListener?.('storage', sync);
      listeners.clear();
    }
  };
}

export const engine = createEngine({ browserEvents: true, autoTick: true });
