export const PERSONALITY_TAG_EMOJIS: Record<string, string> = {
  juguetón: '🎾',
  tranquilo: '😌',
  cariñoso: '🥰',
  miedoso: '🙀',
  explorador: '🧭',
  dormilón: '😴',
  guardián: '🛡️',
  sociable: '🤝',
  independiente: '😼',
  travieso: '😈',
  leal: '💝',
  curioso: '🔍',
  mimoso: '🤗',
  atlético: '🏃',
  glotón: '🍗',
};

export function getTagEmoji(tag: string): string {
  return PERSONALITY_TAG_EMOJIS[tag] || '🐾';
}

export function formatTag(tag: string): string {
  return `${getTagEmoji(tag)} ${tag}`;
}

export const ALL_TAGS = Object.keys(PERSONALITY_TAG_EMOJIS);
