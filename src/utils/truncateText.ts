/** 편집 화면 제목 표시 — 한글 기준 최대 글자 수 */
export const EDITOR_TITLE_MAX_CHARS = 20;
export const TITLE_ELLIPSIS = '...';
export const EDITOR_TITLE_SLOT_CHAR_COUNT = EDITOR_TITLE_MAX_CHARS + TITLE_ELLIPSIS.length;

export const TITLE_MAX_CHARS = EDITOR_TITLE_MAX_CHARS;
export const TITLE_SLOT_CHAR_COUNT = EDITOR_TITLE_SLOT_CHAR_COUNT;

export function truncateTitle(title: string, maxChars = EDITOR_TITLE_MAX_CHARS): {
  display: string;
  truncated: boolean;
} {
  const chars = [...title];
  if (chars.length <= maxChars) {
    return { display: title, truncated: false };
  }
  return { display: `${chars.slice(0, maxChars).join('')}${TITLE_ELLIPSIS}`, truncated: true };
}
