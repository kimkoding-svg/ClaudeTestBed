/**
 * Personality Style Engine
 *
 * Takes a PersonProfile and computes a unique visual style:
 * color palette, font, layout, section backgrounds, animations.
 */

import type { PersonProfile } from '../services/coupleApi';

// ─── Types ──────────────────────────────────────────────

export interface PanelStyle {
  bgGradient: string;
  bgColor: string;
  accentColor: string;
  accentMuted: string;
  textPrimary: string;
  textSecondary: string;
  fontFamily: string;
  borderRadius: string;
  borderStyle: string;
  sectionBg: {
    traits: string;
    mood: string;
    interests: string;
    trigger: string;
    condition: string;
    quirk: string;
  };
  animClass: string;
  traitBarColor: (value: number) => string;
}

// ─── Color Helpers ──────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function mixHex(c1: string, c2: string, ratio: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return rgbToHex(
    r1 * ratio + r2 * (1 - ratio),
    g1 * ratio + g2 * (1 - ratio),
    b1 * ratio + b2 * (1 - ratio),
  );
}

// ─── Main Compute Function ──────────────────────────────

export function computePanelStyle(profile: PersonProfile): PanelStyle {
  const t = profile.traits;
  const condition = profile.condition?.name || null;
  const style = profile.textingStyle;

  // Composite personality scores
  const warmth = (t.friendliness + t.empathy) / 2;
  const coldness = (t.sarcasm + (100 - t.empathy)) / 2;
  const boldness = (t.confidence + t.assertiveness) / 2;
  const chaos = (t.pettiness + (100 - t.emotionalStability)) / 2;

  // ─── COLOR PALETTE ──────────────────────────────
  // Condition overrides first, then trait-based

  let bgColor: string;
  let bgGradient: string;
  let accentColor: string;

  if (condition === 'NPD') {
    bgColor = '#1a1510';
    bgGradient = 'linear-gradient(135deg, #1a1510 0%, #2a1f0a 50%, #1a1510 100%)';
    accentColor = '#d4a017';
  } else if (condition === 'Psychopath') {
    bgColor = '#141820';
    bgGradient = 'linear-gradient(135deg, #141820 0%, #1a1e2e 50%, #0f1318 100%)';
    accentColor = '#6b7b8d';
  } else if (condition === 'Anxiety') {
    bgColor = '#1a1a1e';
    bgGradient = 'linear-gradient(135deg, #1a1a1e 0%, #1e1a20 50%, #18181c 100%)';
    accentColor = '#8a7b9e';
  } else if (condition === 'BPD') {
    bgColor = '#1a1020';
    bgGradient = 'linear-gradient(135deg, #1a1020 0%, #201525 50%, #150d1a 100%)';
    accentColor = '#c44dff';
  } else if (condition === 'Bipolar') {
    bgColor = '#151a20';
    bgGradient = 'linear-gradient(180deg, #1a2030 0%, #201510 100%)';
    accentColor = '#e89020';
  } else if (condition === 'ADHD') {
    bgColor = '#151520';
    bgGradient = 'linear-gradient(135deg, #15152a 0%, #1a2025 50%, #201520 100%)';
    accentColor = '#4fc3f7';
  } else if (condition === 'Autism') {
    bgColor = '#141a1a';
    bgGradient = 'linear-gradient(135deg, #141a1a 0%, #1a2020 50%, #101818 100%)';
    accentColor = '#26a69a';
  } else if (chaos > 65) {
    bgColor = '#1a1525';
    bgGradient = 'linear-gradient(135deg, #1a0f2e 0%, #2e1a1a 33%, #0f2e1a 66%, #1a1a2e 100%)';
    accentColor = '#ff6b9d';
  } else if (boldness > 65) {
    bgColor = '#1f1015';
    bgGradient = 'linear-gradient(135deg, #1f1015 0%, #251510 50%, #1a0d12 100%)';
    accentColor = '#dc3545';
  } else if (warmth > 65) {
    bgColor = '#1a1815';
    bgGradient = 'linear-gradient(135deg, #1a1815 0%, #201a15 50%, #181610 100%)';
    accentColor = '#e8914f';
  } else if (coldness > 65) {
    bgColor = '#121520';
    bgGradient = 'linear-gradient(135deg, #121520 0%, #151825 50%, #10131e 100%)';
    accentColor = '#5b7ea8';
  } else {
    bgColor = '#1a1a2e';
    bgGradient = 'linear-gradient(135deg, #1a1a2e 0%, #1e1e35 50%, #16162a 100%)';
    accentColor = '#7c6fa0';
  }

  const accentMuted = accentColor + '30';

  // ─── FONT FAMILY ────────────────────────────────

  const fontMap: Record<string, string> = {
    proper:   "'Playfair Display', Georgia, serif",
    casual:   "'Nunito', system-ui, sans-serif",
    dramatic: "'Bebas Neue', Impact, sans-serif",
    dry:      "'JetBrains Mono', 'Courier New', monospace",
    chaotic:  "'Caveat', 'Comic Sans MS', cursive",
  };
  const fontFamily = fontMap[style] || fontMap['casual'];

  // ─── LAYOUT ─────────────────────────────────────

  let borderRadius: string;
  let borderStyle: string;

  if (t.assertiveness > 70) {
    borderRadius = '0px';
    borderStyle = `2px solid ${accentColor}`;
  } else if (t.friendliness > 70) {
    borderRadius = '16px';
    borderStyle = `1px solid ${accentColor}40`;
  } else if (chaos > 65) {
    borderRadius = '4px 16px 4px 16px';
    borderStyle = `2px dashed ${accentColor}80`;
  } else {
    borderRadius = '8px';
    borderStyle = `1px solid ${accentColor}50`;
  }

  // ─── ANIMATION ──────────────────────────────────
  // No panel-level animation — change indicators are shown inline on individual values
  const animClass = '';

  // ─── SECTION BACKGROUNDS ────────────────────────
  // CSS patterns generated from personality

  const satMod = profile.mood > 50 ? 1.0 : profile.mood > 30 ? 0.7 : 0.4;
  const alpha = (base: number) => Math.round(base * satMod).toString(16).padStart(2, '0');

  const sectionBg = {
    // Traits: diagonal stripes (intensity from assertiveness)
    traits: t.assertiveness > 50
      ? `repeating-linear-gradient(45deg, transparent, transparent 10px, ${accentColor}${alpha(12)} 10px, ${accentColor}${alpha(12)} 11px)`
      : 'none',

    // Mood: radial glow
    mood: `radial-gradient(ellipse at center, ${accentColor}${alpha(18)} 0%, transparent 70%)`,

    // Interests: dot pattern
    interests: `radial-gradient(circle, ${accentColor}15 1px, transparent 1px)`,

    // Trigger: warning stripes
    trigger: `repeating-linear-gradient(-45deg, transparent, transparent 8px, #f59e0b10 8px, #f59e0b10 9px)`,

    // Condition: geometric
    condition: profile.condition
      ? `linear-gradient(135deg, ${accentColor}10 25%, transparent 25%, transparent 75%, ${accentColor}10 75%)`
      : 'none',

    // Quirk: subtle wave
    quirk: `linear-gradient(90deg, transparent 0%, ${accentColor}08 50%, transparent 100%)`,
  };

  // ─── TRAIT BAR COLORING ─────────────────────────
  // Tinted toward accent color

  const traitBarColor = (value: number): string => {
    if (value >= 70) return accentColor;
    if (value >= 45) return mixHex(accentColor, '#eab308', 0.5);
    if (value >= 25) return mixHex(accentColor, '#f97316', 0.3);
    return '#ef4444';
  };

  return {
    bgGradient,
    bgColor,
    accentColor,
    accentMuted,
    textPrimary: '#e5e5e5',
    textSecondary: '#9ca3af',
    fontFamily,
    borderRadius,
    borderStyle,
    sectionBg,
    animClass,
    traitBarColor,
  };
}
