/**
 * Accent theme shared by settings UI and runtime CSS variables.
 * Presets match NAS4USB 설정 → 일반 → 테마 색상.
 */

/** Matches NAS4USB default accent. */
export const DEFAULT_ACCENT_COLOR = '#3b82f6';

/** Preset swatches offered in 설정 → 일반 → 테마 색상. */
export const ACCENT_COLOR_PRESETS = [
  '#3b82f6',
  '#2563eb',
  '#1d4ed8',
  '#0ea5e9',
  '#06b6d4',
  '#0d9488',
  '#059669',
  '#16a34a',
  '#65a30d',
  '#ca8a04',
  '#f59e0b',
  '#ea580c',
  '#dc2626',
  '#e11d48',
  '#db2777',
  '#c026d3',
  '#9333ea',
  '#7c3aed',
  '#4f46e5',
  '#475569',
  '#57534e',
  '#795548',
] as const;

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function normalizeAccentColor(
  value: unknown,
  fallback: string = DEFAULT_ACCENT_COLOR,
): string {
  const text = String(value ?? '').trim();
  return HEX_PATTERN.test(text) ? text.toLowerCase() : fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function toHexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function mix(hex: string, other: string, weight: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  return `#${[
    toHexByte(a.r * weight + b.r * (1 - weight)),
    toHexByte(a.g * weight + b.g * (1 - weight)),
    toHexByte(a.b * weight + b.b * (1 - weight)),
  ].join('')}`;
}

/** Derived hex palette for Whiteboard4Share CSS variables. */
export function accentCssVariables(accent: unknown): Record<string, string> {
  const base = normalizeAccentColor(accent);
  return {
    '--wb-accent': base,
    '--wb-accent-hover': mix(base, '#000000', 0.82),
    '--wb-accent-soft': mix(base, '#ffffff', 0.1),
  };
}
