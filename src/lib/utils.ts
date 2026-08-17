import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
