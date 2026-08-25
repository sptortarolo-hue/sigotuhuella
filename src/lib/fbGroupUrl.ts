const FB_HOSTS = new Set([
  'facebook.com',
  'fb.com',
  'fb.me',
  'fb.watch',
  'm.facebook.com',
  'mobile.facebook.com',
  'web.facebook.com',
  'mbasic.facebook.com',
]);

export interface FbGroupUrlInfo {
  groupId: string;
  normalizedUrl: string;
  isNumeric: boolean;
}

export function parseFbGroupUrl(raw: string): FbGroupUrlInfo | null {
  if (!raw || !raw.trim()) return null;
  let candidate = raw.trim();
  if (!/^https?:\/\//i.test(candidate)) candidate = 'https://' + candidate;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!FB_HOSTS.has(host)) return null;

  const match = url.pathname.match(/^\/groups\/([^/?#]+)/i);
  if (!match) return null;

  let groupId: string;
  try {
    groupId = decodeURIComponent(match[1]).trim();
  } catch {
    groupId = match[1].trim();
  }
  if (!groupId) return null;

  return {
    groupId,
    normalizedUrl: `https://www.facebook.com/groups/${groupId}/`,
    isNumeric: /^\d+$/.test(groupId),
  };
}

export function prettifyFbGroupName(value: string): string {
  return value
    .replace(/[._\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
