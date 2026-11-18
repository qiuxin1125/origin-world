import test from 'node:test';
import assert from 'node:assert/strict';
import { planPath } from '../dist/js/spatial/navigation.js';

const bounds = { minX: -6, maxX: 6, minZ: -6, maxZ: 6 };
const table = { minX: -1, maxX: 1, minZ: -2, maxZ: 2 };

function assertSafe(start, path, obstacles, radius = .27) {
  let previous = start;
  for (const next of path) {
    const length = Math.hypot(next[0] - previous[0], next[1] - previous[1]);
    // Sample the path much more densely than the planner's half-metre grid.
    for (let i = 0; i <= Math.ceil(length / .01); i++) {
      const t = i / Math.max(1, Math.ceil(length / .01));
      const x = previous[0] + (next[0] - previous[0]) * t;
      const z = previous[1] + (next[1] - previous[1]) * t;
      for (const b of obstacles) {
        assert.ok(x < b.minX - radius || x > b.maxX + radius ||
          z < b.minZ - radius || z > b.maxZ + radius,
        `path crosses collision rectangle at ${x}, ${z}`);
      }
    }
    previous = next;
  }
}

test('walks around a table and reaches the exact requested point', () => {
  const start = [-3.1, .15], goal = [3.2, .35];
  const path = planPath(start, goal, [table], bounds);
  assert.ok(path.length > 1);
  assert.deepEqual(path.at(-1), goal);
  assert.notDeepEqual(path[0], start);
  assertSafe(start, path, [table]);
});

test('closed doors stop passage and open doors allow the same route', () => {
  const leftWall = { minX: -6, maxX: -.8, minZ: -.15, maxZ: .15 };
  const rightWall = { minX: .8, maxX: 6, minZ: -.15, maxZ: .15 };
  const door = { id: 'door', minX: -.8, maxX: .8, minZ: -.15, maxZ: .15 };
  const obstacles = [leftWall, rightWall, door];
  assert.deepEqual(planPath([0, 3], [0, -3], obstacles, bounds), []);
  const path = planPath([0, 3], [0, -3], obstacles, bounds, { doorOpen: true });
  assert.deepEqual(path.at(-1), [0, -3]);
  assertSafe([0, 3], path, [leftWall, rightWall]);
});

test('blocked destinations and out-of-bounds destinations have no path', () => {
  assert.deepEqual(planPath([-3, 0], [0, 0], [table], bounds), []);
  assert.deepEqual(planPath([-3, 0], [7, 0], [table], bounds), []);
});

test('diagonal shortcuts cannot clip an expanded obstacle corner', () => {
  const corner = { minX: -.5, maxX: .5, minZ: -.5, maxZ: .5 };
  const start = [-2, -.6], goal = [.6, 2];
  const path = planPath(start, goal, [corner], bounds, { radius: .35 });
  assert.ok(path.length > 0);
  assertSafe(start, path, [corner], .35);
});
