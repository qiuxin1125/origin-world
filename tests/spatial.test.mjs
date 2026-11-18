import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialStore } from '../dist/js/spatial/state.js';

const good = result => { assert.equal(result.ok, true, result.error); return result; };
const moved = (store, actorId, x, z) => good(store.act('move', { actorId, position: { x, y: 1.65, z, yaw: 0, pitch: 0 } }));
const resident = (state, id) => state.actors.find(actor => actor.id === id);

test('physical photo changes hands once, then the recipient can visibly mount it', () => {
  const store = createSpatialStore({ storage: null });
  moved(store, 'self', -2, 1);
  good(store.act('pickup', { item: 'photo' }));
  assert.equal(store.snapshot().held, 'photo');
  assert.equal(store.act('pickup', { item: 'camera' }).ok, false);
  const given = good(store.act('give', { to: 'wenxi' }));
  assert.equal(store.snapshot().held, null);
  assert.equal(store.snapshot().photoOwner, 'wenxi');
  assert.equal(store.act('pickup', { item: 'photo' }).ok, false);
  moved(store, 'wenxi', 8, 8);
  assert.equal(store.act('mount', { actorId: 'wenxi' }).ok, false);
  moved(store, 'wenxi', -5, -3);
  const mounted = good(store.act('mount', { actorId: 'wenxi' }));
  const state = store.snapshot();
  assert.equal(state.photoMounted, true);
  assert.equal(state.photoOwner, 'frame');
  assert.equal(resident(state, 'wenxi').held, null);
  assert.equal(state.events.find(event => event.id === mounted.eventId).sourceId, given.eventId);
  assert.equal(resident(state, 'wenxi').attitude.self.sourceId, mounted.eventId);
  assert.equal(state.invitation.worldId, 'tide');
  assert.ok(resident(state, 'wenxi').memories.some(memory => memory.eventId === given.eventId));
  assert.ok(!resident(state, 'post').memories.some(memory => memory.eventId === given.eventId));
});

test('taking over and releasing keeps separate bodies, possessions and autonomous decisions', () => {
  const store = createSpatialStore({ storage: null });
  moved(store, 'self', -2, 1);
  good(store.act('pickup', { item: 'photo' }));
  good(store.act('takeover', { id: 'shiyi' }));
  assert.equal(store.snapshot().held, null);
  assert.equal(store.snapshot().photoOwner, 'self');
  assert.equal(store.act('agentStep', { actorId: 'shiyi', action: 'move', position: [2, 2] }).ok, false);
  good(store.act('enter', { worldId: 'tide' }));
  assert.equal(store.snapshot().worldId, 'tide');
  good(store.act('release'));
  assert.equal(store.snapshot().worldId, 'origin');
  assert.equal(store.snapshot().held, 'photo');
  assert.equal(resident(store.snapshot(), 'shiyi').worldId, 'tide');
  assert.equal(store.act('takeover', { id: 'wenxi' }).ok, false);
});

test('a trip stows held objects without losing ownership, and brings back the actual relic', () => {
  const store = createSpatialStore({ storage: null });
  moved(store, 'self', -2, 1);
  good(store.act('pickup', { item: 'camera' }));
  const trip = good(store.act('enter', { worldId: 'tide' }));
  assert.equal(store.snapshot().held, null);
  assert.equal(store.snapshot().cameraOwner, 'self');
  assert.ok(store.snapshot().inventory.some(item => item.kind === 'camera' && item.ownerId === 'self'));
  moved(store, 'self', -1, -2);
  const taken = good(store.act('pickup', { item: 'rubbing' }));
  assert.equal(store.snapshot().rubbingTaken, true);
  const returned = good(store.act('return'));
  const state = store.snapshot();
  assert.equal(state.worldId, 'origin');
  assert.equal(state.rubbingOwner, 'self');
  assert.ok(state.inventory.some(item => item.kind === 'rubbing' && item.ownerId === 'self'));
  assert.equal(state.journeys[0].id, trip.journeyId);
  assert.equal(state.journeys[0].sourceId, taken.eventId);
  assert.equal(state.journeys[0].returnEventId, returned.eventId);
  assert.equal(store.act('return').ok, false);
  good(store.act('pickup', { item: 'camera' }));
  assert.equal(store.snapshot().held, 'camera');
  assert.equal(store.snapshot().inventory.filter(item => item.kind === 'camera').length, 0);
});

test('failed or remote interactions do not change the world or create false memories', () => {
  const store = createSpatialStore({ storage: null });
  const before = store.snapshot();
  assert.equal(store.act('pickup', { item: 'photo' }).ok, false);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(store.act('give', { to: 'post' }).ok, false);
  assert.deepEqual(store.snapshot(), before);
  good(store.act('enter', { worldId: 'tide' }));
  const entered = store.snapshot();
  assert.equal(store.act('pickup', { item: 'photo' }).ok, false);
  assert.equal(store.act('door').ok, false);
  assert.deepEqual(store.snapshot(), entered);
});

test('visitors can return empty-handed, and the forest has its own single physical postcard', () => {
  const store = createSpatialStore({ storage: null });
  good(store.act('enter', { worldId: 'tide' }));
  good(store.act('return'));
  assert.equal(store.snapshot().journeys[0].item, null);
  assert.match(store.snapshot().events.find(event => event.type === 'return').text, /没有携带遗留物/);
  assert.equal(store.snapshot().rubbingTaken, false);
  good(store.act('enter', { worldId: 'forest' }));
  moved(store, 'self', 0.6, 0.5);
  const source = good(store.act('pickup', { item: 'postcard' }));
  assert.equal(store.snapshot().postcardOwner, 'self');
  assert.equal(store.snapshot().rubbingOwner, null);
  good(store.act('return'));
  const state = store.snapshot();
  assert.equal(state.journeys[1].item, 'postcard');
  assert.equal(state.journeys[1].sourceId, source.eventId);
  assert.ok(state.inventory.some(item => item.kind === 'postcard' && item.ownerId === 'self'));
  assert.ok(resident(state, 'forest-post').memories.some(memory => memory.eventId === source.eventId));
  assert.ok(!resident(state, 'post').memories.some(memory => memory.eventId === source.eventId));
});

test('personal memories, artifact provenance, control and camera pose survive reopening', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const a = createSpatialStore({ storage });
  const created = good(a.act('createAgent', { name: '阿澜', goal: '研究潮水的颜色' }));
  good(a.act('takeover', { id: created.id }));
  moved(a, created.id, -2, 0);
  good(a.act('pickup', { item: 'photo' }));
  good(a.act('enter', { worldId: 'tide' }));
  moved(a, created.id, -2, -3);
  good(a.act('pickup', { item: 'rubbing' }));
  good(a.act('return'));
  a.dispose();
  const b = createSpatialStore({ storage });
  assert.equal(b.snapshot().actorId, created.id);
  assert.equal(b.snapshot().rubbingOwner, created.id);
  assert.equal(b.snapshot().photoOwner, created.id);
  assert.equal(b.snapshot().journeys[0].actorId, created.id);
  assert.ok(resident(b.snapshot(), created.id).memories.some(memory => memory.type === 'pickup'));
  assert.ok(resident(b.snapshot(), 'post').memories.some(memory => memory.type === 'pickup'));
  assert.equal(b.snapshot().persistence, 'local');
});

test('captured photographs keep ownership and the scene event that produced them', () => {
  const store = createSpatialStore({ storage: null });
  assert.equal(store.act('recordPhoto', { dataUrl: 'data:image/png;base64,YQ==' }).ok, false);
  moved(store, 'self', -2, 0);
  good(store.act('pickup', { item: 'camera' }));
  for (let i = 0; i < 9; i++) good(store.act('recordPhoto', { title: '第' + i + '张', dataUrl: 'data:image/png;base64,YQ==' }));
  const state = store.snapshot();
  assert.equal(state.photos.length, 8);
  assert.equal(state.photos.at(-1).ownerId, 'self');
  assert.equal(state.events.find(event => event.id === state.photos.at(-1).sourceId).type, 'photograph');
  const prior = store.snapshot();
  assert.equal(store.act('recordPhoto', { dataUrl: 'data:image/png;base64,' + 'A'.repeat(500000) }).ok, false);
  assert.deepEqual(store.snapshot(), prior);
});

test('an owned photograph can be exhibited near the frame without changing the old photograph', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = createSpatialStore({ storage });
  moved(store, 'self', -1, 0.3);
  good(store.act('pickup', { item: 'camera' }));
  const captured = good(store.act('recordPhoto', { title: '海边的第一天', dataUrl: 'data:image/png;base64,YQ==' }));
  moved(store, 'self', -3.65, -4);
  const exhibited = good(store.act('exhibitPhoto', { photoId: captured.photoId }));
  const state = store.snapshot();
  assert.equal(state.exhibitionPhotoId, captured.photoId);
  assert.equal(state.photoOwner, 'table');
  assert.equal(state.photoMounted, false);
  assert.equal(state.photos[0].ownerId, 'self');
  const event = state.events.find(entry => entry.id === exhibited.eventId);
  assert.equal(event.type, 'exhibit');
  assert.equal(event.sourceId, captured.eventId);
  assert.equal(event.photoId, captured.photoId);
  const restored = createSpatialStore({ storage });
  assert.equal(restored.snapshot().exhibitionPhotoId, captured.photoId);

  for (let i = 0; i < 9; i++) {
    good(restored.act('recordPhoto', { title: '后来的第' + i + '张', dataUrl: 'data:image/png;base64,YQ==' }));
  }
  assert.equal(restored.snapshot().photos.length, 8);
  assert.ok(restored.snapshot().photos.some(photo => photo.id === captured.photoId));
});

test('exhibiting requires the actual owner at the source-world frame and failures leave no events', () => {
  const store = createSpatialStore({ storage: null });
  moved(store, 'self', -1, 0.3);
  good(store.act('pickup', { item: 'camera' }));
  const captured = good(store.act('recordPhoto', { dataUrl: 'data:image/png;base64,YQ==' }));

  moved(store, 'self', 10, 10);
  let prior = store.snapshot();
  assert.equal(store.act('exhibitPhoto', { photoId: captured.photoId }).ok, false);
  assert.deepEqual(store.snapshot(), prior);

  good(store.act('enter', { worldId: 'tide' }));
  moved(store, 'self', -3.65, -4);
  prior = store.snapshot();
  assert.equal(store.act('exhibitPhoto', { photoId: captured.photoId }).ok, false);
  assert.deepEqual(store.snapshot(), prior);

  good(store.act('return'));
  good(store.act('takeover', { id: 'shiyi' }));
  moved(store, 'shiyi', -3.65, -4);
  prior = store.snapshot();
  assert.equal(store.act('exhibitPhoto', { photoId: captured.photoId }).ok, false);
  assert.equal(store.act('exhibitPhoto', { photoId: 'missing-photo' }).ok, false);
  assert.deepEqual(store.snapshot(), prior);
});

test('older spatial saves receive an empty exhibition field on load', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  createSpatialStore({ storage });
  const [key, raw] = values.entries().next().value;
  const previous = JSON.parse(raw);
  delete previous.exhibitionPhotoId;
  values.set(key, JSON.stringify(previous));
  assert.equal(createSpatialStore({ storage }).snapshot().exhibitionPhotoId, null);
});
