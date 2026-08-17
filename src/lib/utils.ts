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
  const u = String(url || '');
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  // Post de página: /{pageId}/posts/{postId} o /{pageId}/post/{postId}
  const m = u.match(/facebook\.com\/([^/]+)\/(?:posts|post)\/(\d+)/);
  if (m) {
    if (isIOS) return `fb://profile/${m[1]}/posts?id=${m[2]}`;
    return `fb://post/${m[2]}`;
  }
  // Post de grupo: /groups/{gid}/posts/{pid}
  const mg = u.match(/facebook\.com\/groups\/(\d+)\/posts\/(\d+)/);
  if (mg) return `fb://group/${mg[1]}/permalink/${mg[2]}`;
  // permalink.php?story_fbid={postId}&id={pageId}
  const mper = u.match(/(?:story_fbid|story_id)=(\d+)/);
  if (mper) return `fb://post/${mper[1]}`;
  // Foto de página
  const mph = u.match(/facebook\.com\/([^/]+)\/photos\/(\d+)/);
  if (mph) return `fb://photo/${mph[2]}`;
  return null;
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
