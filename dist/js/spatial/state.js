import { ensureSocialState, isSocialAction, performSocialAction } from './social.js';

const STORAGE_KEY = 'origin-world.spatial.v1';
const VERSION = 1;
const WORLDS = {
  origin: {
    name: '群岛会客厅',
    role: '群岛来客',
    spawn: { x: 0, y: 1.65, z: 12, yaw: 0, pitch: -0.04 },
  },
  tide: {
    name: '潮汐档案馆',
    role: '潮线抄录员',
    spawn: { x: 0, y: 1.65, z: 9, yaw: 0, pitch: -0.04 },
  },
  forest: {
    name: '雾林邮局',
    role: '林间代投员',
    spawn: { x: 0, y: 1.65, z: 9, yaw: 0, pitch: -0.04 },
  },
};
const ITEMS = {
  photo: { name: '码头旧照', worldId: 'origin', position: [-2.55, 0.4] },
  camera: { name: '相机', worldId: 'origin', position: [-1.05, 0.32] },
  rubbing: { name: '潮线拓片', worldId: 'tide', position: [-1.35, -1.38] },
  postcard: { name: '林间明信片', worldId: 'forest', position: [0.6, -0.5] },
};
const OWNER_FIELDS = {
  photo: 'photoOwner',
  camera: 'cameraOwner',
  rubbing: 'rubbingOwner',
  postcard: 'postcardOwner',
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const id = (prefix) =>
  prefix + '-' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const short = (text, length = 70) => Array.from(text).slice(0, length).join('');
const field = (value, label, max) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || Array.from(text).length > max)
    throw new Error(label + '请填写 1 至 ' + max + ' 个字。');
  return text;
};

function freshState(time) {
  const actors = [
    {
      id: 'wenxi',
      name: '闻汐',
      worldId: 'origin',
      color: '#819780',
      position: [1, -1],
      goal: '给旧码头的照片找到对应的岸线。',
      owned: false,
    },
    {
      id: 'shiyi',
      name: '拾一',
      worldId: 'origin',
      color: '#c78556',
      position: [-4, 3],
      goal: '记下群岛里值得再次相遇的人和事。',
      owned: true,
    },
    {
      id: 'post',
      name: '守档人',
      worldId: 'tide',
      color: '#829aaa',
      position: [-2, -3],
      goal: '照看潮线拓片，核对来访者亲眼见过的东西。',
      owned: false,
    },
    {
      id: 'forest-post',
      name: '雾禾',
      worldId: 'forest',
      color: '#b5a477',
      position: [-2, -3],
      goal: '让林间明信片找到愿意把故事带回去的人。',
      owned: false,
    },
  ].map((actor) => ({
    ...actor,
    held: null,
    memories: [],
    attitude: {},
    mode: 'idle',
    lastAction: '',
  }));
  const positions = { self: { ...WORLDS.origin.spawn } };
  for (const actor of actors)
    positions[actor.id] = { x: actor.position[0], y: 1.65, z: actor.position[1], yaw: 0, pitch: 0 };
  return {
    version: VERSION,
    revision: 0,
    updatedAt: time,
    actorId: 'self',
    self: { id: 'self', name: '你', worldId: 'origin', held: null, memories: [], role: '本人' },
    actors,
    positions,
    visits: {},
    journeys: [],
    events: [],
    inventory: [],
    photos: [],
    invitations: {},
    doorOpen: false,
    photoOwner: 'table',
    photoMounted: false,
    exhibitionPhotoId: null,
    cameraOwner: 'table',
    rubbingOwner: null,
    rubbingTaken: false,
    postcardOwner: null,
    postcardTaken: false,
    radioOn: false,
  };
}

function actorIn(state, actorId) {
  return actorId === 'self' ? state.self : state.actors.find((actor) => actor.id === actorId);
}

function pose(state, actorId) {
  const p = state.positions[actorId];
  return p ? [p.x, p.z] : [0, 0];
}

function ownerOf(state, item) {
  return state[OWNER_FIELDS[item]];
}

function setOwner(state, item, owner) {
  state[OWNER_FIELDS[item]] = owner;
}

function witnessedEvent(state, time, type, actor, text, extra = {}) {
  const observers = [state.self, ...state.actors].filter((other) =>
    Array.isArray(extra.witnessIds)
      ? extra.witnessIds.includes(other.id)
      : other.worldId === actor.worldId &&
        (other.id === actor.id || distance(pose(state, other.id), pose(state, actor.id)) <= 7),
  );
  const event = {
    id: id('event'),
    type,
    actorId: actor.id,
    actorName: actor.name,
    worldId: actor.worldId,
    text,
    time,
    witnessIds: observers.map((other) => other.id),
    controlledBy: actor.id === state.actorId ? 'human' : 'agent',
    ...extra,
  };
  state.events.push(event);
  for (const observer of observers) {
    observer.memories.push({
      eventId: event.id,
      type,
      worldId: event.worldId,
      actorId: actor.id,
      text,
      time,
    });
    if (observer.memories.length > 100) observer.memories.shift();
  }
  return event;
}

function setPosition(state, actor, value) {
  const p = Array.isArray(value) ? { x: value[0], z: value[1] } : value;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) throw new Error('位置无效。');
  const previous = state.positions[actor.id] || WORLDS[actor.worldId].spawn;
  state.positions[actor.id] = {
    x: Math.max(-100, Math.min(100, p.x)),
    y: Number.isFinite(p.y) ? p.y : previous.y,
    z: Math.max(-100, Math.min(100, p.z)),
    yaw: Number.isFinite(p.yaw) ? p.yaw : previous.yaw,
    pitch: Number.isFinite(p.pitch) ? p.pitch : previous.pitch,
  };
  if (actor.id !== 'self')
    actor.position = [state.positions[actor.id].x, state.positions[actor.id].z];
}

function stow(state, actor) {
  if (
    actor.held &&
    !state.inventory.some((item) => item.kind === actor.held && item.ownerId === actor.id)
  ) {
    state.inventory.push({
      id: id('item'),
      kind: actor.held,
      name: ITEMS[actor.held].name,
      ownerId: actor.id,
    });
  }
  actor.held = null;
}

function equip(state, actor, item) {
  actor.held = item;
  state.inventory = state.inventory.filter(
    (entry) => !(entry.ownerId === actor.id && entry.kind === item),
  );
}

function near(state, actor, point, range = 4) {
  if (distance(pose(state, actor.id), point) > range) throw new Error('再靠近一点就能操作。');
}

function mountPhoto(state, time, actor) {
  if (actor.worldId !== 'origin') throw new Error('相框在群岛会客厅。');
  if (state.photoMounted) throw new Error('照片已经挂好了。');
  if (state.photoOwner !== actor.id) throw new Error('先拿到照片，再放入相框。');
  near(state, actor, [-3.65, -5.79], 4.5);
  const source = [...state.events]
    .reverse()
    .find(
      (event) => event.item === 'photo' && (event.to === actor.id || event.actorId === actor.id),
    );
  state.photoMounted = true;
  state.photoOwner = 'frame';
  actor.held = null;
  state.inventory = state.inventory.filter((item) => item.kind !== 'photo');
  const event = witnessedEvent(state, time, 'mount', actor, actor.name + '把码头旧照挂进了相框。', {
    item: 'photo',
    sourceId: source?.id || null,
  });
  const wenxi = actorIn(state, 'wenxi');
  const remembered = wenxi.memories.find((memory) => memory.eventId === event.id);
  if (remembered || actor.id === 'wenxi') {
    const partner = source?.type === 'give' ? source.actorId : actor.id;
    wenxi.attitude[partner] = { text: '想再一起辨认照片里的岸线', sourceId: event.id };
    state.invitations[partner] = {
      from: 'wenxi',
      worldId: 'tide',
      sourceId: event.id,
      text: '照片挂好了。潮汐档案馆里有这段海岸的拓片，你愿意去看看吗？',
    };
  }
  return { eventId: event.id };
}

export function createSpatialStore(options = {}) {
  let storage = options.storage;
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }
  const now = options.now || Date.now;
  const key = options.storageKey || STORAGE_KEY;
  let state;
  function read(raw) {
    try {
      const value = JSON.parse(raw);
      if (
        value?.version === VERSION &&
        value.self?.id === 'self' &&
        Array.isArray(value.actors) &&
        Array.isArray(value.events) &&
        value.positions &&
        value.visits &&
        value.invitations &&
        actorIn(value, value.actorId)
      ) {
        value.postcardOwner ??= null;
        value.postcardTaken ??= false;
        value.exhibitionPhotoId ??= null;
        if (!value.actors.some((actor) => actor.id === 'forest-post')) {
          const template = freshState(value.updatedAt || now());
          value.actors.push(template.actors.find((actor) => actor.id === 'forest-post'));
          value.positions['forest-post'] = template.positions['forest-post'];
        }
        return ensureSocialState(value);
      }
    } catch {
      /* A missing or invalid save starts a fresh visit. */
    }
    return null;
  }
  try {
    state = read(storage?.getItem(key));
  } catch {
    /* Storage can be unavailable. */
  }
  state ||= freshState(now());
  ensureSocialState(state);
  const listeners = new Set();
  let persisted = Boolean(storage),
    lastPositionSave = 0,
    disposed = false;
  function snapshot() {
    const actor = actorIn(state, state.actorId);
    return clone({
      ...state,
      feed: state.feed.map((post) => ({
        ...post,
        photoDataUrl: post.photoId
          ? state.photos.find((photo) => photo.id === post.photoId)?.dataUrl || null
          : null,
      })),
      worldId: actor.worldId,
      held: actor.held,
      invitation: state.invitations[actor.id] || null,
      activeJourney: state.visits[actor.id] || null,
      persistence: persisted ? 'local' : 'memory',
    });
  }
  function save() {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(state));
      persisted = true;
    } catch {
      persisted = false;
    }
  }
  function emit(type) {
    for (const listener of listeners) listener(snapshot(), { type });
  }
  function perform(type, payload, draft, time) {
    const actor = actorIn(draft, draft.actorId);
    if (isSocialAction(type))
      return performSocialAction(type, payload, draft, time, {
        actorIn,
        pose,
        distance,
        id,
        witnessedEvent,
      });
    switch (type) {
      case 'position':
      case 'move': {
        const moved = actorIn(draft, payload.actorId || actor.id);
        if (!moved) throw new Error('没有找到这个角色。');
        setPosition(draft, moved, payload.position || payload);
        return {};
      }
      case 'door': {
        if (actor.worldId !== 'origin') throw new Error('会客厅的门不在这里。');
        near(draft, actor, [0, 7], 5.5);
        draft.doorOpen = payload.open === undefined ? !draft.doorOpen : Boolean(payload.open);
        const event = witnessedEvent(
          draft,
          time,
          'door',
          actor,
          actor.name + (draft.doorOpen ? '推开了会客厅的门。' : '合上了会客厅的门。'),
        );
        return { eventId: event.id };
      }
      case 'pickup': {
        const item = payload.item;
        if (!ITEMS[item]) throw new Error('这件物品无法拿取。');
        if (actor.held) throw new Error('手上已经有物品，可以先放回或收进随身物品。');
        const owner = ownerOf(draft, item);
        if (owner === actor.id) {
          equip(draft, actor, item);
          return {};
        }
        const artifact = item === 'rubbing' || item === 'postcard';
        const available = artifact ? owner === null && !draft[item + 'Taken'] : owner === 'table';
        if (!available) throw new Error('这件物品已经被拿走或放置了。');
        if (actor.worldId !== ITEMS[item].worldId) throw new Error('物品不在当前世界。');
        near(draft, actor, ITEMS[item].position);
        setOwner(draft, item, actor.id);
        if (artifact) draft[item + 'Taken'] = true;
        equip(draft, actor, item);
        const event = witnessedEvent(
          draft,
          time,
          'pickup',
          actor,
          actor.name + '拿起了' + ITEMS[item].name + '。',
          { item },
        );
        return { eventId: event.id };
      }
      case 'stow': {
        stow(draft, actor);
        return {};
      }
      case 'drop': {
        const item = actor.held;
        if (!item) throw new Error('你手上没有物品。');
        if (item === 'rubbing' || item === 'postcard' || actor.worldId !== ITEMS[item].worldId) {
          stow(draft, actor);
          return { stowed: true };
        }
        setOwner(draft, item, 'table');
        actor.held = null;
        const event = witnessedEvent(
          draft,
          time,
          'drop',
          actor,
          actor.name + '把' + ITEMS[item].name + '放回了桌上。',
          { item },
        );
        return { eventId: event.id };
      }
      case 'mount': {
        const mounter = actorIn(draft, payload.actorId || actor.id);
        if (!mounter) throw new Error('没有找到这个角色。');
        if (mounter.id !== actor.id && draft.actorId === mounter.id)
          throw new Error('这个角色正由真人接管。');
        return mountPhoto(draft, time, mounter);
      }
      case 'give': {
        const recipient = actorIn(draft, payload.to || 'wenxi');
        if (!recipient || recipient.id === actor.id || recipient.worldId !== actor.worldId)
          throw new Error('这里没有可以接过物品的居民。');
        if (recipient.id === draft.actorId) throw new Error('这个角色正在由你操控。');
        if (actor.held !== 'photo' || draft.photoOwner !== actor.id)
          throw new Error('先拿起照片，再递给闻汐。');
        if (recipient.held) throw new Error(recipient.name + '的手上正拿着别的东西。');
        near(draft, actor, pose(draft, recipient.id), 3.8);
        actor.held = null;
        recipient.held = 'photo';
        draft.photoOwner = recipient.id;
        recipient.mode = 'carrying';
        const event = witnessedEvent(
          draft,
          time,
          'give',
          actor,
          actor.name + '把码头旧照递给了' + recipient.name + '。',
          { item: 'photo', to: recipient.id },
        );
        recipient.attitude[actor.id] = { text: '愿意与你一起核对照片', sourceId: event.id };
        return { eventId: event.id, to: recipient.id };
      }
      case 'radio': {
        if (actor.worldId !== 'origin') throw new Error('收音机在群岛会客厅。');
        draft.radioOn = !draft.radioOn;
        const event = witnessedEvent(
          draft,
          time,
          'radio',
          actor,
          actor.name + (draft.radioOn ? '打开了收音机。' : '关上了收音机。'),
        );
        return { eventId: event.id };
      }
      case 'takeover': {
        const target = actorIn(draft, payload.id);
        if (!target || !target.owned) throw new Error('你只能接管自己创建的角色。');
        if (draft.actorId === target.id) throw new Error('你已经在操控这位角色。');
        draft.actorId = target.id;
        target.mode = 'controlled';
        const event = witnessedEvent(
          draft,
          time,
          'control',
          target,
          '你开始以' + target.name + '的身份行动。',
        );
        return { eventId: event.id };
      }
      case 'release': {
        if (draft.actorId === 'self') throw new Error('你当前正以本人身份参与。');
        actor.mode = 'idle';
        const event = witnessedEvent(
          draft,
          time,
          'control',
          actor,
          '你交还了控制，' + actor.name + '继续自己的行动。',
        );
        draft.actorId = 'self';
        return { eventId: event.id };
      }
      case 'enter': {
        const worldId = payload.worldId;
        if (!WORLDS[worldId] || worldId === 'origin') throw new Error('请选择一个创作者世界。');
        if (draft.visits[actor.id]) throw new Error('先完成这段旅程并返航。');
        stow(draft, actor);
        const visit = {
          id: id('journey'),
          actorId: actor.id,
          actorName: actor.name,
          worldId,
          worldName: WORLDS[worldId].name,
          role: WORLDS[worldId].role,
          fromRole: actor.role || actor.name,
          previousWorld: actor.worldId,
          departurePosition: clone(draft.positions[actor.id]),
          startedAt: time,
        };
        actor.worldId = worldId;
        actor.role = visit.role;
        draft.positions[actor.id] = { ...WORLDS[worldId].spawn };
        if (actor.id !== 'self') actor.position = [0, 9];
        draft.visits[actor.id] = visit;
        const event = witnessedEvent(
          draft,
          time,
          'arrival',
          actor,
          actor.name + '以「' + visit.role + '」的身份来到' + visit.worldName + '。',
          { visitId: visit.id },
        );
        const resident = draft.actors.find(
          (other) => other.worldId === worldId && other.id !== actor.id,
        );
        const previous = resident?.memories.find(
          (memory) =>
            memory.type === 'pickup' && memory.actorId === actor.id && memory.worldId === worldId,
        );
        if (previous && distance(pose(draft, resident.id), pose(draft, actor.id)) <= 7) {
          witnessedEvent(
            draft,
            time,
            'recognition',
            resident,
            '我记得你上次来核对过潮线。那张拓片后来带回去了吗？',
            { sourceId: previous.eventId, to: actor.id },
          );
        }
        return { eventId: event.id, journeyId: visit.id };
      }
      case 'return': {
        const visit = draft.visits[actor.id];
        if (!visit) throw new Error('你当前在源世界。');
        stow(draft, actor);
        const keepsake = ['rubbing', 'postcard'].find(
          (item) => ITEMS[item].worldId === visit.worldId && ownerOf(draft, item) === actor.id,
        );
        const source = [...draft.events]
          .reverse()
          .find(
            (event) =>
              event.actorId === actor.id &&
              event.worldId === visit.worldId &&
              event.type === 'pickup' &&
              event.item === keepsake,
          );
        const departure = witnessedEvent(
          draft,
          time,
          'departure',
          actor,
          actor.name + '离开了' + visit.worldName + '。',
          { sourceId: source?.id || null },
        );
        actor.worldId = 'origin';
        actor.role = actor.id === 'self' ? '本人' : actor.name;
        draft.positions[actor.id] = { x: 3, y: 1.65, z: 5, yaw: 0, pitch: 0 };
        if (actor.id !== 'self') actor.position = [3, 5];
        const event = witnessedEvent(
          draft,
          time,
          'return',
          actor,
          actor.name +
            '从' +
            visit.worldName +
            '归来' +
            (source ? '，带回了' + ITEMS[keepsake].name + '。' : '，这次没有携带遗留物。'),
          { sourceId: source?.id || departure.id, item: keepsake || null },
        );
        draft.journeys.push({
          ...visit,
          returnedAt: time,
          item: keepsake || null,
          sourceId: source?.id || null,
          returnEventId: event.id,
        });
        delete draft.visits[actor.id];
        delete draft.invitations[actor.id];
        const wenxi = actorIn(draft, 'wenxi');
        if (
          wenxi.worldId === 'origin' &&
          distance(pose(draft, wenxi.id), pose(draft, actor.id)) <= 7
        ) {
          wenxi.attitude[actor.id] = {
            text: source
              ? '对你带回的' + ITEMS[keepsake].name + '有了好奇'
              : '想听你讲讲刚才的经历',
            sourceId: event.id,
          };
          const greeting =
            keepsake === 'rubbing'
              ? '你把潮线拓片带回来了。我们可以把它和那张旧照放在一起看。'
              : keepsake === 'postcard'
                ? '这是从雾林带回的明信片吗？我想听听那边的故事。'
                : '你回来了。那边有什么让你记住的事？';
          witnessedEvent(draft, time, 'recognition', wenxi, greeting, {
            to: actor.id,
            sourceId: event.id,
          });
        }
        return { eventId: event.id, journeyId: visit.id };
      }
      case 'recordPhoto': {
        if (
          payload.device !== 'personal' &&
          (draft.cameraOwner !== actor.id || actor.held !== 'camera')
        )
          throw new Error('先拿起相机，再记录眼前的画面。');
        const dataUrl = payload.dataUrl;
        if (
          typeof dataUrl !== 'string' ||
          !/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl) ||
          dataUrl.length > 500000
        )
          throw new Error('照片过大或格式无效，请使用 500KB 以内的图片。');
        const title =
          short(typeof payload.title === 'string' ? payload.title.trim() : '群岛见闻', 40) ||
          '群岛见闻';
        const event = witnessedEvent(
          draft,
          time,
          'photograph',
          actor,
          actor.name + '拍下了「' + title + '」。',
        );
        const photo = {
          id: id('photo'),
          ownerId: actor.id,
          actorName: actor.name,
          worldId: actor.worldId,
          title,
          dataUrl,
          time,
          sourceId: event.id,
          witnessIds: [...event.witnessIds],
          device: payload.device === 'personal' ? 'personal' : 'camera',
        };
        draft.photos.push(photo);
        if (draft.photos.length > 8) {
          const oldest = draft.photos.findIndex(
            (entry) =>
              entry.id !== photo.id &&
              entry.id !== draft.exhibitionPhotoId &&
              !draft.feed.some((post) => post.photoId === entry.id),
          );
          if (oldest >= 0) draft.photos.splice(oldest, 1);
        }
        return { eventId: event.id, photoId: photo.id };
      }
      case 'exhibitPhoto': {
        if (actor.worldId !== 'origin') throw new Error('相框在群岛会客厅。');
        near(draft, actor, [-3.65, -5.79], 4.5);
        const photo = draft.photos.find((entry) => entry.id === payload.photoId);
        if (!photo || photo.ownerId !== actor.id)
          throw new Error('只能展出由自己拍摄并持有的照片。');
        if (draft.exhibitionPhotoId === photo.id) throw new Error('这张照片已经在展出了。');
        draft.exhibitionPhotoId = photo.id;
        const event = witnessedEvent(
          draft,
          time,
          'exhibit',
          actor,
          actor.name + '在会客厅的画框里展出了「' + photo.title + '」。',
          { photoId: photo.id, sourceId: photo.sourceId },
        );
        return { eventId: event.id, photoId: photo.id };
      }
      case 'speak': {
        const text = field(payload.text, '内容', 240);
        const source = witnessedEvent(draft, time, 'speech', actor, text);
        const residents = draft.actors.filter(
          (other) =>
            other.worldId === actor.worldId &&
            other.id !== actor.id &&
            distance(pose(draft, other.id), pose(draft, actor.id)) < 5,
        );
        residents.sort(
          (a, b) =>
            distance(pose(draft, a.id), pose(draft, actor.id)) -
            distance(pose(draft, b.id), pose(draft, actor.id)),
        );
        const resident = residents[0];
        if (!resident) return { eventId: source.id };
        const past = [...resident.memories]
          .reverse()
          .find(
            (memory) =>
              memory.actorId === actor.id &&
              memory.eventId !== source.id &&
              ['give', 'mount', 'return', 'photograph', 'pickup'].includes(memory.type),
          );
        let reply = '我正在' + resident.goal.replace(/[。！]$/, '') + '。你想一起看看吗？';
        if (/不|拒绝|稍后|等一/.test(text)) reply = '好，我继续手上的事。你愿意的时候再来找我。';
        else if (past) reply = '我还记得「' + short(past.text, 45) + '」。你想从那里接着做吗？';
        const event = witnessedEvent(draft, time, 'reply', resident, reply, {
          to: actor.id,
          sourceId: past?.eventId || source.id,
        });
        return { eventId: source.id, replyId: event.id, reply };
      }
      case 'agentStep': {
        const agent = actorIn(draft, payload.actorId);
        if (!agent || agent.id === 'self') throw new Error('没有找到自主角色。');
        if (agent.id === draft.actorId) throw new Error('该角色正由真人接管，自主行动已暂停。');
        if (payload.position) setPosition(draft, agent, payload.position);
        if (payload.action === 'move') {
          agent.mode = 'walking';
          return {};
        }
        if (payload.action === 'openDoor') {
          if (agent.worldId !== 'origin') throw new Error('会客厅的门不在这个世界。');
          near(draft, agent, [0, 7], 3);
          if (draft.doorOpen) return { changed: false, alreadyOpen: true };
          draft.doorOpen = true;
          agent.mode = 'walking';
          const event = witnessedEvent(
            draft,
            time,
            'door',
            agent,
            agent.name + '推开了会客厅的门。',
            {
              sourceId: agent.socialIntent?.sourceId || null,
              postId: agent.socialIntent?.postId || null,
            },
          );
          return { eventId: event.id };
        }
        if (payload.action === 'mount') return mountPhoto(draft, time, agent);
        if (payload.action === 'invite') {
          if (
            agent.worldId !== actor.worldId ||
            distance(pose(draft, agent.id), pose(draft, actor.id)) > 6
          )
            throw new Error('玩家尚未靠近。');
          const event = witnessedEvent(
            draft,
            time,
            'invitation',
            agent,
            '我想核对照片里的岸线。你愿意和我一起去潮汐档案馆看看吗？',
            { to: actor.id },
          );
          draft.invitations[actor.id] = {
            from: agent.id,
            worldId: 'tide',
            sourceId: event.id,
            text: event.text,
          };
          agent.mode = 'waiting';
          return { eventId: event.id };
        }
        agent.mode = payload.action === 'observe' ? 'observing' : 'idle';
        const text =
          typeof payload.text === 'string' && payload.text.trim()
            ? short(payload.text.trim(), 240)
            : agent.name + '停下来观察周围。';
        agent.lastAction = text;
        const event = witnessedEvent(draft, time, 'agent', agent, text);
        return { eventId: event.id };
      }
      case 'createAgent': {
        const name = field(payload.name, '名字', 24),
          goal = field(payload.goal, '目标', 160);
        const agentId = id('agent');
        const color = /^#[\da-f]{6}$/i.test(payload.color || '') ? payload.color : '#b5a477';
        const agent = {
          id: agentId,
          name,
          goal,
          color,
          worldId: 'origin',
          position: [-4, 4],
          owned: true,
          held: null,
          memories: [],
          attitude: {},
          mode: 'idle',
          lastAction: '',
        };
        draft.actors.push(agent);
        draft.positions[agent.id] = { x: -4, y: 1.65, z: 4, yaw: 0, pitch: 0 };
        const event = witnessedEvent(
          draft,
          time,
          'arrival',
          agent,
          name + '来到群岛，想' + goal.replace(/[。！]$/, '') + '。',
        );
        return { id: agentId, eventId: event.id };
      }
      default:
        throw new Error('暂不支持这项操作。');
    }
  }
  function act(type, payload = {}) {
    if (disposed) return { ok: false, error: '世界已经关闭。' };
    try {
      const draft = clone(state),
        time = now();
      const result = perform(type, payload || {}, draft, time);
      if (type === 'socialPulse' && !result.changed && !result.processed)
        return { ok: true, ...result };
      if (result.changed === false) return { ok: true, ...result };
      ensureSocialState(draft);
      draft.revision++;
      draft.updatedAt = time;
      state = draft;
      const moving =
        type === 'move' ||
        type === 'position' ||
        (type === 'agentStep' && payload.action === 'move');
      if (!moving || time - lastPositionSave > 1800) {
        save();
        lastPositionSave = time;
      }
      if (!moving) emit(type);
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '操作未完成。' };
    }
  }
  const sync = (event) => {
    if (event.key !== key || !event.newValue) return;
    const incoming = read(event.newValue);
    if (incoming && incoming.revision > state.revision) {
      state = incoming;
      emit('sync');
    }
  };
  globalThis.addEventListener?.('storage', sync);
  if (!readStorageExists()) save();
  function readStorageExists() {
    try {
      return Boolean(storage?.getItem(key));
    } catch {
      return false;
    }
  }
  return {
    snapshot,
    act,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      save();
      disposed = true;
      listeners.clear();
      globalThis.removeEventListener?.('storage', sync);
    },
  };
}
