import { api } from './api';

export interface NewsPublication {
  platform: string;
  status: 'pending' | 'published' | 'failed';
  platform_post_id: string | null;
  error_message: string | null;
  published_at: string | null;
  created_at: string;
}

export interface News {
  id: string;
  title: string;
  content: string;
  image_data: string | null;
  mime_type: string | null;
  video_url: string | null;
  source_url: string | null;
  type: 'manual' | 'reunited' | 'adopted';
  related_pet_id: string | null;
  created_by: string;
  author_name?: string;
  created_at: string;
  updated_at: string;
  publications?: NewsPublication[];
}

export const getNews = async (): Promise<News[]> => {
  const data = await api.news.list();
  return data.news || [];
};

export const getNewsItem = async (id: string): Promise<News> => {
  const data = await api.news.get(id);
  return data.news;
};

export const createNews = async (newsData: any): Promise<News> => {
  const data = await api.news.create(newsData);
  return data.news;
};

export const updateNews = async (id: string, newsData: any): Promise<void> => {
  await api.news.update(id, newsData);
};

export const deleteNews = async (id: string): Promise<void> => {
  await api.news.delete(id);
};

export const getNewsPublications = async (id: string): Promise<NewsPublication[]> => {
  const data = await api.news.publications(id);
  return data.publications || [];
};

export const publishNewsToPlatforms = async (id: string, platforms: string[]) => {
  return api.news.publish(id, platforms);
};

export function getNewsImageUrl(newsItem: News): string | null {
  return newsItem.image_data && newsItem.mime_type
    ? `data:${newsItem.mime_type};base64,${newsItem.image_data}`
    : null;
}

export function formatNewsDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export const PLATFORMS = [
  { key: 'instagram', label: 'Instagram Feed', icon: '📷' },
  { key: 'instagram_stories', label: 'Instagram Stories', icon: '📱' },
  { key: 'facebook_page', label: 'Facebook Página', icon: '📘' },
  { key: 'facebook_groups', label: 'Facebook Grupos', icon: '👥' },
  { key: 'whatsapp', label: 'WhatsApp Grupos', icon: '💬' },
  { key: 'whatsapp_channel', label: 'WhatsApp Canales', icon: '📢' },
  { key: 'status', label: 'WhatsApp Estado', icon: '📱' },
];

export function getPlatformLabel(key: string): string {
  return PLATFORMS.find(p => p.key === key)?.label || key;
}

export function getPlatformIcon(key: string): string {
  return PLATFORMS.find(p => p.key === key)?.icon || '📌';
}
