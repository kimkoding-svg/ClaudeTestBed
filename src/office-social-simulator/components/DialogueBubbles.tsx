/**
 * DialogueBubbles — DOM overlay for speech bubbles above characters.
 *
 * Positioned absolutely over the canvas using screen-space character positions.
 * Text types out character by character (~30ms/char) for a readable, slow reveal.
 * Bubbles stay visible for reading time after typing completes, then fade out.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { CharacterScreenPos } from './OfficeCanvas';

export interface BubbleData {
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  timestamp: number;
}

interface ActiveBubble extends BubbleData {
  displayedChars: number;
  phase: 'typing' | 'reading' | 'fading';
  fadeStart: number;
}

interface DialogueBubblesProps {
  bubbles: BubbleData[];
  characterPositions: CharacterScreenPos[];
  canvasRect: { width: number; height: number; naturalWidth: number; naturalHeight: number } | null;
}

const TYPING_SPEED_MS = 30;  // ms per character
const READING_TIME_MS = 2000; // how long bubble stays after typing
const FADE_DURATION_MS = 500;
const MAX_VISIBLE = 2;

export function DialogueBubbles({ bubbles, characterPositions, canvasRect }: DialogueBubblesProps) {
  const [activeBubbles, setActiveBubbles] = useState<ActiveBubble[]>([]);
  const processedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Add new bubbles from props
  useEffect(() => {
    for (const b of bubbles) {
      if (!processedRef.current.has(b.id)) {
        processedRef.current.add(b.id);
        setActiveBubbles(prev => {
          // If too many, fade out oldest
          let next = [...prev];
          while (next.length >= MAX_VISIBLE) {
            // Force-fade the oldest
            if (next[0]) {
              next[0] = { ...next[0], phase: 'fading', fadeStart: Date.now() };
            }
            // Actually remove if already fading
            if (next[0]?.phase === 'fading') {
              next = next.slice(1);
            } else {
              break;
            }
          }
          return [...next, {
            ...b,
            displayedChars: 0,
            phase: 'typing' as const,
            fadeStart: 0,
          }];
        });
      }
    }
  }, [bubbles]);

  // Animation tick — advance typing, transition phases
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setActiveBubbles(prev => {
        const now = Date.now();
        let changed = false;
        const next = prev.map(bubble => {
          if (bubble.phase === 'typing') {
            if (bubble.displayedChars < bubble.text.length) {
              changed = true;
              return { ...bubble, displayedChars: bubble.displayedChars + 1 };
            } else {
              // Done typing → reading phase
              changed = true;
              return { ...bubble, phase: 'reading' as const, fadeStart: now + READING_TIME_MS };
            }
          } else if (bubble.phase === 'reading') {
            if (now >= bubble.fadeStart) {
              changed = true;
              return { ...bubble, phase: 'fading' as const, fadeStart: now };
            }
          } else if (bubble.phase === 'fading') {
            if (now - bubble.fadeStart > FADE_DURATION_MS) {
              changed = true;
              return null; // remove
            }
          }
          return bubble;
        }).filter(Boolean) as ActiveBubble[];

        return changed ? next : prev;
      });
    }, TYPING_SPEED_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Clean up processed set when it gets large
  useEffect(() => {
    if (processedRef.current.size > 200) {
      const keep = new Set(activeBubbles.map(b => b.id));
      processedRef.current = keep;
    }
  }, [activeBubbles]);

  if (!canvasRect || activeBubbles.length === 0) return null;

  // Scale factor: canvas CSS size vs internal resolution
  const scaleX = canvasRect.width / canvasRect.naturalWidth;
  const scaleY = canvasRect.height / canvasRect.naturalHeight;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {activeBubbles.map(bubble => {
        const pos = characterPositions.find(p => p.id === bubble.speakerId);
        if (!pos) return null;

        // Scale screen positions to match CSS-scaled canvas
        const x = pos.screenX * scaleX;
        const y = pos.screenY * scaleY;

        const opacity = bubble.phase === 'fading'
          ? Math.max(0, 1 - (Date.now() - bubble.fadeStart) / FADE_DURATION_MS)
          : 1;

        const displayText = bubble.text.slice(0, bubble.displayedChars);
        const showCursor = bubble.phase === 'typing';

        return (
          <div
            key={bubble.id}
            className="absolute"
            style={{
              left: x,
              top: y - 12,
              transform: 'translate(-50%, -100%)',
              opacity,
              transition: bubble.phase === 'fading' ? `opacity ${FADE_DURATION_MS}ms ease-out` : undefined,
            }}
          >
            <div className="relative bg-slate-800/95 border border-slate-500/40 rounded-lg px-2.5 py-1.5 max-w-[220px] shadow-lg shadow-black/30">
              {/* Speaker name */}
              <div className="text-[10px] font-mono text-sky-400 leading-tight mb-0.5 truncate font-bold">
                {bubble.speakerName}
              </div>
              {/* Typed text */}
              <div className="text-[12px] font-mono text-white/90 leading-snug break-words">
                {displayText}
                {showCursor && <span className="animate-pulse text-sky-400">|</span>}
              </div>
              {/* Arrow */}
              <div
                className="absolute left-1/2 -bottom-1 w-2 h-2 bg-slate-800/95 border-r border-b border-slate-500/40"
                style={{ transform: 'translate(-50%) rotate(45deg)' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default DialogueBubbles;
