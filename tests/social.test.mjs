import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialStore } from '../dist/js/spatial/state.js';

const good = (result) => {
  assert.equal(result.ok, true, result.error);
  return result;
};
function setup() {
  let time = 1_000_000;
  const store = createSpatialStore({ storage: null, now: () => time });
  return {
    store,
    tick: (ms = 30000) => {
      time += ms;
      return good(store.act('socialPulse'));
    },
  };
}
function move(store, actorId, x, z) {
  return good(store.act('move', { actorId, position: { x, y: 1.65, z } }));
}
function capture(store) {
  return good(
    store.act('recordPhoto', {
      device: 'personal',
      dataUrl: 'data:image/png;base64,YQ==',
      title: '海风与来客',
    }),
  );
}

test('a published scene photograph is only read later by eligible residents, with traceable replies', () => {
  const { store, tick } = setup();
  const photo = capture(store);
  const { postId, eventId } = good(
    store.act('publishPost', { photoId: photo.photoId, text: '今天拍下海边的一位朋友。' }),
  );
  let s = store.snapshot();
  assert.equal(s.feed[0].sourceId, eventId);
  assert.equal(s.feed[0].photoDataUrl, 'data:image/png;base64,YQ==');
  assert.equal(s.chapters.length, 0);
  assert.equal(s.pendingSocial.length, 2);
  assert.deepEqual(s.feed[0].seenBy, []);
  assert.equal(tick(5000).changed, false);
  tick();
  s = store.snapshot();
  assert.deepEqual(new Set(s.feed[0].seenBy), new Set(['wenxi', 'shiyi']));
  assert.equal(s.feed[0].comments.length, 2);
  assert.equal(
    s.actors.find((a) => a.id === 'post').memories.some((m) => m.type === 'post_seen'),
    false,
  );
  assert.equal(s.actors.find((a) => a.id === 'wenxi').socialIntent.kind, 'approach');
  assert.equal(
    s.events.some((e) => e.type === 'social_arrival'),
    false,
  );
  assert.equal(s.chapters.length, 1);
  for (const id of s.chapters[0].sourceEventIds) assert.ok(s.events.some((e) => e.id === id));
  assert.equal(s.chapters[0].postId, postId);
  const before = s.feed[0].comments.length;
  tick();
  assert.equal(store.snapshot().feed[0].comments.length, before);
});

test('circle posts require previous acquaintance and controlled characters defer autonomous responses', () => {
  const a = setup();
  good(a.store.act('publishPost', { text: '想和朋友聊聊今天的海风', visibility: 'circle' }));
  a.tick();
  assert.equal(a.store.snapshot().pendingSocial.length, 0);
  assert.equal(a.store.snapshot().feed[0].seenBy.length, 0);
  const { store, tick } = setup();
  good(store.act('publishPost', { text: '分享一张海边朋友的照片。' }));
  good(store.act('takeover', { id: 'shiyi' }));
  tick();
  assert.equal(store.snapshot().feed[0].seenBy.includes('shiyi'), false);
  good(store.act('release'));
  tick(4000);
  assert.equal(store.snapshot().feed[0].seenBy.includes('shiyi'), true);
});

test('disinterest can stay silent and UI cannot move the simulation clock forward', () => {
  const { store, tick } = setup();
  good(store.act('publishPost', { text: '1 + 1 = 2' }));
  good(store.act('socialPulse', { now: Number.MAX_SAFE_INTEGER }));
  assert.equal(store.snapshot().feed[0].seenBy.length, 0);
  tick();
  const s = store.snapshot();
  assert.equal(s.feed[0].comments.length + s.feed[0].reactions.length, 0);
  assert.equal(s.chapters.length, 0);
  assert.equal(s.feed[0].seenBy.length, 2);
});

test('a social approach only becomes a contact event after a real arrival', () => {
  const { store, tick } = setup();
  good(store.act('publishPost', { text: '海岸摄影让我想把这次相遇留下来。' }));
  tick();
  let s = store.snapshot();
  const intent = s.actors.find((a) => a.id === 'wenxi').socialIntent;
  const before = store.snapshot();
  assert.equal(
    store.act('socialArrive', { actorId: 'wenxi', sourceId: intent.sourceId }).ok,
    false,
  );
  assert.deepEqual(store.snapshot(), before);
  move(store, 'self', 1, 0);
  const arrived = good(store.act('socialArrive', { actorId: 'wenxi', sourceId: intent.sourceId }));
  s = store.snapshot();
  const fact = s.events.find((e) => e.id === arrived.eventId);
  assert.equal(fact.type, 'social_arrival');
  assert.equal(fact.sourceId, intent.sourceId);
  assert.equal(s.actors.find((a) => a.id === 'wenxi').socialIntent, null);
  assert.ok(s.chapters[0].sourceEventIds.includes(fact.id));
});

test('affection is an invitation and accepted gestures remain unperformed until actual proximity', () => {
  const { store } = setup();
  move(store, 'self', 1, 0);
  const first = good(store.act('inviteAffection', { to: 'wenxi', gesture: 'hug' }));
  assert.equal(first.accepted, false);
  assert.equal(
    store.snapshot().events.some((e) => e.type === 'affection'),
    false,
  );
  good(store.act('speak', { text: '我想了解你正在辨认的海岸。' }));
  good(store.act('speak', { text: '愿意下次一起去看看吗？' }));
  const invite = good(store.act('inviteAffection', { to: 'wenxi', gesture: 'hug' }));
  assert.equal(invite.accepted, true);
  assert.equal(
    store.snapshot().events.some((e) => e.type === 'affection'),
    false,
  );
  move(store, 'wenxi', 8, 8);
  assert.equal(
    store.act('socialArrive', { actorId: 'wenxi', sourceId: invite.intentSourceId }).ok,
    false,
  );
  move(store, 'wenxi', 1, 1);
  const arrival = good(
    store.act('socialArrive', { actorId: 'wenxi', sourceId: invite.intentSourceId }),
  );
  const fact = store.snapshot().events.find((e) => e.id === arrival.eventId);
  assert.equal(fact.type, 'affection');
  assert.equal(fact.gesture, 'hug');
});

test('pause holds pending actions and resuming records the actual processing time', () => {
  const { store, tick } = setup();
  good(store.act('publishPost', { text: '与朋友一起拍照片' }));
  good(store.act('setSocialEnabled', { enabled: false }));
  tick(900000);
  assert.equal(store.snapshot().feed[0].seenBy.length, 0);
  good(store.act('setSocialEnabled', { enabled: true }));
  tick();
  const event = store.snapshot().events.find((e) => e.type === 'social_comment');
  assert.equal(event.time, 1_930_000);
});

test('old saves gain social fields and published photographs survive normal photo pruning', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const original = createSpatialStore({ storage });
  const raw = JSON.parse(values.get('origin-world.spatial.v1'));
  delete raw.feed;
  delete raw.pendingSocial;
  delete raw.chapters;
  delete raw.socialSettings;
  values.set('origin-world.spatial.v1', JSON.stringify(raw));
  const store = createSpatialStore({ storage });
  assert.deepEqual(store.snapshot().feed, []);
  const first = capture(store);
  good(store.act('publishPost', { photoId: first.photoId, text: '' }));
  for (let i = 0; i < 12; i++) capture(store);
  assert.ok(store.snapshot().photos.some((p) => p.id === first.photoId));
  assert.equal(store.snapshot().feed[0].photoDataUrl, 'data:image/png;base64,YQ==');
  const restored = createSpatialStore({ storage }).snapshot();
  assert.equal(restored.feed[0].photoId, first.photoId);
  assert.equal(restored.socialSettings.mode, 'local-demo');
  original.dispose();
});

test('posts reject foreign photos and chapters can be marked read without altering source facts', () => {
  const { store, tick } = setup();
  const first = capture(store);
  good(store.act('takeover', { id: 'shiyi' }));
  const before = store.snapshot();
  assert.equal(store.act('publishPost', { photoId: first.photoId }).ok, false);
  assert.deepEqual(store.snapshot(), before);
  good(store.act('release'));
  good(store.act('publishPost', { photoId: first.photoId, text: '海边的人和风' }));
  tick();
  const chapter = store.snapshot().chapters[0];
  const facts = store.snapshot().events;
  good(store.act('readChapter', { chapterId: chapter.id }));
  assert.ok(store.snapshot().chapters[0].readAt);
  assert.deepEqual(store.snapshot().events, facts);
});

test('an autonomous resident near the source-world door can open it under its own identity', () => {
  const { store } = setup();
  move(store, 'wenxi', 0, 5.5);
  const result = good(store.act('agentStep', { actorId: 'wenxi', action: 'openDoor' }));
  const state = store.snapshot();
  assert.equal(state.doorOpen, true);
  const fact = state.events.find(event => event.id === result.eventId);
  assert.equal(fact.actorId, 'wenxi');
  assert.equal(fact.controlledBy, 'agent');
  assert.equal(fact.type, 'door');
  assert.equal(fact.worldId, 'origin');
  const repeated = good(store.act('agentStep', { actorId: 'wenxi', action: 'openDoor' }));
  assert.equal(repeated.changed, false);
  assert.equal(store.snapshot().events.length, state.events.length);
});

test('far-away, foreign-world and controlled residents cannot invent a door-opening event', () => {
  const { store } = setup();
  let before = store.snapshot();
  assert.equal(store.act('agentStep', { actorId: 'wenxi', action: 'openDoor' }).ok, false);
  assert.deepEqual(store.snapshot(), before);
  move(store, 'post', 0, 7);
  before = store.snapshot();
  assert.equal(store.act('agentStep', { actorId: 'post', action: 'openDoor' }).ok, false);
  assert.deepEqual(store.snapshot(), before);
  move(store, 'shiyi', 0, 6);
  good(store.act('takeover', { id: 'shiyi' }));
  before = store.snapshot();
  assert.equal(store.act('agentStep', { actorId: 'shiyi', action: 'openDoor' }).ok, false);
  assert.deepEqual(store.snapshot(), before);
});
