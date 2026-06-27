import type { AwarenessUser } from './awareness-types.ts';

const PARTICIPANT_COLORS = [
  '#E53935',
  '#FB8C00',
  '#FDD835',
  '#43A047',
  '#1E88E5',
  '#3949AB',
  '#8E24AA',
  '#D81B60',
  '#00897B',
  '#F4511E',
] as const;

const SESSION_STORAGE_KEY = 'whiteboard4share-session-user-name';

export function getOrCreateLocalUserName(): string {
  if (typeof window === 'undefined') return '사용자001';

  const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (stored?.trim()) return stored.trim();

  const number = Math.floor(Math.random() * 999) + 1;
  const name = `사용자${String(number).padStart(3, '0')}`;
  sessionStorage.setItem(SESSION_STORAGE_KEY, name);
  return name;
}

export function saveLocalUserName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed || typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_STORAGE_KEY, trimmed);
}

export function getUserColor(clientId: number): string {
  return PARTICIPANT_COLORS[Math.abs(clientId) % PARTICIPANT_COLORS.length];
}

export function displayUserName(name: string): string {
  return name.trim() || '사용자';
}

export function getReadableTextColor(color: string): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return '#ffffff';

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1a1a2e' : '#ffffff';
}

export function buildLocalAwarenessUser(clientId: number, name?: string): AwarenessUser {
  return {
    name: displayUserName(name ?? getOrCreateLocalUserName()),
    color: getUserColor(clientId),
  };
}
