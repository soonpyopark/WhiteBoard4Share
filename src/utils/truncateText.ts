export const TITLE_MAX_CHARS = 10;
export const TITLE_ELLIPSIS = '...';
export const TITLE_SLOT_CHAR_COUNT = TITLE_MAX_CHARS + TITLE_ELLIPSIS.length;

export function truncateTitle(title: string, maxChars = TITLE_MAX_CHARS): {
  display: string;
  truncated: boolean;
} {
  const chars = [...title];
  if (chars.length <= maxChars) {
    return { display: title, truncated: false };
  }
  return { display: `${chars.slice(0, maxChars).join('')}${TITLE_ELLIPSIS}`, truncated: true };
}
