import { fetchTheme } from '../api/settings.ts';
import {
  ACCENT_COLOR_PRESETS,
  DEFAULT_ACCENT_COLOR,
  accentCssVariables,
  normalizeAccentColor,
} from '../../shared/theme.ts';

export { ACCENT_COLOR_PRESETS, DEFAULT_ACCENT_COLOR, normalizeAccentColor };

/**
 * Paints the accent palette onto `:root`.
 * @returns the accent that was applied
 */
export function applyAccentColor(accent: unknown): string {
  const color = normalizeAccentColor(accent);
  const root = document.documentElement;
  if (root.dataset.accentColor === color) return color;

  for (const [name, value] of Object.entries(accentCssVariables(color))) {
    root.style.setProperty(name, value);
  }
  root.dataset.accentColor = color;
  return color;
}

export function currentAccentColor(): string {
  return normalizeAccentColor(document.documentElement.dataset.accentColor);
}

/** Loads server-wide accent; failures fall back to the built-in default. */
export async function loadAndApplyAccentColor(): Promise<string> {
  try {
    const theme = await fetchTheme();
    return applyAccentColor(theme.accentColor ?? DEFAULT_ACCENT_COLOR);
  } catch {
    return applyAccentColor(DEFAULT_ACCENT_COLOR);
  }
}
