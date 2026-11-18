import * as THREE from '../../vendor/three/three.module.js';
import { createEnvironment } from './environment.js';
import { createActor, createHandObject } from './actors.js';
import { createSpatialStore } from './state.js';
import { planPath } from './navigation.js';
import { mountWorldline } from './worldline.js';
const $ = (s) => document.querySelector(s);
const canvas = $('#world-canvas'),
  panel = $('#world-panel');
const store = createSpatialStore();
let worldlineView = null,
  photoMode = false,
  selfieMode = false,
  socialPulseAt = 0;
const gesturePoses = new Map();
let state = store.snapshot(),
  started = false,
  environment,
  hand,
  heldKind = null,
  lastSaved = 0,
  worldBusy = false;
let pointerLocked = false,
  dragging = false,
  lastMouse = { x: 0, y: 0 },
  target = null,
  toastTimer,
  speechExpiry = new Map();
const keys = new Set(),
  actorViews = new Map(),
  agentRoutes = new Map();
const paperTexture = new THREE.TextureLoader().load('assets/tide.webp');
paperTexture.colorSpace = THREE.SRGBColorSpace;
const player = { x: 0, y: 1.65, z: 12, yaw: 0, pitch: -0.04 };
let displayedPhoto = null,
  exhibitTexture = null;
let moveStick = { x: 0, y: 0 },
  soundContext = null,
  soundSource = null,
  soundEnabled = false;
const worlds = {
  origin: { name: '群岛会客厅', region: '群岛 · 南岸', place: '风经过的地方', role: '本人' },
  tide: {
    name: '潮汐档案馆',
    region: '异世界 · 海岸档案',
    place: '潮水留下的空白',
    role: '潮线抄录员',
  },
  forest: {
    name: '雾林邮局',
    region: '异世界 · 林间通信',
    place: '等待下一封回信',
    role: '林间代投员',
  },
};
const itemNames = {
  photo: '码头旧照片',
  camera: '随身相机',
  rubbing: '潮线拓片',
  postcard: '林间明信片',
};
let renderer, scene, camera, raycaster;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.075, 240);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  raycaster = new THREE.Raycaster();
} catch (error) {
  $('#loading').innerHTML =
    '<p>这个浏览器暂时无法打开 3D 场景</p><small>请使用支持 WebGL 的 Chrome、Safari 或 Edge</small><a class="panel-button" href="atlas.html">打开世界图鉴</a>';
  throw error;
}
const worldGroup = new THREE.Group();
scene.add(worldGroup);
function notify(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3700);
}
function action(type, payload = {}, success) {
  if (started && type !== 'move' && type !== 'agentStep') savePosition();
  const r = store.act(type, payload);
  if (!r.ok) notify(r.error || '暂时无法完成这个动作');
  else if (success) notify(success);
  return r;
}
function savePosition() {
  if (started) store.act('move', { actorId: state.actorId, position: { ...player } });
}
function restorePosition(fallback = true) {
  const saved = state.positions?.[state.actorId] || state.self?.position;
  const here =
    state.actorId === 'self' ? state.self : state.actors.find((a) => a.id === state.actorId);
  const pose = saved && (!saved.worldId || saved.worldId === state.worldId) ? saved : null;
  if (pose && Number.isFinite(pose.x) && Number.isFinite(pose.z)) {
    Object.assign(player, pose);
    player.y = 1.65;
  } else if (here?.position && Array.isArray(here.position) && state.actorId !== 'self') {
    player.x = here.position[0];
    player.z = here.position[1];
    player.y = 1.65;
    player.yaw = 0;
    player.pitch = 0;
  } else if (fallback) Object.assign(player, environment.spawn);
}
function disposeGroup(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) m.dispose();
  });
}
function loadWorld(id) {
  if (environment) {
    worldGroup.remove(environment.group);
    if (environment.dispose) environment.dispose();
    else disposeGroup(environment.group);
  }
  environment = createEnvironment(id);
  worldGroup.add(environment.group);
  scene.background = new THREE.Color(environment.background || '#c4d5d0');
  scene.fog = new THREE.Fog(environment.fog || environment.background || '#c4d5d0', 48, 180);
  Object.assign(player, environment.spawn);
  if (!Number.isFinite(player.y)) player.y = 1.65;
  environment.applyState?.(state);
  displayedPhoto = null;
  syncExhibit();
  agentRoutes.clear();
  updateActors();
  updateHud();
}
function syncExhibit() {
  const photo = state.photos.find((p) => p.id === state.exhibitionPhotoId);
  if (!photo || displayedPhoto === photo.id || state.worldId !== 'origin') return;
  displayedPhoto = photo.id;
  if (exhibitTexture) exhibitTexture.dispose();
  exhibitTexture = new THREE.TextureLoader().load(photo.dataUrl, (texture) => {
    if (state.worldId === 'origin' && displayedPhoto === photo.id) {
      texture.colorSpace = THREE.SRGBColorSpace;
      environment.setPhotoTexture?.(texture);
    }
  });
}
function updateActors() {
  for (const a of state.actors) {
    let visual = actorViews.get(a.id);
    if (!visual) {
      visual = createActor({
        id: a.id,
        name: a.name,
        color: a.color || 'sage',
        position: a.position || [1, -1],
        owned: a.owned,
      });
      actorViews.set(a.id, visual);
      scene.add(visual.group);
      visual.group.userData.interactionId = 'actor:' + a.id;
    }
    const show = a.worldId === state.worldId && a.id !== state.actorId;
    visual.group.visible =
      show || (a.worldId === state.worldId && a.id === state.actorId && photoMode && selfieMode);
    if (!agentRoutes.has(a.id)) {
      const p = Array.isArray(a.position) ? a.position : [1, -1];
      visual.group.position.set(p[0], 0, p[1]);
      agentRoutes.set(a.id, {
        wait: 1 + Math.random() * 2,
        index: 0,
        target: null,
        lastAction: 0,
        walking: false,
      });
    }
    if (a.id === state.actorId) {
      visual.setLabel('由你参与');
      continue;
    }
    const label = a.held === 'photo' ? '正在找地方挂照片' : a.owned ? '自主行动' : '在这里生活';
    if (visual.lastStatus !== label) {
      visual.setLabel(label);
      visual.lastStatus = label;
    }
  }
}
function updateHud() {
  const unread = (state.chapters || []).filter((c) => !c.readAt || c.updatedAt > c.readAt).length;
  const label = $('#open-worldline span');
  if (label) label.textContent = unread ? '世界线 · ' + unread : '世界线';
  const world = worlds[state.worldId] || worlds.origin;
  $('#header-world').textContent = world.name;
  $('#world-type').textContent = state.worldId === 'origin' ? '源世界' : '创作者世界';
  $('#place-region').textContent = world.region;
  $('#place-title').textContent = world.place;
  const actor = state.actors.find((a) => a.id === state.actorId);
  $('#identity-caption').textContent =
    state.actorId === 'self'
      ? state.worldId === 'origin'
        ? '以本人身份参与'
        : '当前身份 · ' + world.role
      : '正在操控 ' + (actor?.name || '角色');
  const touch = matchMedia('(pointer:coarse)').matches;
  $('#held-name').textContent =
    state.held === 'camera'
      ? touch
        ? '相机 · 点击拍照'
        : '相机 · F 拍照'
      : state.held
        ? itemNames[state.held] + (touch ? ' · 点击查看' : ' · F 查看')
        : '空手';
  $('#held-icon').textContent = state.held === 'camera' ? '▣' : state.held ? '▧' : '✧';
  $('#drop-button').hidden = !state.held;
  document.title = world.name + ' · 源界';
  if (heldKind !== state.held) {
    if (hand) {
      camera.remove(hand);
      hand.userData?.dispose?.();
      if (!hand.userData?.dispose) disposeGroup(hand);
    }
    heldKind = state.held;
    hand = heldKind ? createHandObject(heldKind === 'postcard' ? 'rubbing' : heldKind) : null;
    if (hand) {
      hand.position.set(0.33, -0.31, -0.67);
      hand.rotation.set(-0.12, -0.12, 0.05);
      hand.scale.setScalar(0.72);
      camera.add(hand);
    }
  }
}
store.subscribe(() => {
  const previous = state;
  state = store.snapshot();
  if (environment && previous.worldId !== state.worldId) {
    loadWorld(state.worldId);
    restorePosition();
  } else {
    environment?.applyState?.(state);
    syncExhibit();
    updateActors();
  }
  if (previous.doorOpen !== state.doorOpen)
    for (const route of agentRoutes.values()) {
      route.target = null;
      route.path = [];
      route.wait = 0;
    }
  if (previous.actorId !== state.actorId) restorePosition(false);
  updateHud();
  showNewSpeech(previous);
});
function showNewSpeech(old) {
  const oldIds = new Set((old.events || []).map((e) => e.id));
  for (const e of state.events || []) {
    if (
      oldIds.has(e.id) ||
      e.worldId !== state.worldId ||
      !e.actorId ||
      e.actorId === state.actorId
    )
      continue;
    if (!actorViews.has(e.actorId)) continue;
    const visual = actorViews.get(e.actorId);
    if (visual.group.position.distanceTo(new THREE.Vector3(player.x, 0, player.z)) > 9) continue;
    if (
      [
        'say',
        'reply',
        'invitation',
        'recognition',
        'give',
        'mount',
        'agent',
        'social_comment',
        'social_arrival',
        'affection_reply',
        'affection',
      ].includes(e.type) ||
      e.actorId === 'wenxi'
    ) {
      speechExpiry.set(e.actorId, { text: e.text, expires: performance.now() + 8000 });
    }
  }
}
function pauseLook() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  keys.clear();
  dragging = false;
}
function disposeWorldline() {
  worldlineView?.dispose();
  worldlineView = null;
}
function openWorldline(options = {}) {
  pauseLook();
  disposeWorldline();
  if (!panel.open) panel.showModal();
  worldlineView = mountWorldline(panel, {
    store,
    initialTab: options.initialTab || 'stories',
    composePhotoId: options.composePhotoId,
    close: () => panel.close(),
    enterWorld: (mode = {}) => {
      panel.close();
      disposeWorldline();
      if (!started) start();
      if (mode.mode === 'photo') setPhotoMode(true);
      else askPointerLock();
    },
    notify,
  });
}
function setPhotoMode(enabled) {
  photoMode = Boolean(enabled);
  if (photoMode) pauseLook();
  if (!photoMode) selfieMode = false;
  $('#photo-controls').hidden = !photoMode;
  $('#reticle').hidden = photoMode;
  $('#context').hidden = true;
  $('#turn-camera').textContent = selfieMode ? '拍摄风景' : '转向自拍';
  $('#photo-mode').classList.toggle('photo-active', photoMode);
  updateActors();
  if (photoMode) notify('拖动画面调整取景，点快门或按 F 拍摄');
}
function inviteGesture(to, gesture) {
  const result = action('inviteAffection', { to, gesture });
  if (result.ok) {
    panel.close();
    notify(result.accepted ? '对方接受了邀请，等它走到你身边。' : '它想先继续手上的事。');
  }
}
function liveActorPosition(id) {
  if (id === state.actorId) return [player.x, player.z];
  const visual = actorViews.get(id);
  if (visual?.group.visible) return [visual.group.position.x, visual.group.position.z];
  const p = state.positions[id];
  return p ? [p.x, p.z] : null;
}

function openPanel(title, html, tab) {
  disposeWorldline();
  pauseLook();
  panel.innerHTML =
    '<div class="panel-head"><h2 id="panel-heading"></h2><button class="close-panel" aria-label="关闭">×</button></div><div class="panel-tabs"></div><div class="panel-body"></div>';
  panel.querySelector('h2').textContent = title;
  panel.querySelector('.panel-body').innerHTML = html;
  panel.querySelector('.close-panel').onclick = () => panel.close();
  if (tab) {
    panel.querySelector('.panel-tabs').innerHTML = [
      ['events', '经历'],
      ['items', '物品与照片'],
      ['people', '居民'],
      ['worlds', '世界'],
    ]
      .map(
        ([k, v]) =>
          '<button data-tab="' +
          k +
          '" class="' +
          (k === tab ? 'active' : '') +
          '">' +
          v +
          '</button>',
      )
      .join('');
    panel
      .querySelectorAll('[data-tab]')
      .forEach((b) => (b.onclick = () => openJournal(b.dataset.tab)));
  }
  if (!panel.open) panel.showModal();
}
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function inventoryCard(item) {
  const source = [...state.events]
    .reverse()
    .find((e) => e.type === 'pickup' && e.actorId === state.actorId && e.item === item.kind);
  const place = source ? worlds[source.worldId]?.name : '你的随身物品';
  return (
    '<article class="panel-item"><h3>' +
    esc(itemNames[item.kind] || item.name) +
    '</h3><p>' +
    esc(place || '群岛') +
    '</p>' +
    (source
      ? '<details class="panel-muted"><summary>查看来历</summary><p>' +
        esc(source.text) +
        '</p></details>'
      : '') +
    '<button class="panel-button secondary" data-equip="' +
    esc(item.kind) +
    '">拿在手上</button></article>'
  );
}
function eventRows(events) {
  return (
    events
      .slice()
      .reverse()
      .slice(0, 60)
      .map(
        (e) =>
          '<article class="panel-item"><small>' +
          esc(worlds[e.worldId]?.name || e.worldId) +
          ' · ' +
          esc(
            new Date(e.time || e.createdAt || Date.now()).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          ) +
          '</small><p>' +
          esc(e.text) +
          '</p></article>',
      )
      .join('') || '<p class="panel-muted">推开门，亲自参与一次相遇。经历会留在这里。</p>'
  );
}
function openJournal(tab = 'events') {
  if (tab === 'events') {
    openPanel(
      '旅行手记',
      eventRows(
        (state.events || []).filter(
          (e) => e.actorId === state.actorId || e.witnessIds?.includes(state.actorId),
        ),
      ),
      tab,
    );
    return;
  }
  if (tab === 'items') {
    const inventory = (state.inventory || [])
      .filter((i) => i.ownerId === state.actorId)
      .map(inventoryCard)
      .join('');
    const photos = (state.photos || [])
      .filter((p) => p.ownerId === state.actorId || p.witnessIds?.includes(state.actorId))
      .map(
        (p) =>
          '<article class="panel-item"><img class="panel-photo" alt="在世界中拍下的实际画面" src="' +
          p.dataUrl +
          '"><h3>' +
          esc(p.title || '群岛见闻') +
          '</h3><small>' +
          esc(worlds[p.worldId]?.name || '群岛') +
          '</small>' +
          (p.ownerId === state.actorId
            ? '<div><button class="panel-button secondary" data-exhibit="' +
              esc(p.id) +
              '">' +
              (state.exhibitionPhotoId === p.id ? '正在展出' : '在会客厅展出') +
              '</button></div>'
            : '') +
          '</article>',
      )
      .join('');
    openPanel(
      '旅行手记',
      inventory + photos ||
        '<p class="panel-muted">借用桌上的相机，可以把眼前的画面留成照片。去档案馆看看，也许能带回一件物品。</p>',
      tab,
    );
    panel.querySelectorAll('[data-exhibit]').forEach(
      (b) =>
        (b.onclick = () => {
          const r = action('exhibitPhoto', { photoId: b.dataset.exhibit });
          if (r.ok) {
            panel.close();
            notify('你拍下的这幅画面，已经留在墙上');
          }
        }),
    );
    panel.querySelectorAll('[data-equip]').forEach(
      (b) =>
        (b.onclick = () => {
          const r = action('pickup', { item: b.dataset.equip });
          if (r.ok) panel.close();
        }),
    );
    return;
  }
  if (tab === 'people') {
    let html = state.actors
      .map(
        (a) =>
          '<article class="panel-item"><h3>' +
          esc(a.name) +
          (a.id === state.actorId ? ' · 由你操控' : '') +
          '</h3><p>' +
          esc(a.goal || '在这里继续自己的生活') +
          '</p><small>' +
          esc(worlds[a.worldId]?.name || '群岛') +
          ' · ' +
          (a.owned ? '你创建的角色' : '独立居民') +
          '</small>' +
          (a.owned
            ? '<div><button class="panel-button" data-control="' +
              esc(a.id) +
              '">' +
              (a.id === state.actorId ? '回到本人' : '接管角色') +
              '</button></div>'
            : '') +
          '</article>',
      )
      .join('');
    html +=
      '<button class="panel-button secondary" id="new-agent">创建居民</button><p class="panel-muted">原型中的居民根据本地规则和见证的事件行动。</p>';
    openPanel('旅行手记', html, tab);
    panel.querySelectorAll('[data-control]').forEach(
      (b) =>
        (b.onclick = () => {
          savePosition();
          const r = action(b.dataset.control === state.actorId ? 'release' : 'takeover', {
            id: b.dataset.control,
          });
          if (r.ok) {
            panel.close();
            notify(
              state.actorId === 'self'
                ? '已回到本人，角色会继续自己的行动'
                : '已接管角色。现在由你决定下一步',
            );
          }
        }),
    );
    $('#new-agent').onclick = openCreateAgent;
    return;
  }
  openPanel(
    '旅行手记',
    Object.entries(worlds)
      .map(
        ([id, w]) =>
          '<div class="world-choice"><img src="assets/' +
          (id === 'origin' ? 'hero' : id) +
          '.webp" alt=""><div><h3>' +
          w.name +
          '</h3><p>' +
          (id === state.worldId ? '你在这里' : id === 'origin' ? '从异世界返航的地方' : w.role) +
          '</p><button class="panel-button secondary" data-destination="' +
          id +
          '">' +
          (id === state.worldId ? '当前世界' : '查看航路') +
          '</button></div></div>',
      )
      .join('') + '<a class="link-atlas" href="atlas.html">打开早期图鉴原型 ↗</a>',
    'worlds',
  );
  panel.querySelectorAll('[data-destination]').forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.destination === state.worldId) {
          panel.close();
          return;
        }
        openPortal(b.dataset.destination);
      }),
  );
}
function openCreateAgent() {
  openPanel(
    '创建一个新居民',
    '<form id="agent-form"><label>名字<input class="panel-input" name="name" required maxlength="20" placeholder="给这位居民起个名字"></label><label>它现在想做什么<textarea class="panel-input" name="goal" required maxlength="160" rows="3" placeholder="例如，替旅行回来的人整理一张共同地图"></textarea></label><button class="panel-button" type="submit">让它来到会客厅</button><p class="panel-error" role="alert"></p></form>',
  );
  $('#agent-form').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = action('createAgent', {
      name: fd.get('name'),
      goal: fd.get('goal'),
      color: 'orange',
    });
    if (r.ok) {
      openJournal('people');
      notify('新居民已经来到群岛会客厅');
    }
  };
}
function openPortal(id) {
  if (id === state.worldId) return;
  const w = worlds[id];
  if (!w) return;
  if (id === 'origin') {
    openPanel(
      '回到群岛',
      '<p>把这段经历带回会客厅。你的角色身份和带回的物品都会留在手记里。</p><button class="panel-button" id="confirm-travel">返航</button>',
    );
  } else {
    openPanel(
      '一条通往' + w.name + '的航路',
      '<p>穿过这扇门，你将以「' +
        w.role +
        '」的身份抵达。当地的居民会记住自己亲眼见过的事。</p><p class="panel-muted">' +
        (id === 'tide'
          ? '海潮退去，旧档案中有一张岸线拓片。你可以取下它，带回来与照片核对。'
          : '林间的小邮局还亮着灯，一封信正在等下一位路过的人。') +
        '</p><button class="panel-button" id="confirm-travel">以新身份进入</button>',
    );
  }
  $('#confirm-travel').onclick = () => {
    savePosition();
    const previous = state.worldId;
    const r = action(id === 'origin' ? 'return' : 'enter', { worldId: id });
    if (r.ok) {
      panel.close();
      const veil = $('#world-transition');
      veil.querySelector('p').textContent =
        id === 'origin' ? '携带经历，返回群岛' : '正在成为 ' + w.role;
      veil.classList.add('active');
      setTimeout(() => {
        restorePosition();
        savePosition();
        veil.classList.remove('active');
      }, 650);
      if (previous !== id) notify('已抵达' + w.name);
    }
  };
}
function openTalk(actorId) {
  const a = state.actors.find((x) => x.id === actorId);
  if (!a) return;
  const invitation =
    state.invitation?.from === actorId
      ? '<button class="panel-button" id="accept-invitation">接受邀请，看看航路</button>'
      : '';
  const memories = (a.memories || [])
    .slice(-2)
    .map((m) => '<p class="panel-muted">' + esc(m.text || m.summary || '') + '</p>')
    .join('');
  openPanel(
    a.name,
    '<p>' +
      esc(a.goal) +
      '</p>' +
      memories +
      invitation +
      '<div class="panel-row"><button class="panel-button secondary" id="invite-hug">邀请贴贴</button><button class="panel-button secondary" id="invite-photo">一起合影</button></div>' +
      '<form id="speak-form"><label>对它说一句话<input class="panel-input" name="message" maxlength="280" required placeholder="关于你们眼前正在发生的事"></label><button class="panel-button" type="submit">说给它听</button></form>',
  );
  $('#invite-hug').onclick = () => inviteGesture(actorId, 'hug');
  $('#invite-photo').onclick = () => inviteGesture(actorId, 'photoTogether');
  if ($('#accept-invitation'))
    $('#accept-invitation').onclick = () => openPortal(state.invitation.worldId);
  $('#speak-form').onsubmit = (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get('message');
    const r = action('speak', { text, to: actorId });
    if (r.ok) {
      panel.close();
      speechExpiry.set(actorId, {
        text: r.reply || '我会把你说的这句话留在这次相遇里。',
        expires: performance.now() + 6500,
      });
    }
  };
}
function ancestorId(object) {
  while (object) {
    if (object.userData?.interactionId) return object.userData.interactionId;
    object = object.parent;
  }
  return null;
}
function detectTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const objects = [
    ...environment.group.children,
    ...[...actorViews.values()].filter((v) => v.group.visible).map((v) => v.group),
  ];
  const hits = raycaster.intersectObjects(objects, true);
  for (const hit of hits) {
    if (hit.distance > 3.5) break;
    let visible = true,
      object = hit.object;
    while (object) {
      if (!object.visible) {
        visible = false;
        break;
      }
      object = object.parent;
    }
    if (!visible) continue;
    const id = ancestorId(hit.object);
    if (id) return { id, hit };
    if (hit.object.material?.transparent && hit.object.material.opacity < 0.4) continue;
    break;
  }
  return null;
}
function targetDescription(t) {
  if (!t) return null;
  if (t.id.startsWith('actor:')) {
    const id = t.id.slice(6),
      a = state.actors.find((x) => x.id === id);
    return {
      label: a?.name || '居民',
      action: state.held === 'photo' && id === 'wenxi' ? '把照片递给它' : '和它说句话',
    };
  }
  const map = {
    door: ['会客厅的木门', state.doorOpen ? '轻轻合上' : '推开门'],
    photo: ['桌上的码头旧照片', '拿起来看看'],
    camera: ['一台胶片相机', '拿起相机'],
    frame: [
      '留白的画框',
      state.held === 'photo'
        ? '把照片挂上去'
        : state.photoMounted || state.exhibitionPhotoId
          ? '看看你们留下的照片'
          : '看看这面墙',
    ],
    radio: ['长桌上的收音机', state.radioOn ? '关掉收音机' : '调到午夜频率'],
    rubbing: ['留在档案架上的拓片', '取下潮线拓片'],
    postcard: ['邮局桌上的明信片', '收好林间明信片'],
    'portal-tide': ['通往潮汐档案馆', '看看门后的世界'],
    'portal-origin': ['回到群岛会客厅', '带着经历返航'],
    'portal-forest': ['通往雾林邮局', '看看门后的世界'],
  };
  const meta = map[t.id];
  return meta ? { label: meta[0], action: meta[1] } : null;
}
function interact() {
  if (!started || panel.open || worldBusy || photoMode) return;
  target = detectTarget();
  if (!target) {
    notify('走近物件，让视线停在它上面');
    return;
  }
  const id = target.id;
  if (id.startsWith('actor:')) {
    const a = id.slice(6);
    if (state.held === 'photo' && a === 'wenxi') {
      action('give', { to: a }, '闻汐接过了照片');
      const route = agentRoutes.get(a);
      if (route) {
        route.target = null;
        route.wait = 0.2;
      }
    } else openTalk(a);
    return;
  }
  if (id === 'door') {
    action('door');
    return;
  }
  if (['photo', 'camera', 'rubbing', 'postcard'].includes(id)) {
    action('pickup', { item: id }, '拿起了' + itemNames[id]);
    return;
  }
  if (id === 'frame') {
    if (state.held === 'photo') action('mount', {}, '照片留在了这面墙上');
    else if (state.photoMounted || state.exhibitionPhotoId) {
      const exhibit = state.photos.find((p) => p.id === state.exhibitionPhotoId);
      openPanel(
        '你们留下的照片',
        '<img class="panel-photo" src="' +
          (exhibit?.dataUrl || 'assets/tide.webp') +
          '" alt="挂在会客厅里的照片"><p>物品的去向和挂上它的人，已经记在这次共同经历里。</p>',
      );
    } else notify('画框留着一个位置，你可以拿起桌上的旧照片。');
    return;
  }
  if (id === 'radio') {
    action('radio');
    if (!soundEnabled) toggleSound();
    return;
  }
  if (id.startsWith('portal-')) openPortal(id.replace('portal-', ''));
}
function inspectHeld() {
  if (photoMode || state.held === 'camera') {
    takePhotograph();
    return;
  }
  if (state.held === 'photo') {
    openPanel(
      '码头旧照片',
      '<img class="panel-photo" src="assets/tide.webp" alt="照片中的灯塔和旧码头"><p>背面有一行铅笔字。「第七码头，退潮以后。」</p><p class="panel-muted">你可以把照片递给闻汐，也可以亲手把它放进会客厅的画框。</p>',
    );
    return;
  }
  if (state.held === 'postcard') {
    openPanel(
      '林间明信片',
      '<p>明信片上画着林间的邮局。你可以将它收入随身物品，带回会客厅。</p><p class="panel-muted">它来自雾林，也属于真正拿起它的角色。</p>',
    );
    return;
  }
  if (state.held === 'rubbing') {
    openPanel(
      '潮线拓片',
      '<p>旧纸上的岸线，和码头照片里海水退去的轮廓相互对应。</p><p class="panel-muted">它会随持有者回到群岛会客厅，保留来自潮汐档案馆的来历。</p>',
    );
    return;
  }
  openJournal('items');
}
function takePhotograph() {
  const saved = hand?.visible;
  if (hand) hand.visible = false;
  renderer.render(scene, camera);
  const capture = document.createElement('canvas');
  capture.width = 960;
  capture.height = Math.round((960 * innerHeight) / innerWidth);
  capture.getContext('2d').drawImage(canvas, 0, 0, capture.width, capture.height);
  if (hand) hand.visible = saved;
  const dataUrl = capture.toDataURL('image/jpeg', 0.76);
  const r = action(
    'recordPhoto',
    {
      dataUrl,
      device: photoMode ? 'personal' : undefined,
      title: worlds[state.worldId].name + (selfieMode ? ' · 合影' : ' · 见闻'),
    },
    '这张照片已经留在手记里',
  );
  if (r.ok) {
    const wasPhotoMode = photoMode;
    const photoId = r.photoId;
    const flash = document.createElement('div');
    flash.style.cssText =
      'position:fixed;inset:0;background:#fff;z-index:24;pointer-events:none;transition:opacity .35s';
    document.body.append(flash);
    requestAnimationFrame(() => (flash.style.opacity = '0'));
    setTimeout(() => flash.remove(), 400);
    if (wasPhotoMode)
      setTimeout(() => {
        setPhotoMode(false);
        openWorldline({ initialTab: 'feed', composePhotoId: photoId });
      }, 420);
  }
}
function canWalk(x, z) {
  const b = environment.bounds;
  if (x < b.minX + 0.25 || x > b.maxX - 0.25 || z < b.minZ + 0.25 || z > b.maxZ - 0.25)
    return false;
  for (const c of environment.colliders || []) {
    if (c.id === 'door' && state.doorOpen) continue;
    if (x > c.minX - 0.23 && x < c.maxX + 0.23 && z > c.minZ - 0.23 && z < c.maxZ + 0.23)
      return false;
  }
  return true;
}
function movePlayer(dt) {
  let x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + moveStick.x;
  let z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - moveStick.y;
  const mag = Math.hypot(x, z);
  if (mag > 1) {
    x /= mag;
    z /= mag;
  }
  const speed = (keys.has('ShiftLeft') ? 4.1 : 2.45) * dt;
  const dx = (Math.cos(player.yaw) * x - Math.sin(player.yaw) * z) * speed,
    dz = (-Math.sin(player.yaw) * x - Math.cos(player.yaw) * z) * speed;
  if (canWalk(player.x + dx, player.z)) player.x += dx;
  if (canWalk(player.x, player.z + dz)) player.z += dz;
  const bob = mag > 0 ? 0.018 * Math.sin(performance.now() * 0.01) : 0;
  camera.position.set(player.x, 1.65 + bob, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  if (hand) hand.position.y = -0.31 + bob * 0.5;
}
function followSocial(a, visual, route, dt, t) {
  const intent = a.socialIntent;
  if (!intent || intent.expiresAt <= Date.now() || state.photoOwner === a.id) return null;
  const person = liveActorPosition(intent.targetActorId);
  const other =
    intent.targetActorId === 'self'
      ? state.self
      : state.actors.find((x) => x.id === intent.targetActorId);
  if (!person || other?.worldId !== a.worldId) return null;
  const g = visual.group,
    dx = person[0] - g.position.x,
    dz = person[1] - g.position.z;
  const distance = Math.hypot(dx, dz),
    limit = intent.kind === 'affection' ? 1.5 : 2.3;
  let photoGoal =
    intent.gesture === 'photoTogether' && intent.targetActorId === state.actorId
      ? [person[0] + Math.cos(player.yaw) * 1.1, person[1] - Math.sin(player.yaw) * 1.1]
      : null;
  if (photoGoal && !canWalk(...photoGoal)) {
    photoGoal = [person[0] - Math.cos(player.yaw) * 1.1, person[1] + Math.sin(player.yaw) * 1.1];
  }
  const arrived = photoGoal
    ? Math.hypot(photoGoal[0] - g.position.x, photoGoal[1] - g.position.z) < 0.24
    : distance <= limit;
  if (route.socialSource !== intent.sourceId) {
    route.socialSource = intent.sourceId;
    route.socialPath = [];
    route.socialPlanAt = 0;
    route.affectionAt = 0;
    route.doorDetour = false;
  }
  if (arrived) {
    g.rotation.y =
      intent.gesture === 'photoTogether' && intent.targetActorId === state.actorId
        ? player.yaw + Math.PI
        : Math.atan2(dx, dz);
    if (intent.kind === 'affection') {
      if (!route.affectionAt) {
        route.affectionAt = t;
        gesturePoses.set(a.id, { pose: intent.gesture, until: performance.now() + 1800 });
      }
      if (t - route.affectionAt < 1.2) return { walking: false };
    }
    savePosition();
    store.act('move', { actorId: a.id, position: { x: g.position.x, y: 1.65, z: g.position.z } });
    const result = store.act('socialArrive', { actorId: a.id, sourceId: intent.sourceId });
    if (result.ok) {
      route.target = null;
      route.path = [];
      route.wait = intent.kind === 'affection' ? 6 : 5;
      if (intent.kind === 'affection') {
        gesturePoses.set(a.id, {
          pose: intent.gesture,
          until: performance.now() + (intent.gesture === 'photoTogether' ? 14000 : 3500),
        });
        notify(
          intent.gesture === 'photoTogether'
            ? '它站到了你身边。按 P 可以自拍合影。'
            : '这次彼此接受的靠近，已经留在故事里。',
        );
      }
    }
    return { walking: false };
  }
  route.affectionAt = 0;
  if (t - route.socialPlanAt > 1.4 || !route.socialPath?.length) {
    route.socialPlanAt = t;
    const unit = [-dx / (distance || 1), -dz / (distance || 1)];
    const goal = photoGoal || [
      person[0] + unit[0] * (limit - 0.15),
      person[1] + unit[1] * (limit - 0.15),
    ];
    route.socialPath = planPath(
      [g.position.x, g.position.z],
      goal,
      environment.colliders,
      environment.bounds,
      { doorOpen: state.doorOpen },
    );
    if (!route.socialPath.length && state.worldId === 'origin' && !state.doorOpen) {
      const doorPoint = g.position.z < 7 ? [0, 5.9] : [0, 8.3];
      route.doorDetour = true;
      route.socialPath = planPath(
        [g.position.x, g.position.z],
        doorPoint,
        environment.colliders,
        environment.bounds,
        { doorOpen: false },
      );
    }
  }
  if (route.doorDetour && !state.doorOpen && Math.hypot(g.position.x, g.position.z - 7) < 2.2) {
    store.act('move', { actorId: a.id, position: { x: g.position.x, y: 1.65, z: g.position.z } });
    const result = store.act('agentStep', { actorId: a.id, action: 'openDoor' });
    if (result.ok) {
      route.doorDetour = false;
      route.socialPath = [];
      route.socialPlanAt = 0;
    }
  }
  const point = route.socialPath?.[0];
  let walking = false;
  if (point) {
    const x = point[0] - g.position.x,
      z = point[1] - g.position.z,
      d = Math.hypot(x, z);
    if (d < 0.07) route.socialPath.shift();
    else {
      const step = Math.min(d, 0.88 * dt);
      g.position.x += (x / d) * step;
      g.position.z += (z / d) * step;
      g.rotation.y = Math.atan2(x, z);
      walking = true;
    }
  }
  if (t - (route.lastSync || 0) > 0.6) {
    route.lastSync = t;
    store.act('move', { actorId: a.id, position: { x: g.position.x, y: 1.65, z: g.position.z } });
  }
  return { walking };
}

function animateAgents(dt, t) {
  for (const a of state.actors) {
    const visual = actorViews.get(a.id);
    if (!visual?.group.visible) continue;
    const route = agentRoutes.get(a.id);
    if (!route) continue;
    const g = visual.group;
    let walking = false;
    if (a.id === state.actorId) {
      g.position.set(player.x, 0, player.z);
      g.rotation.y = player.yaw + Math.PI;
      visual.update(dt, { pose: photoMode && selfieMode ? 'photoTogether' : undefined });
      continue;
    }
    const social =
      started && state.socialSettings.enabled ? followSocial(a, visual, route, dt, t) : null;
    if (social) walking = social.walking;
    if (
      started &&
      state.socialSettings.enabled &&
      a.id !== state.actorId &&
      !social &&
      !(gesturePoses.get(a.id)?.until > performance.now())
    ) {
      const carrying = state.photoOwner === a.id;
      const points = environment.waypoints.route || [
        [1, -1],
        [-2, 2],
      ];
      if (carrying && !route.carrying) {
        route.target = null;
        route.path = [];
        route.wait = 0;
      }
      route.carrying = carrying;
      route.wait -= dt;
      if (route.wait <= 0 && !route.target) {
        route.target = carrying
          ? environment.waypoints.frame
          : points[route.index++ % points.length];
        route.path = planPath(
          [g.position.x, g.position.z],
          route.target,
          environment.colliders,
          environment.bounds,
          { doorOpen: state.doorOpen },
        );
        if (!route.path.length) {
          route.target = null;
          route.wait = 2;
        }
      }
      if (route.target) {
        const point = route.path[0];
        if (point) {
          const dx = point[0] - g.position.x,
            dz = point[1] - g.position.z,
            dist = Math.hypot(dx, dz);
          if (dist > 0.06) {
            const step = Math.min(dist, 0.68 * dt);
            g.position.x += (dx / dist) * step;
            g.position.z += (dz / dist) * step;
            g.rotation.y = Math.atan2(dx, dz);
            walking = true;
          } else route.path.shift();
        } else {
          store.act('agentStep', {
            actorId: a.id,
            action: 'move',
            position: [g.position.x, g.position.z],
          });
          route.target = null;
          route.wait = 5 + (route.index % 3) * 3;
          if (carrying) {
            const r = action('agentStep', { actorId: a.id, action: 'mount' });
            if (r.ok) notify(a.name + '把照片挂进了画框');
          }
        }
      }
      if (t - (route.lastSync || 0) > 0.7) {
        route.lastSync = t;
        store.act('agentStep', {
          actorId: a.id,
          action: 'move',
          position: [g.position.x, g.position.z],
        });
      }
    }
    route.walking = walking;
    const gesture = gesturePoses.get(a.id);
    const activePose = gesture && gesture.until > performance.now() ? gesture.pose : undefined;
    const speech = speechExpiry.get(a.id),
      talking = !!speech && speech.expires > performance.now();
    visual.update(dt, {
      pose: activePose,
      walking,
      talking,
      carrying: state.photoOwner === a.id,
      lookAt: talking ? { x: player.x, z: player.z } : undefined,
    });
    const label =
      activePose === 'photoTogether'
        ? '等你按下快门'
        : activePose === 'hug'
          ? '彼此愿意的靠近'
          : a.socialIntent
            ? '想走近，接着聊'
            : !state.socialSettings.enabled
              ? '托管已暂停'
              : state.photoOwner === a.id
                ? '想把照片留在墙上'
                : walking
                  ? '正在走向下一处'
                  : a.owned
                    ? '自主行动'
                    : '在这里生活';
    if (visual.lastStatus !== label) {
      visual.setLabel(label);
      visual.lastStatus = label;
    }
    if (!visual.carriedPhoto) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.24),
        new THREE.MeshBasicMaterial({ map: paperTexture, side: THREE.DoubleSide }),
      );
      mesh.position.set(0, -0.39, 0.06);
      visual.rightArm.add(mesh);
      visual.carriedPhoto = mesh;
    }
    visual.carriedPhoto.visible = state.photoOwner === a.id;
  }
}

function renderSpeech() {
  const container = $('#speech-bubbles');
  container.replaceChildren();
  for (const [id, s] of speechExpiry) {
    if (s.expires < performance.now()) {
      speechExpiry.delete(id);
      continue;
    }
    const actor = actorViews.get(id);
    if (!actor?.group.visible) continue;
    const pos = actor.group.position.clone();
    pos.y = 2.15;
    if (pos.distanceTo(camera.position) > 9) continue;
    const projected = pos.project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1.2 || Math.abs(projected.y) > 1.2) continue;
    const div = document.createElement('div');
    div.className = 'speech';
    div.style.left = ((projected.x + 1) * innerWidth) / 2 + 'px';
    div.style.top = ((1 - projected.y) * innerHeight) / 2 + 'px';
    const name = document.createElement('b');
    name.textContent = state.actors.find((a) => a.id === id)?.name || '居民';
    div.append(name, document.createTextNode(s.text));
    container.append(div);
  }
}
function askPointerLock() {
  if (!started || panel.open || photoMode) return;
  if (matchMedia('(pointer:coarse)').matches) return;
  try {
    const result = canvas.requestPointerLock?.();
    result?.catch?.(() => {});
  } catch {}
}
function start() {
  started = true;
  $('#intro').classList.add('closed');
  $('#resume-look').hidden = false;
  askPointerLock();
  savePosition();
}
$('#enter-world').onclick = start;
$('#open-worldline').onclick = () => openWorldline();
$('#intro-worldline').onclick = () => openWorldline();
$('#photo-mode').onclick = () => {
  if (!started) start();
  setPhotoMode(!photoMode);
};
$('#shutter-button').onclick = takePhotograph;
$('#exit-photo').onclick = () => setPhotoMode(false);
$('#turn-camera').onclick = () => {
  selfieMode = !selfieMode;
  $('#turn-camera').textContent = selfieMode ? '拍摄风景' : '转向自拍';
  updateActors();
};
$('#open-journal').onclick = () => openJournal();
$('#open-menu').onclick = () =>
  openPanel(
    '在源界',
    '<p class="panel-muted">这是第一人称实时探索原型。居民使用本地行为规则，世界与经历保存在当前浏览器。</p><button class="panel-button" id="menu-residents">居民与参与身份</button><button class="panel-button secondary" id="menu-worlds">世界航路</button><button class="panel-button secondary" id="menu-controls">怎样探索</button><a class="link-atlas" href="atlas.html">早期图鉴原型 ↗</a>',
  ) || bindMenu();
function bindMenu() {
  $('#menu-residents').onclick = () => openJournal('people');
  $('#menu-worlds').onclick = () => openJournal('worlds');
  $('#menu-controls').onclick = () =>
    openPanel(
      '怎样探索',
      '<p>W A S D 或方向键移动，鼠标转头。靠近物件，把视线停在它上面，按 E 互动。</p><p>F 查看手中物件，拿着相机时 F 拍照。G 收起物品。Tab 打开手记。Esc 放开鼠标。</p><p class="panel-muted">鼠标无法锁定时，按住画面拖动也可以观察。触摸屏可用左侧摇杆移动，滑动右侧画面转头，点 E 互动。</p>',
    );
}
$('#interact-button').onclick = interact;
$('#touch-action').onclick = interact;
$('#held-icon').onclick = inspectHeld;
$('#drop-button').onclick = () => action('stow', {}, '已收进随身物品');
$('#resume-look').onclick = askPointerLock;
panel.addEventListener('click', (e) => {
  if (e.target === panel) panel.close();
});
panel.addEventListener('close', () => {
  if (!panel.open) {
    disposeWorldline();
    $('#resume-look').hidden = !started;
  }
});
canvas.addEventListener('click', () => {
  if (started) askPointerLock();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!started || panel.open || pointerLocked) return;
  dragging = true;
  lastMouse = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture?.(e.pointerId);
});
window.addEventListener('pointerup', () => (dragging = false));
window.addEventListener('pointermove', (e) => {
  if (!started || panel.open) return;
  if (pointerLocked || dragging) {
    const dx = pointerLocked ? e.movementX : e.clientX - lastMouse.x,
      dy = pointerLocked ? e.movementY : e.clientY - lastMouse.y;
    player.yaw -= dx * 0.0026;
    player.pitch = THREE.MathUtils.clamp(player.pitch - dy * 0.0022, -1.25, 1.2);
    lastMouse = { x: e.clientX, y: e.clientY };
  }
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked && photoMode) {
    document.exitPointerLock();
    return;
  }
  $('#resume-look').hidden = pointerLocked || !started;
  if (!pointerLocked) keys.clear();
});
document.addEventListener('keydown', (e) => {
  if (panel.open) return;
  if (e.code === 'Escape') {
    pauseLook();
    return;
  }
  if (e.target.closest('input,textarea')) return;
  const map = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' };
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', ...Object.keys(map)].includes(e.code)) {
    e.preventDefault();
    keys.add(map[e.code] || e.code);
  }
  if (!started) return;
  if (e.code === 'KeyE') {
    e.preventDefault();
    if (!e.repeat) interact();
  }
  if (e.code === 'KeyF' && !e.repeat) inspectHeld();
  if (e.code === 'KeyP' && !e.repeat) setPhotoMode(!photoMode);

  if (e.code === 'KeyG' && !e.repeat) action('stow', {}, '已收进随身物品');
  if (e.code === 'Tab') {
    e.preventDefault();
    openJournal();
  }
});
window.addEventListener('keyup', (e) => {
  const map = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' };
  keys.delete(map[e.code] || e.code);
});
window.addEventListener('blur', () => {
  keys.clear();
  dragging = false;
  savePosition();
});
window.addEventListener('beforeunload', savePosition);
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const joystick = $('#joystick');
joystick.addEventListener('pointerdown', (e) => {
  if (!started) return;
  joystick.setPointerCapture(e.pointerId);
  stick(e);
});
joystick.addEventListener('pointermove', (e) => {
  if (joystick.hasPointerCapture(e.pointerId)) stick(e);
});
function stick(e) {
  const r = joystick.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / 34,
    y = (e.clientY - r.top - r.height / 2) / 34;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  moveStick = { x, y };
  joystick.firstElementChild.style.transform = `translate(${x * 25}px,${y * 25}px)`;
}
function releaseStick() {
  moveStick = { x: 0, y: 0 };
  joystick.firstElementChild.style.transform = '';
}
joystick.addEventListener('pointerup', releaseStick);
joystick.addEventListener('pointercancel', releaseStick);
async function toggleSound() {
  if (soundEnabled) {
    soundContext?.suspend();
    soundEnabled = false;
  } else {
    if (!soundContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        notify('当前浏览器不支持环境声');
        return;
      }
      soundContext = new AudioCtx();
      const duration = 4,
        buffer = soundContext.createBuffer(
          1,
          soundContext.sampleRate * duration,
          soundContext.sampleRate,
        ),
        data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (last + 0.02 * white) / 1.02;
        last = data[i];
        data[i] *= 3.5;
      }
      soundSource = soundContext.createBufferSource();
      soundSource.buffer = buffer;
      soundSource.loop = true;
      const filter = soundContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 450;
      const gain = soundContext.createGain();
      gain.gain.value = 0.15;
      soundSource.connect(filter);
      filter.connect(gain);
      gain.connect(soundContext.destination);
      soundSource.start();
    }
    await soundContext.resume();
    soundEnabled = true;
  }
  $('#sound-toggle').setAttribute('aria-label', soundEnabled ? '关闭环境声' : '开启环境声');
  $('#sound-toggle').style.background = soundEnabled ? '#d3e4d4d9' : '';
}
$('#sound-toggle').onclick = toggleSound;
const selfAvatar = createActor({
  id: 'self-view',
  name: '你',
  color: '#b395ad',
  position: [0, 12],
});
selfAvatar.setLabel('此刻的你');
scene.add(selfAvatar.group);
selfAvatar.group.visible = false;
loadWorld(state.worldId);
restorePosition();
if (state.worldId !== 'origin') {
  $('.intro-destination p').textContent = worlds[state.worldId]?.name || '继续这段旅程';
  $('.intro-destination small').textContent = worlds[state.worldId]?.place || '让相遇继续发生';
  $('.intro-destination > div > span').textContent = 'WORLD · CONTINUED';
  $('.intro-description').textContent = '你上次留下的经历还在。继续走进这个世界。';
  $('#enter-world').firstChild.textContent = '继续漫游';
}
let lastFrame = performance.now(),
  frame = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  const t = now / 1000;
  if (!started && environment.preview) {
    const p = environment.preview;
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(...p.target);
  } else if (started && !panel.open) movePlayer(dt);
  else {
    camera.position.set(player.x, 1.65, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  }
  if (photoMode && selfieMode) {
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    camera.position.set(player.x + forward.x * 3.4, 2.05, player.z + forward.z * 3.4);
    camera.lookAt(player.x, 1.3, player.z);
  }
  if (hand) hand.visible = !(photoMode && selfieMode);
  selfAvatar.group.visible = photoMode && selfieMode && state.actorId === 'self';
  selfAvatar.group.position.set(player.x, 0, player.z);
  selfAvatar.group.rotation.y = player.yaw + Math.PI;
  selfAvatar.update(dt, { pose: photoMode && selfieMode ? 'photoTogether' : undefined });
  if (t - socialPulseAt >= 1 && !document.hidden) {
    socialPulseAt = t;
    store.act('socialPulse');
  }
  environment.update?.(dt, t);
  animateAgents(dt, t);
  selfAvatar.showLabel(!photoMode);
  for (const visual of actorViews.values()) visual.showLabel(!photoMode);
  renderer.render(scene, camera);
  if (++frame % 3 === 0 && started && !panel.open && !photoMode) {
    target = detectTarget();
    const desc = targetDescription(target);
    $('#context').hidden = !desc;
    if (desc) {
      $('#context-object').textContent = desc.label;
      $('#context-action').textContent = desc.action;
    }
    $('#reticle').classList.toggle('target', !!desc);
    renderSpeech();
  }
  if (started && t - lastSaved > 3) {
    lastSaved = t;
    savePosition();
  }
}
requestAnimationFrame(loop);
const arrivalResidents = [...actorViews.values()].filter((visual) => visual.group.visible);
Promise.race([
  Promise.allSettled([...arrivalResidents.map((visual) => visual.ready), selfAvatar.ready]),
  new Promise((resolve) => setTimeout(resolve, 15000)),
]).then(() => {
  $('#loading').classList.add('gone');
  setTimeout(() => $('#loading').remove(), 600);
});
window.originExperience = {
  store,
  player,
  scene,
  camera,
  renderer,
  get environment() {
    return environment;
  },
  go: (id) => openPortal(id),
  interact,
  start,
  openJournal,
  inspectHeld,
  openWorldline,
  setPhotoMode,
};
