/**
 * Sprite Engine - generates 16x16 pixel art character sprites from color parameters
 *
 * Each sprite is a 16x16 grid of colors (or transparent).
 * Templates use numbered color slots that get filled with character-specific colors.
 * Frames are rendered to offscreen canvases and cached.
 */
import { SpriteColors, CharacterState, Direction } from '../../shared/types/social-sim';

// Color slot mapping: 1=hair, 2=skin, 3=primary (shirt), 4=secondary (accent), 5=pants, 6=shoes
// 0 = transparent

interface SpriteSheet {
  idle: [HTMLCanvasElement, HTMLCanvasElement];
  walk_down: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement];
  walk_up: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement];
  walk_left: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement];
  walk_right: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement];
  sit: [HTMLCanvasElement, HTMLCanvasElement];
  talk: [HTMLCanvasElement, HTMLCanvasElement];
}

// Sprite template using slot numbers
// H=hair, S=skin, P=primary, A=accent, L=pants (legs), B=boots/shoes
const _ = 0; // transparent

// Base facing-down idle frame 1
const IDLE_DOWN_1: (string | 0)[][] = [
  [_,_,_,_,_,'H','H','H','H','H','H',_,_,_,_,_],
  [_,_,_,_,'H','H','H','H','H','H','H','H',_,_,_,_],
  [_,_,_,_,'H','H','H','H','H','H','H','H',_,_,_,_],
  [_,_,_,_,'S','S','S','S','S','S','S','S',_,_,_,_],
  [_,_,_,'S','S','#111','S','S','S','#111','S','S','S',_,_,_],
  [_,_,_,_,'S','S','S','#c66','S','S','S','S',_,_,_,_],
  [_,_,_,_,_,'S','S','S','S','S','S',_,_,_,_,_],
  [_,_,_,_,_,'P','P','P','P','P','P',_,_,_,_,_],
  [_,_,_,_,'P','P','P','P','P','P','P','P',_,_,_,_],
  [_,_,_,'S','P','P','P','P','P','P','P','P','S',_,_,_],
  [_,_,_,_,'P','P','P','P','P','P','P','P',_,_,_,_],
  [_,_,_,_,_,'P','P','P','P','P','P',_,_,_,_,_],
  [_,_,_,_,_,'L','L','L','L','L','L',_,_,_,_,_],
  [_,_,_,_,_,'L','L',_,_,'L','L',_,_,_,_,_],
  [_,_,_,_,_,'L','L',_,_,'L','L',_,_,_,_,_],
  [_,_,_,_,'B','B','B',_,_,'B','B','B',_,_,_,_],
];

// Idle frame 2 (slight arm shift)
const IDLE_DOWN_2: (string | 0)[][] = [
  [_,_,_,_,_,'H','H','H','H','H','H',_,_,_,_,_],
  [_,_,_,_,'H','H','H','H','H','H','H','H',_,_,_,_],
  [_,_,_,_,'H','H','H','H','H','H','H','H',_,_,_,_],
  [_,_,_,_,'S','S','S','S','S','S','S','S',_,_,_,_],
  [_,_,_,'S','S','#111','S','S','S','#111','S','S','S',_,_,_],
  [_,_,_,_,'S','S','S','#c66','S','S','S','S',_,_,_,_],
  [_,_,_,_,_,'S','S','S','S','S','S',_,_,_,_,_],
  [_,_,_,_,_,'P','P','P','P','P','P',_,_,_,_,_],
  [_,_,_,_,'P','P','P','P','P','P','P','P',_,_,_,_],
  [_,_,_,_,'S','P','P','P','P','P','P','S',_,_,_,_],
  [_,_,_,_,'P','P','P','P','P','P','P','P',_,_,_,_],
  [_,_,_,_,_,'P','P','P','P','P','P',_,_,_,_,_],
  [_,_,_,_,_,'L','L','L','L','L','L',_,_,_,_,_],
  [_,_,_,_,_,'L','L',_,_,'L','L',_,_,_,_,_],
  [_,_,_,_,_,'L','L',_,_,'L','L',_,_,_,_,_],
  [_,_,_,_,'B','B','B',_,_,'B','B','B',_,_,_,_],
];

// Walking down frames (leg animation)
const WALK_DOWN_1: (string | 0)[][] = [...IDLE_DOWN_1.map(r => [...r])];
const WALK_DOWN_2: (string | 0)[][] = [...IDLE_DOWN_1.map(r => [...r])];
const WALK_DOWN_3: (string | 0)[][] = [...IDLE_DOWN_1.map(r => [...r])];
const WALK_DOWN_4: (string | 0)[][] = [...IDLE_DOWN_1.map(r => [...r])];

// Modify leg positions for walking animation
// Frame 1: left leg forward
WALK_DOWN_1[13] = [_,_,_,_,'L','L',_,_,_,_,'L','L',_,_,_,_];
WALK_DOWN_1[14] = [_,_,_,'L','L',_,_,_,_,_,'L','L',_,_,_,_];
WALK_DOWN_1[15] = [_,_,_,'B','B',_,_,_,_,'B','B','B',_,_,_,_];
// Frame 2: neutral
WALK_DOWN_2[13] = [_,_,_,_,_,'L','L',_,_,'L','L',_,_,_,_,_];
WALK_DOWN_2[14] = [_,_,_,_,_,'L','L',_,_,'L','L',_,_,_,_,_];
WALK_DOWN_2[15] = [_,_,_,_,'B','B','B',_,_,'B','B','B',_,_,_,_];
// Frame 3: right leg forward
WALK_DOWN_3[13] = [_,_,_,_,'L','L',_,_,_,_,'L','L',_,_,_,_];
WALK_DOWN_3[14] = [_,_,_,_,'L','L',_,_,_,_,_,'L','L',_,_,_];
WALK_DOWN_3[15] = [_,_,_,_,'B','B','B',_,_,_,'B','B',_,_,_,_];
// Frame 4: neutral (same as 2)
WALK_DOWN_4[13] = [...WALK_DOWN_2[13]];
WALK_DOWN_4[14] = [...WALK_DOWN_2[14]];
WALK_DOWN_4[15] = [...WALK_DOWN_2[15]];

// Sitting frame (shorter legs, on chair)
const SIT_1: (string | 0)[][] = IDLE_DOWN_1.map((row, y) => {
  if (y >= 13) return new Array(16).fill(0) as (string | 0)[]; // No visible legs when sitting
  if (y === 12) return [_,_,_,_,_,'L','L','L','L','L','L',_,_,_,_,_];
  return [...row];
});

const SIT_2: (string | 0)[][] = [...SIT_1.map(r => [...r])];

// Talking frame (mouth open indicator via slight head difference)
const TALK_1: (string | 0)[][] = IDLE_DOWN_1.map(r => [...r]);
const TALK_2: (string | 0)[][] = IDLE_DOWN_1.map(r => [...r]);
TALK_2[5] = [_,_,_,_,'S','S','S','#a44','S','S','S','S',_,_,_,_]; // mouth open

/**
 * Fill color slots in a template with character-specific colors
 */
function fillTemplate(template: (string | 0)[][], colors: SpriteColors): (string | 0)[][] {
  const darken = (hex: string, amount: number): string => {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  const pantsColor = darken(colors.primary, 40);
  const shoeColor = '#1a1a1a';

  return template.map(row =>
    row.map(cell => {
      if (cell === 0) return 0;
      if (cell === 'H') return colors.hair;
      if (cell === 'S') return colors.skin;
      if (cell === 'P') return colors.primary;
      if (cell === 'A') return colors.secondary;
      if (cell === 'L') return pantsColor;
      if (cell === 'B') return shoeColor;
      return cell; // Already a color string (#111, #c66, etc.)
    })
  );
}

/**
 * Render a filled sprite frame to a small canvas (16x16 pixels, no scaling)
 */
function renderFrameToCanvas(frame: (string | 0)[][]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const color = frame[y]?.[x];
      if (typeof color === 'string') {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  return canvas;
}

/**
 * Mirror a frame horizontally (for left/right variants)
 */
function mirrorFrame(frame: (string | 0)[][]): (string | 0)[][] {
  return frame.map(row => [...row].reverse());
}

// Cache for generated sprite sheets
const spriteCache = new Map<string, SpriteSheet>();

/**
 * Generate a complete sprite sheet for a character.
 * Results are cached by character ID.
 */
export function getSpriteSheet(characterId: string, colors: SpriteColors): SpriteSheet {
  const cached = spriteCache.get(characterId);
  if (cached) return cached;

  // Fill all templates with character colors
  const idle1 = fillTemplate(IDLE_DOWN_1, colors);
  const idle2 = fillTemplate(IDLE_DOWN_2, colors);
  const wd1 = fillTemplate(WALK_DOWN_1, colors);
  const wd2 = fillTemplate(WALK_DOWN_2, colors);
  const wd3 = fillTemplate(WALK_DOWN_3, colors);
  const wd4 = fillTemplate(WALK_DOWN_4, colors);
  const sit1 = fillTemplate(SIT_1, colors);
  const sit2 = fillTemplate(SIT_2, colors);
  const talk1 = fillTemplate(TALK_1, colors);
  const talk2 = fillTemplate(TALK_2, colors);

  // Render to canvases
  const sheet: SpriteSheet = {
    idle: [renderFrameToCanvas(idle1), renderFrameToCanvas(idle2)],
    walk_down: [renderFrameToCanvas(wd1), renderFrameToCanvas(wd2), renderFrameToCanvas(wd3), renderFrameToCanvas(wd4)],
    walk_up: [renderFrameToCanvas(mirrorFrame(wd1)), renderFrameToCanvas(mirrorFrame(wd2)), renderFrameToCanvas(mirrorFrame(wd3)), renderFrameToCanvas(mirrorFrame(wd4))],
    walk_left: [renderFrameToCanvas(mirrorFrame(wd1)), renderFrameToCanvas(mirrorFrame(wd2)), renderFrameToCanvas(mirrorFrame(wd3)), renderFrameToCanvas(mirrorFrame(wd4))],
    walk_right: [renderFrameToCanvas(wd1), renderFrameToCanvas(wd2), renderFrameToCanvas(wd3), renderFrameToCanvas(wd4)],
    sit: [renderFrameToCanvas(sit1), renderFrameToCanvas(sit2)],
    talk: [renderFrameToCanvas(talk1), renderFrameToCanvas(talk2)],
  };

  spriteCache.set(characterId, sheet);
  return sheet;
}

/**
 * Get the correct animation frame for a character's current state
 */
export function getAnimFrame(
  sheet: SpriteSheet,
  state: CharacterState,
  direction: Direction,
  frameCounter: number
): HTMLCanvasElement {
  const slow = Math.floor(frameCounter / 30) % 2; // Toggle every 30 frames (~0.5s at 60fps)
  const fast = Math.floor(frameCounter / 10) % 4;  // Cycle every 10 frames for walk

  switch (state) {
    case 'busy':
    case 'walking': {
      const walkKey = `walk_${direction}` as keyof SpriteSheet;
      const frames = sheet[walkKey] as HTMLCanvasElement[];
      return frames[fast % frames.length];
    }
    case 'sitting':
    case 'eating':
    case 'drinking':
    case 'bathroom':
      return sheet.sit[slow];
    case 'talking':
      return sheet.talk[Math.floor(frameCounter / 15) % 2]; // Faster toggle for talking
    case 'idle':
    default:
      return sheet.idle[slow];
  }
}

/**
 * Clear the sprite cache (e.g., when starting a new simulation)
 */
export function clearSpriteCache(): void {
  spriteCache.clear();
}
