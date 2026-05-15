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
