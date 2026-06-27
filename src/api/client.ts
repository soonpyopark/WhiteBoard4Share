let activeByDept: string | null = null;

export function setApiByDept(byDept: string | null): void {
  activeByDept = byDept;
}

export function getApiByDept(): string | null {
  return activeByDept;
}

function withByDept(url: string): string {
  if (!activeByDept) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}byDept=${encodeURIComponent(activeByDept)}`;
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  const res = await fetch(`/api${withByDept(url)}`, {
    credentials: 'include',
    ...restInit,
    headers: {
      'Content-Type': 'application/json',
      ...(initHeaders as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Request failed');
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
