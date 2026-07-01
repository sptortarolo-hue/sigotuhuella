import { api } from './api';

export interface News {
  id: string;
  title: string;
  content: string;
  image_data: string | null;
  mime_type: string | null;
  video_url: string | null;
  type: 'manual' | 'reunited' | 'adopted';
  related_pet_id: string | null;
  created_by: string;
  author_name?: string;
  created_at: string;
  updated_at: string;
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

export function getNewsImageUrl(newsItem: News): string | null {
  return newsItem.image_data && newsItem.mime_type
    ? `data:${newsItem.mime_type};base64,${newsItem.image_data}`
    : null;
}

export function formatNewsDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export interface NewsPublication {
  id: string;
  news_id: string;
  platform: 'instagram' | 'facebook_page' | 'facebook_groups' | 'whatsapp' | 'status';
  status: 'pending' | 'published' | 'failed';
  platform_post_id: string | null;
  error_message: string | null;
  created_at: string;
  published_at: string | null;
  updated_at: string;
}

export interface BrandSettings {
  primaryColor: string;
  secondaryColor: string;
  logo: string | null;
  defaultHashtags: string;
  signature: string;
  ctaText: string;
}

export const publishNews = async (id: string) => {
  return api.news.publish(id);
};

export const getNewsPublications = async (id: string): Promise<NewsPublication[]> => {
  const data = await api.news.publications(id);
  return data.publications || [];
};

export const getBrandSettings = async (): Promise<BrandSettings> => {
  const data = await api.news.getBrandSettings();
  return data.settings;
};

export const saveBrandSettings = async (settings: BrandSettings): Promise<void> => {
  await api.news.saveBrandSettings(settings);
};

export const getNewsPublishImageUrl = (id: string): string => {
  return api.news.getPublishImageUrl(id);
};
