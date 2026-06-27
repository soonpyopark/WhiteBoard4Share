import type {
  SaveWhiteboardPayload,
  WhiteboardDocument,
  WhiteboardSummary,
} from '../types/whiteboard';
import { apiRequest } from './client.ts';

export function fetchWhiteboards(): Promise<WhiteboardSummary[]> {
  return apiRequest<WhiteboardSummary[]>('/whiteboards');
}

export function createWhiteboard(): Promise<WhiteboardDocument> {
  return apiRequest<WhiteboardDocument>('/whiteboards', { method: 'POST' });
}

export function fetchWhiteboard(id: string, shareToken?: string): Promise<WhiteboardDocument> {
  const headers: Record<string, string> = {};
  if (shareToken) headers['X-Share-Token'] = shareToken;
  return apiRequest<WhiteboardDocument>(`/whiteboards/${id}`, { headers });
}

export function saveWhiteboard(
  id: string,
  payload: SaveWhiteboardPayload,
  shareToken?: string,
): Promise<WhiteboardDocument> {
  const headers: Record<string, string> = {};
  if (shareToken) headers['X-Share-Token'] = shareToken;
  return apiRequest<WhiteboardDocument>(`/whiteboards/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
}

export function renameWhiteboard(
  id: string,
  title: string,
): Promise<WhiteboardDocument> {
  return apiRequest<WhiteboardDocument>(`/whiteboards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export function copyWhiteboard(id: string): Promise<WhiteboardDocument> {
  return apiRequest<WhiteboardDocument>(`/whiteboards/${id}/copy`, { method: 'POST' });
}

export function deleteWhiteboard(id: string): Promise<void> {
  return apiRequest<void>(`/whiteboards/${id}`, { method: 'DELETE' });
}

export function reorderWhiteboards(ids: string[]): Promise<WhiteboardSummary[]> {
  return apiRequest<WhiteboardSummary[]>('/whiteboards/order', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  });
}

export function createShareLink(id: string): Promise<{ shareToken: string }> {
  return apiRequest<{ shareToken: string }>(`/whiteboards/${id}/share-link`, {
    method: 'POST',
  });
}

export function revokeShareLink(id: string): Promise<void> {
  return apiRequest<void>(`/whiteboards/${id}/share-link`, {
    method: 'DELETE',
  });
}

export function updateShareVisibility(
  id: string,
  visibility: { isPrivate: boolean; isViewRestricted: boolean },
): Promise<WhiteboardSummary> {
  return apiRequest<WhiteboardSummary>(`/whiteboards/${id}/visibility`, {
    method: 'PATCH',
    body: JSON.stringify(visibility),
  });
}

export function formatEditedDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '');
  const time = d.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `편집됨: ${date}. ${time}`;
}
