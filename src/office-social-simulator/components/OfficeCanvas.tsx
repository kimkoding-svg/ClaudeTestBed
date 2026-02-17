/**
 * OfficeCanvas - renders the tilemap and animated character sprites on a <canvas>.
 *
 * Rendering strategy:
 *  1. Tilemap pre-rendered once to an offscreen canvas (one drawImage per frame).
 *  2. Characters sorted by Y (painter's algorithm), sprites drawn with nearest-neighbor scaling.
 *  3. 60 fps requestAnimationFrame loop; positions interpolated client-side for smooth walking.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { SocialCharacter, Direction } from '../../shared/types/social-sim';
import { renderTilemapToCanvas, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE } from './TileMap';
import { getSpriteSheet, getAnimFrame } from './SpriteEngine';

// How large each 16×16 sprite appears on screen (scaled into tile space)
const SPRITE_DRAW_SIZE = TILE_SIZE; // 20px — matches one tile

const MOVE_SPEED = 0.12;    // tiles per frame — constant movement speed
const SNAP_DISTANCE = 20;   // tiles — only snap for truly huge jumps (cross-map teleport)

export interface CharacterScreenPos {
  id: string;
  screenX: number;
  screenY: number;
}

interface InterpPos {
  x: number;
  y: number;
  dir: Direction;
}

interface OfficeCanvasProps {
  characters: SocialCharacter[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Called each frame with screen-space positions for DOM overlays (bubbles). */
  onPositionsUpdate?: (positions: CharacterScreenPos[]) => void;
}

/**
 * Compute the actual rendered content rect inside a canvas using objectFit: contain.
 * Returns the offset and size of the rendered image within the CSS element box.
 */
function getContentRect(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const canvasW = canvas.width;
  const canvasH = canvas.height;
  const aspectRatio = canvasW / canvasH;

  let contentWidth: number, contentHeight: number, offsetX: number, offsetY: number;
  if (rect.width / rect.height > aspectRatio) {
    // Wider than canvas aspect — letterboxed horizontally
    contentHeight = rect.height;
    contentWidth = contentHeight * aspectRatio;
    offsetX = (rect.width - contentWidth) / 2;
    offsetY = 0;
  } else {
    // Taller than canvas aspect — letterboxed vertically
    contentWidth = rect.width;
    contentHeight = contentWidth / aspectRatio;
    offsetX = 0;
    offsetY = (rect.height - contentHeight) / 2;
  }

  return { contentWidth, contentHeight, offsetX, offsetY, rect };
}

export function OfficeCanvas({ characters, selectedId, onSelect, onPositionsUpdate }: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const tilemapRef = useRef<HTMLCanvasElement | null>(null);
  const positionsRef = useRef<CharacterScreenPos[]>([]);
  const interpRef = useRef<Map<string, InterpPos>>(new Map());

  // Keep characters in a ref so the render loop always sees latest without re-creating
  const charsRef = useRef(characters);
  charsRef.current = characters;

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const onPosUpdateRef = useRef(onPositionsUpdate);
  onPosUpdateRef.current = onPositionsUpdate;

  // Canvas pixel dimensions
  const canvasW = MAP_WIDTH * TILE_SIZE;
  const canvasH = MAP_HEIGHT * TILE_SIZE;

  // Pre-render tilemap once
  useEffect(() => {
    tilemapRef.current = renderTilemapToCanvas();
  }, []);

  // Click handler — hit-test character sprites, accounting for objectFit: contain
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { contentWidth, contentHeight, offsetX, offsetY, rect } = getContentRect(canvas);

    // Map click to canvas pixel coordinates
    const clickX = e.clientX - rect.left - offsetX;
    const clickY = e.clientY - rect.top - offsetY;

    // Out of bounds (clicked on letterbox area)
    if (clickX < 0 || clickX > contentWidth || clickY < 0 || clickY > contentHeight) {
      onSelect(null);
      return;
    }

    const scaleX = canvasW / contentWidth;
    const scaleY = canvasH / contentHeight;
    const mx = clickX * scaleX;
    const my = clickY * scaleY;

    const interp = interpRef.current;
    const chars = charsRef.current;
    const sorted = [...chars].sort((a, b) => {
      const ia = interp.get(a.id);
      const ib = interp.get(b.id);
      return (ia?.y ?? a.position.y) - (ib?.y ?? b.position.y);
    });

    // Larger hit area for easier clicking (1.5x sprite size)
    const hitPad = SPRITE_DRAW_SIZE * 0.25;

    for (let i = sorted.length - 1; i >= 0; i--) {
      const ch = sorted[i];
      const ip = interp.get(ch.id);
      const px = ip?.x ?? ch.position.x;
      const py = ip?.y ?? ch.position.y;
      const sx = px * TILE_SIZE;
      const sy = py * TILE_SIZE - SPRITE_DRAW_SIZE * 0.25;
      if (mx >= sx - hitPad && mx <= sx + SPRITE_DRAW_SIZE + hitPad &&
          my >= sy - hitPad && my <= sy + SPRITE_DRAW_SIZE + hitPad) {
        onSelect(ch.id === selectedRef.current ? null : ch.id);
        return;
      }
    }
    onSelect(null);
  }, [canvasW, canvasH, onSelect]);

  // Main render loop — runs once, reads refs for latest data
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const draw = () => {
      if (!running) return;
      animFrameRef.current++;

      const chars = charsRef.current;
      const selId = selectedRef.current;
      const interp = interpRef.current;

      // Clean up stale interp entries
      const charIds = new Set(chars.map(c => c.id));
      for (const key of interp.keys()) {
        if (!charIds.has(key)) interp.delete(key);
      }

      // Update interpolated positions with constant speed movement
      for (const ch of chars) {
        const targetX = ch.position.x;
        const targetY = ch.position.y;
        let ip = interp.get(ch.id);

        if (!ip) {
          // First time seeing this character — snap to position
          ip = { x: targetX, y: targetY, dir: ch.direction };
          interp.set(ch.id, ip);
        } else {
          const dx = targetX - ip.x;
          const dy = targetY - ip.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > SNAP_DISTANCE) {
            // Truly massive jump — snap immediately
            ip.x = targetX;
            ip.y = targetY;
            ip.dir = ch.direction;
          } else if (dist > 0.05) {
            // Move at constant speed toward target
            const step = Math.min(MOVE_SPEED, dist);
            ip.x += (dx / dist) * step;
            ip.y += (dy / dist) * step;

            // Derive direction from movement
            if (Math.abs(dx) > Math.abs(dy)) {
              ip.dir = dx > 0 ? 'right' : 'left';
            } else if (Math.abs(dy) > 0.02) {
              ip.dir = dy > 0 ? 'down' : 'up';
            }
          } else {
            // Close enough — snap and use server direction
            ip.x = targetX;
            ip.y = targetY;
            ip.dir = ch.direction;
          }
        }
      }

      // 1. Draw tilemap background
      if (tilemapRef.current) {
        ctx.drawImage(tilemapRef.current, 0, 0);
      }

      // 2. Sort characters by interpolated Y for painter's algorithm
      const sorted = [...chars].sort((a, b) => {
        const ia = interp.get(a.id);
        const ib = interp.get(b.id);
        return (ia?.y ?? a.position.y) - (ib?.y ?? b.position.y);
      });

      // Disable smoothing for crisp pixel art
      ctx.imageSmoothingEnabled = false;

      const positions: CharacterScreenPos[] = [];

      // 3. Draw each character
      for (const ch of sorted) {
        const ip = interp.get(ch.id);
        const px = ip?.x ?? ch.position.x;
        const py = ip?.y ?? ch.position.y;
        const dir = ip?.dir ?? ch.direction;

        // Use walking animation if still interpolating toward target
        const isMoving = ip && (Math.abs(ch.position.x - ip.x) > 0.05 || Math.abs(ch.position.y - ip.y) > 0.05);
        const renderState = isMoving ? 'busy' : ch.state;

        const sheet = getSpriteSheet(ch.id, ch.appearance.spriteColors);
        const frame = getAnimFrame(sheet, renderState, dir, animFrameRef.current);

        const sx = px * TILE_SIZE;
        const sy = py * TILE_SIZE - SPRITE_DRAW_SIZE * 0.25;

        // Selection glow
        if (ch.id === selId) {
          ctx.save();
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 10;
          ctx.globalAlpha = 0.6 + 0.2 * Math.sin(animFrameRef.current * 0.1);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx - 2, sy - 2, SPRITE_DRAW_SIZE + 4, SPRITE_DRAW_SIZE + 4);
          ctx.restore();
        }

        // Draw sprite frame (16×16 source → SPRITE_DRAW_SIZE target)
        ctx.drawImage(frame, sx, sy, SPRITE_DRAW_SIZE, SPRITE_DRAW_SIZE);

        // Working indicator — small teal pulsing dot + "W" above sprite
        if (ch.state === 'working') {
          ctx.save();
          const pulse = 0.6 + 0.4 * Math.sin(animFrameRef.current * 0.08);
          ctx.globalAlpha = pulse;
          ctx.fillStyle = '#14b8a6';
          ctx.beginPath();
          ctx.arc(sx + SPRITE_DRAW_SIZE / 2, sy - 5, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#14b8a6';
          ctx.fillText('W', sx + SPRITE_DRAW_SIZE / 2, sy - 9);
          ctx.restore();
        }

        // Character name below sprite
        ctx.save();
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = ch.id === selId ? '#fbbf24' : 'rgba(255,255,255,0.8)';
        const nameX = sx + SPRITE_DRAW_SIZE / 2;
        const nameY = sy + SPRITE_DRAW_SIZE + 8;
        ctx.fillText(ch.name.split(' ')[0], nameX, nameY);
        ctx.restore();

        positions.push({
          id: ch.id,
          screenX: sx + SPRITE_DRAW_SIZE / 2,
          screenY: sy,
        });
      }

      positionsRef.current = positions;

      // Notify parent of screen positions (throttled — every 6 frames ≈ 10Hz)
      if (onPosUpdateRef.current && animFrameRef.current % 6 === 0) {
        onPosUpdateRef.current(positions);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []); // Only mount/unmount — reads refs for data

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={canvasH}
      onClick={handleClick}
      className="w-full h-full cursor-pointer"
      style={{
        imageRendering: 'pixelated',
        objectFit: 'contain',
      }}
    />
  );
}

export default OfficeCanvas;
