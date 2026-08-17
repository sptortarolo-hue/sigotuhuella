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

function isChromeAndroid(): boolean {
  return /Android/i.test(navigator.userAgent) && /Chrome|CriOS/i.test(navigator.userAgent);
}

// Normaliza URLs de posts de FB al formato canónico que la app resuelve como
// app link nativo: facebook.com/{pageId}_{postId} → facebook.com/{pageId}/posts/{postId}
function canonicalFBUrl(url: string): string {
  const u = String(url || '');
  const m = u.match(/facebook\.com\/(\d+)_(\d+)/);
  if (m) return `https://www.facebook.com/${m[1]}/posts/${m[2]}`;
  return u;
}

// Equivalente web de "am start -a android.intent.action.VIEW -d <url> -p com.facebook.katana"
// (lo que usa fb-native-relay para abrir posts de página). El esquema intent:// de
// Chrome fuerza el intent ACTION_VIEW de la URL https canónica DENTRO del paquete de
// Facebook, que la resuelve como app link nativo. Si FB no está instalada, Chrome usa
// S.browser_fallback_url.
function buildFBChromeIntent(url: string): string | null {
  const u = canonicalFBUrl(url);
  if (!/facebook\.com\//.test(u)) return null;
  const hostPath = u.replace(/^https?:\/\//, '');
  const fallback = encodeURIComponent(u);
  return `intent://${hostPath}#Intent;scheme=https;action=android.intent.action.VIEW;package=com.facebook.katana;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${fallback};end`;
}

// Dispara un scheme/intent:// con un <a> real clickeado de forma síncrona dentro
// del handler del usuario. Chrome exige user gesture sobre un anchor para lanzar
// apps externas (window.location.href = intent:// lo bloquea) y category BROWSABLE
// para escapar del contenedor PWA standalone.
function launchIntent(uri: string): boolean {
  try {
    const a = document.createElement('a');
    a.href = uri;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    return false;
  }
}

// Deep links fb:// para casos que la URL https canónica no cubre (grupos, fotos,
// permalink.php). No se usan para posts de página: fb://post no los resuelve.
function fbDeepLinkFor(url: string): string | null {
  const u = String(url || '');
  // Post de grupo: /groups/{gid}/posts/{pid} → permalink del post en el grupo
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

// Navega a un scheme con un <a> real (user gesture); si el evento blur no se
// dispara en el timeout (app no instalada / no se abrió), cae a la URL https
// canónica en otra pestaña.
function navigateWithBlurFallback(scheme: string, httpsUrl: string, timeoutMs = 1800) {
  let blurred = false;
  const onBlur = () => { blurred = true; };
  window.addEventListener('blur', onBlur);
  launchIntent(scheme);
  setTimeout(() => {
    window.removeEventListener('blur', onBlur);
    if (!blurred) window.open(httpsUrl, '_blank');
  }, timeoutMs);
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

  if (!isMobileBrowser()) {
    window.open(url, '_blank');
    return;
  }

  const canonical = canonicalFBUrl(url);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isIOS && /facebook\.com/.test(canonical)) {
    const m = canonical.match(/facebook\.com\/([^/]+)\/posts\/(\d+)/);
    if (m) {
      navigateWithBlurFallback(`fb://profile/${m[1]}/posts?id=${m[2]}`, canonical);
      return;
    }
  }

  const chromeIntent = isChromeAndroid() ? buildFBChromeIntent(canonical) : null;
  if (chromeIntent) {
    navigateWithBlurFallback(chromeIntent, canonical);
    return;
  }

  const dl = fbDeepLinkFor(canonical);
  if (dl) {
    navigateWithBlurFallback(dl, canonical);
    return;
  }

  window.open(canonical, '_blank');
}

export function formatDateOnly(value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '';
  const s = typeof value === 'string' ? value : value.toISOString();
  const m = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d)).toLocaleDateString('es-AR', options);
}
