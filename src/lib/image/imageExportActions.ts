import { loadImageElement } from '../../engine/imageUtils';
import type { ImageObject } from '../../engine/types';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

function sanitizeFilename(name: string, fallback: string): string {
  const trimmed = name.replace(INVALID_FILENAME_CHARS, '_').trim();
  return trimmed || fallback;
}

function extensionFromDataUrl(src: string): string {
  const match = /^data:image\/([\w+.-]+);/i.exec(src);
  if (!match) return 'jpg';
  const subtype = match[1].toLowerCase();
  if (subtype === 'jpeg') return 'jpg';
  if (subtype === 'svg+xml') return 'svg';
  return subtype.replace('+xml', '');
}

async function imageSrcToPngBlob(src: string): Promise<Blob> {
  const img = await loadImageElement(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas unavailable');
  }
  ctx.drawImage(img, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG 인코딩에 실패했습니다.'))),
      'image/png',
    );
  });
}

async function copyPngBlobViaExecCommand(blob: Blob): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handler = (e: ClipboardEvent) => {
      e.preventDefault();
      if (!e.clipboardData) {
        reject(new Error('clipboardData unavailable'));
        return;
      }
      e.clipboardData.items.add(new File([blob], 'image.png', { type: 'image/png' }));
      resolve();
    };

    document.addEventListener('copy', handler, { once: true });
    try {
      if (!document.execCommand('copy')) {
        document.removeEventListener('copy', handler);
        reject(new Error('execCommand failed'));
      }
    } catch (err) {
      document.removeEventListener('copy', handler);
      reject(err);
    }
  });
}

export async function copyImageToClipboard(image: ImageObject): Promise<void> {
  const pngBlob = await imageSrcToPngBlob(image.src);

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob,
        }),
      ]);
      return;
    } catch {
      /* Windows/Electron may reject non-PNG or direct blob writes — try fallback */
    }
  }

  await copyPngBlobViaExecCommand(pngBlob);
}

export function saveImageToFile(image: ImageObject, filenameBase?: string): void {
  const ext = extensionFromDataUrl(image.src);
  const base = sanitizeFilename(filenameBase?.trim() || 'whiteboard-image', 'whiteboard-image');
  const link = document.createElement('a');
  link.href = image.src;
  link.download = `${base}.${ext}`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
