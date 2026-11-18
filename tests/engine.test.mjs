import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../dist/js/engine.js';

function succeeded(result) {
  assert.equal(result.ok, true, result.error);
  return result;
}

const eventById = (state, id) => state.events.find(event => event.id === id);
const agentById = (state, id) => state.agents.find(agent => agent.id === id);

test('a human completes a journey with distinct contributions and receives one traceable relic', () => {
  const { actions, snapshot } = createEngine({storage: null});
  const { visitId } = succeeded(actions.enterWorld('forest'));
  const opening = snapshot().events.find(e => e.visitId === visitId && e.kind === 'arrival');
  assert.equal(opening.previousWorld, 'origin');
  assert.equal(opening.fromRole, '本人');
  assert.equal(opening.toRole, '林间代投员');
  const first = succeeded(actions.speak('我下次带来寄信人的回音。'));
  succeeded(actions.speak('我下次带来寄信人的回音！'));
  assert.equal(snapshot().activeVisit.progress, 1);
  assert.equal(actions.returnHome().ok, false);
  assert.equal(actions.enterWorld('tide').ok, false);
  assert.equal(snapshot().relics.length, 0);
  const second = succeeded(actions.speak('我发现信封里夹着一片叶子。'));
  const { relicId, journeyId } = succeeded(actions.returnHome());
  const s = snapshot();
  assert.equal(s.currentWorldId, 'origin');
  assert.equal(s.activeVisit, null);
  const journey = s.journeys.find(j => j.id === journeyId);
  const relic = s.relics.find(r => r.id === relicId);
  assert.deepEqual(journey.evidenceIds, [first.id, second.id]);
  assert.equal(relic.sourceEventId, first.id);
  assert.equal(relic.actorId, 'self');
  assert.equal(eventById(s, journey.returnEventId).relicId, relicId);
  assert.ok(agentById(s, 'forest-post').memories.some(m => m.eventId === first.id));
  assert.ok(!agentById(s, 'tide-keeper').memories.some(m => m.eventId === first.id));
  assert.equal(agentById(s, 'origin-scout').attitudes.self.eventId, journey.returnEventId);
  assert.equal(actions.returnHome().ok, false);
  assert.equal(snapshot().relics.length, 1);
  const next = succeeded(actions.enterWorld('forest'));
  const recognition = snapshot().events.find(e => e.visitId === next.id && e.kind === 'reply');
  assert.equal(recognition.sourceEventId, second.id);
  assert.equal(recognition.actorId, 'forest-post');
});

test('an independent agent completes a different trip while the creator stays in place', () => {
  const { actions, snapshot } = createEngine({storage: null});
  const agentId = succeeded(actions.createAgent({name:'阿澜', personality:'好奇', goal:'寻找松林里的歌声'})).id;
  const humanVisit = succeeded(actions.enterWorld('radio')).visitId;
  const { journeyId } = succeeded(actions.explore(agentId, 'forest'));
  const s = snapshot();
  assert.equal(s.control.actorId, 'self');
  assert.equal(s.activeVisit.id, humanVisit);
  assert.equal(s.currentWorldId, 'radio');
  assert.equal(s.activeVisit.progress, 0);
  const journey = s.journeys.find(j => j.id === journeyId);
  assert.equal(journey.actorId, agentId);
  assert.equal(journey.controlledBy, 'agent');
  assert.equal(s.relics[0].actorId, agentId);
  assert.equal(agentById(s, agentId).worldId, 'origin');
  assert.equal(journey.evidenceIds.length, 2);
  for (const id of journey.evidenceIds) {
    const e = eventById(s, id);
    assert.equal(e.actorId, agentId);
    assert.equal(e.controlledBy, 'agent');
    assert.ok(e.witnessIds.includes('forest-post'));
    assert.ok(!s.self.memories.some(m => m.eventId === id));
  }
  const arrival = s.events.find(e => e.visitId === journeyId && e.kind === 'arrival');
  assert.equal(arrival.fromRole, '阿澜');
  assert.equal(actions.explore('forest-post', 'tide').ok, false);
});

test('taking over a character pauses its autonomous actions and preserves separate trips on release', () => {
  const { actions, snapshot } = createEngine({storage: null});
  const selfTrip = succeeded(actions.enterWorld('radio')).id;
  succeeded(actions.takeover('origin-scout'));
  assert.equal(actions.explore('origin-scout','tide').ok, false);
  const characterTrip = succeeded(actions.enterWorld('tide')).id;
  const ambient = succeeded(actions.tick());
  assert.notEqual(ambient.actorId, 'origin-scout');
  const humanInput = succeeded(actions.speak('你下次愿不愿意和我再来？'));
  const callback = eventById(snapshot(), humanInput.replyId);
  assert.equal(callback.actorId,'tide-keeper');
  succeeded(actions.release());
  assert.equal(snapshot().activeVisit.id, selfTrip);
  assert.equal(snapshot().activeVisit.progress, 0);
  assert.equal(actions.explore('origin-scout','forest').ok, false);
  succeeded(actions.takeover('origin-scout'));
  assert.equal(snapshot().activeVisit.id, characterTrip);
  assert.equal(snapshot().activeVisit.canReturn, true);
  succeeded(actions.returnHome());
  assert.equal(snapshot().relics[0].actorId, 'origin-scout');
  assert.equal(snapshot().journeys[0].controlledBy, 'human');
  succeeded(actions.release());
  assert.equal(snapshot().activeVisit.id, selfTrip);
});

test('custom worlds, resident home, saved control, evidence and memories survive refresh', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const a = createEngine({storage});
  const world = succeeded(a.actions.createWorld({name:'河畔',description:'留一段关于河流的见闻',required:1}));
  const local = succeeded(a.actions.createAgent({name:'青石',worldId:world.id})).id;
  assert.equal(agentById(a.snapshot(), local).homeWorldId, world.id);
  succeeded(a.actions.takeover('origin-scout'));
  succeeded(a.actions.enterWorld(world.id));
  const input = succeeded(a.actions.speak('今天听见了渡船。'));
  const b = createEngine({storage});
  assert.deepEqual(b.snapshot(), a.snapshot());
  assert.equal(b.snapshot().control.actorId, 'origin-scout');
  const completed = succeeded(b.actions.returnHome());
  const c = createEngine({storage}).snapshot();
  const relic = c.relics.find(r => r.id === completed.relicId);
  assert.equal(relic.sourceEventId, input.id);
  assert.ok(agentById(c, local).memories.some(m => m.eventId === input.id));
  assert.equal(eventById(c,input.id).worldId, world.id);
});
