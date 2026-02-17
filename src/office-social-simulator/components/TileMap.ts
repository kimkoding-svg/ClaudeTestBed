/**
 * Office tilemap definition and rendering
 *
 * The office is a 40x30 tile grid. Each tile is rendered at TILE_SIZE pixels.
 * Zones define named areas (breakroom, kitchen, desks, etc.) for simulation logic.
 */
import { TileType, TileZone } from '../../shared/types/social-sim';

export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 30;
export const TILE_SIZE = 20; // pixels per tile on screen

// Shorthand aliases
const F = TileType.FLOOR;
const W = TileType.WALL;
const D = TileType.DESK;
const C = TileType.CHAIR;
const T = TileType.TABLE;
const K = TileType.COUNTER;
const P = TileType.PLANT;
const O = TileType.DOOR;
const M = TileType.COFFEE_MACHINE;
const R = TileType.FRIDGE;
const S = TileType.COUCH;
const B = TileType.WHITEBOARD;
const L = TileType.TOILET;
const N = TileType.SINK;
const U = TileType.WATER_COOLER;

// 40 wide x 30 tall office layout
// Top-left is (0,0)
export const OFFICE_MAP: TileType[][] = [
  // Row 0: top wall
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 1: entrance corridor top
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // Row 2: entrance + main corridor
  [W,F,F,F,F,F,F,O,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // Row 3: wall separating entrance from work area
  [W,F,P,F,F,F,W,W,W,W,F,F,F,W,W,W,W,W,W,F,F,W,W,W,W,W,W,F,F,W,W,W,W,W,F,F,F,F,F,W],
  // Row 4-8: Work area - desks
  [W,F,F,F,F,F,W,D,C,F,F,F,F,F,D,C,F,F,W,F,F,W,F,F,F,F,W,F,F,W,F,F,F,W,F,U,F,F,F,W],
  [W,F,F,F,F,F,W,D,C,F,F,F,F,F,D,C,F,F,W,F,F,W,F,T,T,F,W,F,F,W,F,K,F,W,F,F,F,F,F,W],
  [W,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,F,F,W,F,F,W,F,C,C,F,W,F,F,W,F,M,F,W,F,F,F,P,F,W],
  [W,F,F,F,F,F,W,D,C,F,F,F,F,F,D,C,F,F,W,F,F,W,F,C,C,F,W,F,F,W,F,R,F,W,F,F,F,F,F,W],
  [W,F,F,F,F,F,W,D,C,F,F,F,F,F,D,C,F,F,W,F,F,W,F,F,F,F,W,F,F,W,F,F,F,W,F,F,F,F,F,W],
  // Row 9: wall with doors
  [W,F,F,F,F,F,W,W,W,O,W,W,W,W,W,W,O,W,W,F,F,W,W,O,W,W,W,F,F,W,W,O,W,W,F,F,F,F,F,W],
  // Row 10-11: Main corridor
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // Row 12: wall separating corridor from lower rooms
  [W,F,F,F,W,W,W,W,W,W,W,W,W,W,W,F,F,F,W,W,W,W,W,W,W,W,W,W,F,F,W,W,W,W,W,W,W,W,F,W],
  // Row 13-17: Lower rooms - breakroom (left), kitchen (center), bathroom (right)
  [W,F,F,F,W,F,F,F,F,F,F,F,F,F,W,F,F,F,W,F,F,F,F,F,F,F,F,W,F,F,W,F,F,F,F,F,F,W,F,W],
  [W,F,F,F,W,F,S,S,F,F,F,F,P,F,W,F,F,F,W,F,K,K,K,F,F,F,F,W,F,F,W,F,L,F,F,L,F,W,F,W],
  [W,F,F,F,O,F,F,F,F,F,F,F,F,F,O,F,F,F,O,F,F,F,F,F,F,R,F,W,F,F,O,F,F,F,F,F,F,W,F,W],
  [W,F,F,F,W,F,T,T,F,F,T,T,F,F,W,F,F,F,W,F,T,T,T,F,F,F,F,W,F,F,W,F,L,F,F,L,F,W,F,W],
  [W,F,F,F,W,F,C,C,F,F,C,C,F,F,W,F,F,F,W,F,C,C,C,F,F,M,F,W,F,F,W,F,F,F,F,F,F,W,F,W],
  // Row 18: lower room walls
  [W,F,F,F,W,F,C,C,F,F,C,C,F,F,W,F,F,F,W,F,F,F,F,F,F,F,F,W,F,F,W,F,N,F,F,N,F,W,F,W],
  [W,F,F,F,W,W,W,W,W,W,W,W,W,W,W,F,F,F,W,W,W,W,W,W,W,W,W,W,F,F,W,W,W,W,W,W,W,W,F,W],
  // Row 20-23: Second work area
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,F,F,F,F,W,W,W,W,W,W,F,F,W,W,W,W,W,W,F,F,W,W,W,W,W,W,W,W,W,W,F,F,F,F,F,F,F,W],
  [W,F,F,F,F,F,W,D,C,F,F,W,F,F,W,D,C,F,F,W,F,F,W,B,F,F,F,F,F,F,F,W,F,F,F,F,F,F,F,W],
  [W,F,F,F,F,F,W,D,C,F,F,W,F,F,W,D,C,F,F,W,F,F,W,F,F,F,F,F,F,F,F,W,F,F,P,F,F,F,F,W],
  [W,F,F,F,F,F,W,F,F,F,F,W,F,F,W,F,F,F,F,W,F,F,W,F,T,T,T,T,F,F,F,W,F,F,F,F,F,F,F,W],
  [W,F,F,F,F,F,W,D,C,F,F,W,F,F,W,D,C,F,F,W,F,F,W,F,C,C,C,C,F,F,F,W,F,F,F,F,F,F,F,W],
  [W,F,F,F,F,F,W,D,C,F,F,W,F,F,W,D,C,F,F,W,F,F,W,F,C,C,C,C,F,F,F,W,F,F,F,F,F,F,F,W],
  [W,F,F,F,F,F,W,W,W,O,W,W,F,F,W,W,W,O,W,W,F,F,W,W,W,W,O,W,W,W,W,W,F,F,F,F,F,F,F,W],
  // Row 28-29: bottom corridor + wall
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// Named zones for simulation logic
export const OFFICE_ZONES: TileZone[] = [
  // Entrance / lobby
  { id: 'entrance', name: 'Entrance', type: 'entrance',
    bounds: { x: 1, y: 1, width: 5, height: 3 }, capacity: 20,
    interactionSpots: [{ x: 3, y: 2 }] },

  // Work area 1 - top left desks
  { id: 'desk_area_1', name: 'Desk Area 1', type: 'desk',
    bounds: { x: 7, y: 4, width: 4, height: 5 }, capacity: 4,
    interactionSpots: [{ x: 9, y: 5 }, { x: 9, y: 7 }] },

  // Work area 2 - top right desks
  { id: 'desk_area_2', name: 'Desk Area 2', type: 'desk',
    bounds: { x: 14, y: 4, width: 4, height: 5 }, capacity: 4,
    interactionSpots: [{ x: 16, y: 5 }, { x: 16, y: 7 }] },

  // Meeting room A
  { id: 'meeting_a', name: 'Meeting Room A', type: 'meeting',
    bounds: { x: 22, y: 4, width: 4, height: 5 }, capacity: 6,
    interactionSpots: [{ x: 23, y: 5 }, { x: 24, y: 5 }, { x: 23, y: 7 }, { x: 24, y: 7 }] },

  // Kitchen / coffee area (top right)
  { id: 'kitchen_top', name: 'Kitchenette', type: 'kitchen',
    bounds: { x: 30, y: 4, width: 3, height: 5 }, capacity: 3,
    interactionSpots: [{ x: 31, y: 6 }] },

  // Water cooler area
  { id: 'water_cooler', name: 'Water Cooler', type: 'watercooler',
    bounds: { x: 35, y: 4, width: 3, height: 2 }, capacity: 3,
    interactionSpots: [{ x: 35, y: 5 }, { x: 36, y: 5 }] },

  // Breakroom (bottom left)
  { id: 'breakroom', name: 'Break Room', type: 'breakroom',
    bounds: { x: 5, y: 13, width: 9, height: 6 }, capacity: 10,
    interactionSpots: [{ x: 7, y: 15 }, { x: 8, y: 15 }, { x: 10, y: 15 }, { x: 11, y: 15 }] },

  // Kitchen (bottom center)
  { id: 'kitchen', name: 'Kitchen', type: 'kitchen',
    bounds: { x: 19, y: 13, width: 8, height: 6 }, capacity: 6,
    interactionSpots: [{ x: 21, y: 15 }, { x: 22, y: 15 }, { x: 23, y: 15 }] },

  // Bathroom (bottom right)
  { id: 'bathroom', name: 'Bathroom', type: 'bathroom',
    bounds: { x: 31, y: 13, width: 6, height: 6 }, capacity: 4,
    interactionSpots: [] },  // No interaction in bathroom

  // Work area 3 - bottom left desks
  { id: 'desk_area_3', name: 'Desk Area 3', type: 'desk',
    bounds: { x: 7, y: 22, width: 4, height: 5 }, capacity: 4,
    interactionSpots: [{ x: 9, y: 23 }, { x: 9, y: 25 }] },

  // Work area 4 - bottom center desks
  { id: 'desk_area_4', name: 'Desk Area 4', type: 'desk',
    bounds: { x: 15, y: 22, width: 4, height: 5 }, capacity: 4,
    interactionSpots: [{ x: 17, y: 23 }, { x: 17, y: 25 }] },

  // Meeting room B (large, bottom right)
  { id: 'meeting_b', name: 'Meeting Room B', type: 'meeting',
    bounds: { x: 23, y: 22, width: 8, height: 5 }, capacity: 10,
    interactionSpots: [{ x: 25, y: 25 }, { x: 26, y: 25 }, { x: 27, y: 25 }, { x: 28, y: 25 }] },

  // Main corridors
  { id: 'corridor_main', name: 'Main Corridor', type: 'corridor',
    bounds: { x: 1, y: 10, width: 38, height: 2 }, capacity: 20,
    interactionSpots: [] },
  { id: 'corridor_bottom', name: 'Bottom Corridor', type: 'corridor',
    bounds: { x: 1, y: 20, width: 38, height: 1 }, capacity: 20,
    interactionSpots: [] },
];

// Tile colors for rendering — bright, high-contrast palette
const TILE_COLORS: Record<TileType, string> = {
  [TileType.FLOOR]: '#3d3d52',
  [TileType.WALL]: '#252540',
  [TileType.DESK]: '#7a5c3a',
  [TileType.CHAIR]: '#5a5a7a',
  [TileType.TABLE]: '#8a6a4a',
  [TileType.COUNTER]: '#7a7a8a',
  [TileType.PLANT]: '#3a8a3a',
  [TileType.DOOR]: '#6a6a4a',
  [TileType.COFFEE_MACHINE]: '#5a5a5a',
  [TileType.FRIDGE]: '#8a8a9a',
  [TileType.COUCH]: '#7a3a7a',
  [TileType.WHITEBOARD]: '#e0e0e0',
  [TileType.TOILET]: '#e8e8f0',
  [TileType.SINK]: '#9aaabb',
  [TileType.WATER_COOLER]: '#5a9ad0',
};

// Walkable tiles (characters can walk on these)
const WALKABLE = new Set([TileType.FLOOR, TileType.DOOR]);

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
  return WALKABLE.has(OFFICE_MAP[y][x]);
}

/**
 * Pre-render the tilemap to an offscreen canvas (called once)
 */
export function renderTilemapToCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_WIDTH * TILE_SIZE;
  canvas.height = MAP_HEIGHT * TILE_SIZE;
  const ctx = canvas.getContext('2d')!;

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const tile = OFFICE_MAP[y][x];
      ctx.fillStyle = TILE_COLORS[tile];
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      // Add subtle grid lines for floor tiles
      if (tile === TileType.FLOOR || tile === TileType.DOOR) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }

      // Add wall edge highlights
      if (tile === TileType.WALL) {
        ctx.strokeStyle = 'rgba(120,120,180,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * TILE_SIZE + 0.5, y * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }
  }

  // Draw zone labels — clearly visible with background
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const zone of OFFICE_ZONES) {
    if (zone.type === 'corridor') continue;
    const cx = (zone.bounds.x + zone.bounds.width / 2) * TILE_SIZE;
    const cy = (zone.bounds.y + 0.8) * TILE_SIZE;

    const label = zone.name;
    ctx.font = 'bold 9px monospace';
    const metrics = ctx.measureText(label);
    const padX = 4;
    const padY = 3;
    const bgW = metrics.width + padX * 2;
    const bgH = 12 + padY * 2;

    // Dark background for readability
    ctx.fillStyle = 'rgba(20, 20, 40, 0.75)';
    ctx.fillRect(cx - bgW / 2, cy - bgH / 2, bgW, bgH);

    // Bright label text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(label, cx, cy);
  }
  ctx.textBaseline = 'alphabetic';

  return canvas;
}

/**
 * Find which zone a position belongs to (if any)
 */
export function getZoneAt(x: number, y: number): TileZone | null {
  for (const zone of OFFICE_ZONES) {
    const b = zone.bounds;
    if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) {
      return zone;
    }
  }
  return null;
}

/**
 * Get a random walkable position within a zone
 */
export function getRandomPositionInZone(zoneId: string): { x: number; y: number } | null {
  const zone = OFFICE_ZONES.find(z => z.id === zoneId);
  if (!zone) return null;

  // If zone has interaction spots, pick one
  if (zone.interactionSpots.length > 0) {
    return zone.interactionSpots[Math.floor(Math.random() * zone.interactionSpots.length)];
  }

  // Otherwise find a random walkable tile in the zone
  const candidates: { x: number; y: number }[] = [];
  const b = zone.bounds;
  for (let y = b.y; y < b.y + b.height; y++) {
    for (let x = b.x; x < b.x + b.width; x++) {
      if (isWalkable(x, y)) {
        candidates.push({ x, y });
      }
    }
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
