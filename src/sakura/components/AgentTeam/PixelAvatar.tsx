/**
 * CSS-based 8x8 pixel art avatars for agents.
 * Each role gets a distinct character with color scheme.
 * Status affects animation (idle=bounce, thinking=pulse, acting=shake, blocked=flash).
 */

interface PixelAvatarProps {
  role: string;
  gender?: string;
  status: string;
  size?: number;  // pixel size multiplier (default 4 = 32x32)
  color?: string; // override color
}

// 8x8 pixel grids for different role archetypes
// 0 = transparent, 1 = primary, 2 = secondary, 3 = skin, 4 = accent, 5 = dark
const AVATAR_GRIDS: Record<string, number[][]> = {
  // CEO - suit with crown/star
  executive: [
    [0,0,4,4,4,4,0,0],
    [0,0,3,3,3,3,0,0],
    [0,3,3,5,5,3,3,0],
    [0,3,3,3,3,3,3,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,2,2,1,1,0],
    [0,1,1,1,1,1,1,0],
    [0,0,1,0,0,1,0,0],
  ],
  // Manager - clipboard
  management: [
    [0,0,0,0,0,0,0,0],
    [0,0,3,3,3,3,0,0],
    [0,3,3,5,5,3,3,0],
    [0,3,3,3,3,3,3,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,4,4],
    [0,1,1,1,1,1,4,4],
    [0,0,1,0,0,1,0,0],
  ],
  // Specialist - headphones/gear
  specialist: [
    [0,0,0,0,0,0,0,0],
    [0,4,3,3,3,3,4,0],
    [0,4,3,5,5,3,4,0],
    [0,0,3,3,3,3,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,2,2,1,1,0],
    [0,1,1,1,1,1,1,0],
    [0,0,1,0,0,1,0,0],
  ],
  // Operations - hard hat
  operations: [
    [0,4,4,4,4,4,4,0],
    [4,4,3,3,3,3,4,4],
    [0,3,3,5,5,3,3,0],
    [0,3,3,3,3,3,3,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,0],
    [0,0,1,0,0,1,0,0],
  ],
  // Support - headset
  support: [
    [0,0,0,0,0,0,0,0],
    [0,4,3,3,3,3,0,0],
    [0,4,3,5,5,3,0,0],
    [0,0,3,3,3,3,4,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,2,2,1,1,0],
    [0,1,1,1,1,1,1,0],
    [0,0,1,0,0,1,0,0],
  ],
  // Facilities - broom/cap
  facilities: [
    [0,0,2,2,2,2,0,0],
    [0,2,3,3,3,3,2,0],
    [0,3,3,5,5,3,3,0],
    [0,3,3,3,3,3,3,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,0],
    [0,0,1,0,0,1,0,0],
  ],
};

// Color schemes by role tier
const COLOR_SCHEMES: Record<string, Record<number, string>> = {
  executive: {
    1: '#1a1a2e', 2: '#e2e2e2', 3: '#f5c6a0', 4: '#ffd700', 5: '#2d2d2d',
  },
  management: {
    1: '#1e3a5f', 2: '#4a90d9', 3: '#f5c6a0', 4: '#4a90d9', 5: '#2d2d2d',
  },
  specialist_marketing: {
    1: '#4a1942', 2: '#e91e8c', 3: '#f5c6a0', 4: '#ff69b4', 5: '#2d2d2d',
  },
  specialist_analytics: {
    1: '#2d1b69', 2: '#9b59b6', 3: '#f5c6a0', 4: '#a855f7', 5: '#2d2d2d',
  },
  specialist_sales: {
    1: '#1a3c34', 2: '#2ecc71', 3: '#f5c6a0', 4: '#10b981', 5: '#2d2d2d',
  },
  specialist: {
    1: '#1e3a5f', 2: '#3498db', 3: '#f5c6a0', 4: '#60a5fa', 5: '#2d2d2d',
  },
  operations: {
    1: '#1a3c34', 2: '#27ae60', 3: '#f5c6a0', 4: '#f59e0b', 5: '#2d2d2d',
  },
  support: {
    1: '#0e4a5c', 2: '#00bcd4', 3: '#f5c6a0', 4: '#22d3ee', 5: '#2d2d2d',
  },
  facilities: {
    1: '#3d3d3d', 2: '#7f8c8d', 3: '#f5c6a0', 4: '#95a5a6', 5: '#2d2d2d',
  },
};

function getColorScheme(role: string, tier: string): Record<number, string> {
  const roleLower = role.toLowerCase();
  if (roleLower.includes('marketing') || roleLower.includes('creative')) return COLOR_SCHEMES.specialist_marketing;
  if (roleLower.includes('analy') || roleLower.includes('data')) return COLOR_SCHEMES.specialist_analytics;
  if (roleLower.includes('sales')) return COLOR_SCHEMES.specialist_sales;
  return COLOR_SCHEMES[tier] || COLOR_SCHEMES.specialist;
}

function getGrid(tier: string): number[][] {
  return AVATAR_GRIDS[tier] || AVATAR_GRIDS.specialist;
}

function getStatusAnimation(status: string): string {
  switch (status) {
    case 'thinking': return 'animate-pulse';
    case 'acting': return 'animate-bounce';
    case 'blocked': return 'animate-ping';
    default: return '';
  }
}

function getStatusGlow(status: string): string {
  switch (status) {
    case 'thinking': return '0 0 12px rgba(251, 191, 36, 0.6)';
    case 'acting': return '0 0 12px rgba(34, 197, 94, 0.6)';
    case 'blocked': return '0 0 12px rgba(239, 68, 68, 0.6)';
    case 'idle': return '0 0 6px rgba(148, 163, 184, 0.3)';
    default: return 'none';
  }
}

export function PixelAvatar({ role, status, size = 4, color }: PixelAvatarProps) {
  const tier = role.toLowerCase().includes('ceo') || role.toLowerCase().includes('cfo') ? 'executive'
    : role.toLowerCase().includes('manager') || role.toLowerCase().includes('director') ? 'management'
    : role.toLowerCase().includes('clean') || role.toLowerCase().includes('janitor') || role.toLowerCase().includes('security') || role.toLowerCase().includes('maintenance') ? 'facilities'
    : role.toLowerCase().includes('warehouse') || role.toLowerCase().includes('shipping') || role.toLowerCase().includes('fulfillment') ? 'operations'
    : role.toLowerCase().includes('support') || role.toLowerCase().includes('recepti') || role.toLowerCase().includes('admin') ? 'support'
    : 'specialist';

  const grid = getGrid(tier);
  const colors = getColorScheme(role, tier);
  const pixelSize = size;
  const totalSize = 8 * pixelSize;
  const animation = getStatusAnimation(status);
  const glow = getStatusGlow(status);

  return (
    <div
      className={`relative inline-block ${animation}`}
      style={{
        width: totalSize,
        height: totalSize,
        boxShadow: glow,
        imageRendering: 'pixelated',
      }}
    >
      {grid.map((row, y) =>
        row.map((cell, x) => {
          if (cell === 0) return null;
          const cellColor = color || colors[cell] || '#333';
          return (
            <div
              key={`${x}-${y}`}
              style={{
                position: 'absolute',
                left: x * pixelSize,
                top: y * pixelSize,
                width: pixelSize,
                height: pixelSize,
                backgroundColor: cellColor,
              }}
            />
          );
        })
      )}
      {/* Status indicator dot */}
      <div
        className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full border border-black"
        style={{
          backgroundColor: status === 'idle' ? '#94a3b8'
            : status === 'thinking' ? '#fbbf24'
            : status === 'acting' ? '#22c55e'
            : status === 'blocked' ? '#ef4444'
            : '#64748b',
        }}
      />
    </div>
  );
}

export default PixelAvatar;
