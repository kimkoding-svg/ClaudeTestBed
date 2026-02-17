/**
 * A* pathfinding on the tile grid
 */
import { isWalkable, MAP_WIDTH, MAP_HEIGHT } from './TileMap';

interface PathNode {
  x: number;
  y: number;
  g: number;  // cost from start
  h: number;  // heuristic to goal
  f: number;  // g + h
  parent: PathNode | null;
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by); // Manhattan distance
}

/**
 * Find a path from start to end on the tile grid.
 * Returns array of {x,y} steps (excluding start, including end), or empty if no path.
 */
export function findPath(
  startX: number, startY: number,
  endX: number, endY: number
): { x: number; y: number }[] {
  // Quick validation
  if (!isWalkable(endX, endY)) {
    // Try to find nearest walkable tile to the target
    const alt = findNearestWalkable(endX, endY);
    if (!alt) return [];
    endX = alt.x;
    endY = alt.y;
  }

  if (startX === endX && startY === endY) return [];

  const openSet = new Map<string, PathNode>();
  const closedSet = new Set<string>();

  const key = (x: number, y: number) => `${x},${y}`;

  const startNode: PathNode = {
    x: startX, y: startY,
    g: 0,
    h: heuristic(startX, startY, endX, endY),
    f: heuristic(startX, startY, endX, endY),
    parent: null,
  };

  openSet.set(key(startX, startY), startNode);

  const directions = [
    { dx: 0, dy: -1 }, // up
    { dx: 0, dy: 1 },  // down
    { dx: -1, dy: 0 }, // left
    { dx: 1, dy: 0 },  // right
  ];

  let iterations = 0;
  const MAX_ITERATIONS = MAP_WIDTH * MAP_HEIGHT * 2;

  while (openSet.size > 0) {
    iterations++;
    if (iterations > MAX_ITERATIONS) break; // Safety limit

    // Find node with lowest f score
    let current: PathNode | null = null;
    for (const node of openSet.values()) {
      if (!current || node.f < current.f) {
        current = node;
      }
    }

    if (!current) break;

    // Reached the goal
    if (current.x === endX && current.y === endY) {
      const path: { x: number; y: number }[] = [];
      let node: PathNode | null = current;
      while (node && (node.x !== startX || node.y !== startY)) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    const currentKey = key(current.x, current.y);
    openSet.delete(currentKey);
    closedSet.add(currentKey);

    // Check all 4 neighbors
    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const nKey = key(nx, ny);

      if (closedSet.has(nKey)) continue;
      if (!isWalkable(nx, ny)) continue;

      const g = current.g + 1;
      const existing = openSet.get(nKey);

      if (!existing || g < existing.g) {
        const h = heuristic(nx, ny, endX, endY);
        const node: PathNode = {
          x: nx, y: ny,
          g, h, f: g + h,
          parent: current,
        };
        openSet.set(nKey, node);
      }
    }
  }

  return []; // No path found
}

/**
 * Find the nearest walkable tile to a target position
 */
function findNearestWalkable(x: number, y: number): { x: number; y: number } | null {
  for (let radius = 1; radius <= 5; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // Only check perimeter
        const nx = x + dx;
        const ny = y + dy;
        if (isWalkable(nx, ny)) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return null;
}
