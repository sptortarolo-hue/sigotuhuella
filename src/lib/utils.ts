import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function buildFBPostUrl(pagePostId: string): string {
  if (!pagePostId) return '#';
  const parts = pagePostId.split('_');
  if (parts.length === 2) {
    return `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
  }
  return `https://www.facebook.com/${pagePostId}`;
}

function isMobileBrowser(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function buildFBAppDeepLink(url: string): string | null {
  const m = url.match(/facebook\.com\/(\d+)\/posts\/(\d+)/);
  if (!m) return null;
  const [, pageId, postId] = m;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIOS) return `fb://profile/${pageId}/posts?id=${postId}`;
  return `fb://facewebmodal/f?href=${encodeURIComponent(url)}`;
}

export async function openExternalLink(url: string) {
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const ExternalBrowser = registerPlugin<{ open: (opts: { url: string }) => Promise<void> }>('ExternalBrowser');
      await ExternalBrowser.open({ url });
      return;
    }
  } catch {}

  const fbDeepLink = isMobileBrowser() ? buildFBAppDeepLink(url) : null;
  if (fbDeepLink) {
    let blurred = false;
    const onBlur = () => { blurred = true; };
    window.addEventListener('blur', onBlur);
    window.location.href = fbDeepLink;
    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      if (!blurred) window.open(url, '_blank');
    }, 1800);
    return;
  }
  window.open(url, '_blank');
}

export function formatDateOnly(value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '';
  const s = typeof value === 'string' ? value : value.toISOString();
  const m = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d)).toLocaleDateString('es-AR', options);
}
