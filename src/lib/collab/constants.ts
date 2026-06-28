export const YJS_WS_PATH = import.meta.env.VITE_YJS_WS_PATH?.trim() || '/yjs';

export function getYjsWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return `ws://localhost${YJS_WS_PATH}`;
  }
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}${YJS_WS_PATH}`;
}

export const YJS_PATHS_KEY = 'paths';
export const YJS_IMAGES_KEY = 'images';
export const YJS_TEXTS_KEY = 'texts';
export const YJS_TABLES_KEY = 'tables';
export const YJS_GALLERY_DELETED_KEY = 'gallery-deleted';
export const YJS_GALLERY_CREATED_KEY = 'gallery-created';
export const YJS_GALLERY_VISIBILITY_KEY = 'gallery-visibility';
