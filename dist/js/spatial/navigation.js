// Paths use the same horizontal collision rectangles as first-person movement.
export function planPath(start, goal, colliders, bounds, options = {}) {
  const { doorOpen = false, radius = 0.27, step = 0.5 } = options;
  if (
    !Array.isArray(start) ||
    !Array.isArray(goal) ||
    ![
      ...start,
      ...goal,
      bounds?.minX,
      bounds?.maxX,
      bounds?.minZ,
      bounds?.maxZ,
      radius,
      step,
    ].every(Number.isFinite) ||
    start.length !== 2 ||
    goal.length !== 2 ||
    radius < 0 ||
    step <= 0
  )
    return [];

  const limit = {
    minX: bounds.minX + radius,
    maxX: bounds.maxX - radius,
    minZ: bounds.minZ + radius,
    maxZ: bounds.maxZ - radius,
  };
  if (limit.minX > limit.maxX || limit.minZ > limit.maxZ) return [];
  const obstacles = colliders
    .filter((box) => !(doorOpen && box.id === 'door'))
    .map((box) => ({
      minX: box.minX - radius,
      maxX: box.maxX + radius,
      minZ: box.minZ - radius,
      maxZ: box.maxZ + radius,
    }));
  const inside = (point) =>
    point[0] >= limit.minX &&
    point[0] <= limit.maxX &&
    point[1] >= limit.minZ &&
    point[1] <= limit.maxZ;

  function segmentClear(a, b) {
    if (!inside(a) || !inside(b)) return false;
    for (const box of obstacles) {
      let enter = 0,
        leave = 1;
      for (const [axis, lower, upper] of [
        [0, box.minX, box.maxX],
        [1, box.minZ, box.maxZ],
      ]) {
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < 1e-10) {
          if (a[axis] < lower || a[axis] > upper) {
            enter = 2;
            break;
          }
        } else {
          let first = (lower - a[axis]) / delta,
            last = (upper - a[axis]) / delta;
          if (first > last) [first, last] = [last, first];
          enter = Math.max(enter, first);
          leave = Math.min(leave, last);
          if (enter > leave) break;
        }
      }
      if (enter <= leave) return false;
    }
    return true;
  }

  if (!segmentClear(start, start) || !segmentClear(goal, goal)) return [];
  if (Math.hypot(goal[0] - start[0], goal[1] - start[1]) < 1e-6) return [];
  if (segmentClear(start, goal)) return [[...goal]];

  const width = Math.floor((limit.maxX - limit.minX) / step) + 1;
  const height = Math.floor((limit.maxZ - limit.minZ) / step) + 1;
  const total = width * height;
  if (total > 60000 || total < 1) return [];
  const pointAt = (index) => [
    limit.minX + (index % width) * step,
    limit.minZ + Math.floor(index / width) * step,
  ];
  const cellStatus = new Int8Array(total);
  function openCell(index) {
    if (!cellStatus[index]) {
      const p = pointAt(index);
      cellStatus[index] = segmentClear(p, p) ? 1 : -1;
    }
    return cellStatus[index] === 1;
  }
  function connectors(point) {
    const result = [];
    const cx = Math.round((point[0] - limit.minX) / step);
    const cz = Math.round((point[1] - limit.minZ) / step);
    for (let z = Math.max(0, cz - 1); z <= Math.min(height - 1, cz + 1); z++) {
      for (let x = Math.max(0, cx - 1); x <= Math.min(width - 1, cx + 1); x++) {
        const index = z * width + x;
        if (openCell(index) && segmentClear(point, pointAt(index))) result.push(index);
      }
    }
    return result;
  }
  const starts = connectors(start),
    goals = new Set(connectors(goal));
  if (!starts.length || !goals.size) return [];
  const parent = new Int32Array(total).fill(-2),
    queue = new Int32Array(total);
  let head = 0,
    tail = 0,
    found = -1;
  for (const index of starts) {
    parent[index] = -1;
    queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++];
    if (goals.has(index)) {
      found = index;
      break;
    }
    const x = index % width,
      z = Math.floor(index / width);
    const neighbors = [];
    if (x > 0) neighbors.push(index - 1);
    if (x + 1 < width) neighbors.push(index + 1);
    if (z > 0) neighbors.push(index - width);
    if (z + 1 < height) neighbors.push(index + width);
    for (const next of neighbors) {
      if (parent[next] !== -2 || !openCell(next) || !segmentClear(pointAt(index), pointAt(next)))
        continue;
      parent[next] = index;
      queue[tail++] = next;
    }
  }
  if (found === -1) return [];
  const points = [[...goal]];
  for (let current = found; current !== -1; current = parent[current])
    points.push(pointAt(current));
  points.push([...start]);
  points.reverse();

  // Remove grid-shaped zigzags only when the full replacement segment is safe.
  const path = [];
  let from = 0;
  while (from < points.length - 1) {
    let to = points.length - 1;
    while (to > from + 1 && !segmentClear(points[from], points[to])) to--;
    if (Math.hypot(points[to][0] - points[from][0], points[to][1] - points[from][1]) > 1e-6) {
      path.push(points[to]);
    }
    from = to;
  }
  return path;
}
