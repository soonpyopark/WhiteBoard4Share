export function buildShareLinkUrl(token: string): string {
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  return `${base}#share/${encodeURIComponent(token)}`;
}

export function parseShareTokenFromHash(hash: string): string | null {
  const match = hash.match(/^#share\/([^/?#]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
