export interface ShareLinkInfo {
  byDept: string;
  whiteboardId: string;
  title: string;
}

export async function fetchShareLinkInfo(token: string): Promise<ShareLinkInfo> {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? '공유 링크를 찾을 수 없습니다');
  }
  return res.json() as Promise<ShareLinkInfo>;
}
