import React, { useState, useEffect, useRef } from 'react';
import { Film, Download, Trash2, Loader2, RefreshCw, Share2, Copy, AlertCircle, CheckCircle, Monitor, Smartphone, Square, Sparkles, Image, Search, Check, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAuth } from '@/src/hooks/useAuth';

interface Video {
  id: string;
  title: string;
  style: string;
  duration: number;
  music_track: string;
  voice_enabled: boolean;
  created_at: string;
  video_data: string;
  thumbnail_data: string;
  format: string;
  status: string;
  error_msg: string | null;
  created_by_name: string | null;
  story_interval_minutes: number | null;
  last_story_posted_at: string | null;
}

interface AvailablePet {
  id: string;
  name: string | null;
  species: string;
  status: string;
  breed: string | null;
  description: string | null;
  cover_image: string | null;
}

interface AvailableNews {
  id: string;
  title: string;
  type: string;
  image_data: string | null;
  mime_type: string | null;
  content?: string;
}

interface SceneItem {
  source: 'pet' | 'news';
  petId?: string;
  newsId?: string;
  overlayText: string;
  previewImage: string | null;
  label: string;
}

interface AIContent {
  voiceScript: string;
  overlayTexts: string[];
  imagePrompts: string[];
}

const FORMAT_OPTIONS = [
  { value: 'vertical', label: 'Vertical 9:16', icon: Smartphone, desc: 'Stories / Reels / TikTok' },
  { value: 'square', label: 'Cuadrado 1:1', icon: Square, desc: 'Feed Instagram / Facebook' },
  { value: 'landscape', label: 'Horizontal 16:9', icon: Monitor, desc: 'YouTube / WhatsApp' },
];

const STYLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  emotive: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  informative: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  viral: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
};

const STYLE_LABELS: Record<string, string> = {
  emotive: 'Emotivo',
  informative: 'Informativo',
  viral: 'Viral',
};

const PET_STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'reunited', label: 'Reencontrados' },
  { value: 'lost', label: 'Perdidos' },
  { value: 'adopted', label: 'Adoptados' },
  { value: 'for_adoption', label: 'En adopción' },
  { value: 'sighted', label: 'Avistados' },
  { value: 'retained', label: 'Retenidos' },
  { value: 'accidented', label: 'Accidentados' },
  { value: 'needs_attention', label: 'Necesitan atención' },
];

const NEWS_TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'reunited', label: 'Reencontrados' },
  { value: 'adopted', label: 'Adoptados' },
  { value: 'manual', label: 'Manual' },
];

export default function VideoGeneratorTab() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin';
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  function getAuthToken() {
    try { return localStorage.getItem('token'); } catch { return null; }
  }

  async function authFetch(url: string, options: RequestInit = {}) {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
  }

  const [mode, setMode] = useState<'real' | 'ai'>('real');
  const [config, setConfig] = useState({
    style: 'emotive',
    duration: 30,
    music: 'emotional',
    includeVoice: true,
    format: 'vertical',
    voices: ['elena'] as string[],
    frame: 'none',
    stickers: true,
    confetti: false,
  });

  const [petFilter, setPetFilter] = useState('');
  const [newsFilter, setNewsFilter] = useState('');
  const [availablePets, setAvailablePets] = useState<AvailablePet[]>([]);
  const [availableNews, setAvailableNews] = useState<AvailableNews[]>([]);
  const [selectedScenes, setSelectedScenes] = useState<SceneItem[]>([]);
  const [voiceScript, setVoiceScript] = useState('');
  const [topic, setTopic] = useState('');

  const [aiContent, setAiContent] = useState<AIContent | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generatingElapsed, setGeneratingElapsed] = useState(0);
  const [videos, setVideos] = useState<Video[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [storyPublishingId, setStoryPublishingId] = useState<string | null>(null);
  const [storySuccessId, setStorySuccessId] = useState<string | null>(null);

  const musicOptions = [
    { value: 'emotional', label: 'Emocional Piano' },
    { value: 'latin', label: 'Latino Uplifting' },
    { value: 'calm', label: 'Calma Guitar' },
    { value: 'energetic', label: 'Energético Dance' },
  ];

  const styleOptions = [
    { value: 'emotive', label: 'Emotivo' },
    { value: 'informative', label: 'Informativo' },
    { value: 'viral', label: 'Viral' },
  ];

  useEffect(() => {
    (async () => {
      const vids = await fetchVideos();
      if (vids?.some(v => v.status === 'generating')) {
        setGenerating(true);
        startPolling();
      }
    })();
    fetchAvailableContent();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (!generating) return;
    pollStartRef.current = Date.now();
    setGeneratingElapsed(0);
    const timer = setInterval(() => {
      setGeneratingElapsed(Math.floor((Date.now() - pollStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [generating]);

  useEffect(() => {
    fetchAvailableContent();
  }, [petFilter, newsFilter]);

  async function fetchVideos(): Promise<Video[] | null> {
    setRefreshing(true);
    try {
      const res = await authFetch('/api/admin/videos');
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos);
        return data.videos;
      }
    } catch (e) {
      console.error('Failed to fetch videos:', e);
    } finally {
      setRefreshing(false);
    }
    return null;
  }

  async function fetchAvailableContent() {
    setLoadingContent(true);
    try {
      const petQuery = petFilter ? `&status=${petFilter}` : '';
      const petRes = await authFetch(`/api/admin/videos/available-pets?limit=50${petQuery}`);
      if (petRes.ok) {
        const data = await petRes.json();
        setAvailablePets(data.pets || []);
      }

      const newsQuery = newsFilter ? `&type=${newsFilter}` : '';
      const newsRes = await authFetch(`/api/admin/videos/available-news?limit=50${newsQuery}`);
      if (newsRes.ok) {
        const data = await newsRes.json();
        setAvailableNews(data.news || []);
      }
    } catch (e) {
      console.error('Failed to fetch content:', e);
    } finally {
      setLoadingContent(false);
    }
  }

  function togglePet(pet: AvailablePet) {
    setSelectedScenes(prev => {
      const exists = prev.find(s => s.source === 'pet' && s.petId === pet.id);
      if (exists) return prev.filter(s => s !== exists);
      const parts = [pet.name, pet.species, pet.breed, pet.status, pet.description].filter(Boolean);
      const petText = parts.join(' - ');
      if (petText) {
        setVoiceScript(v => v || petText);
      }
      return [...prev, {
        source: 'pet' as const,
        petId: pet.id,
        overlayText: '',
        previewImage: pet.cover_image ? `data:image/jpeg;base64,${pet.cover_image}` : null,
        label: pet.name || `${pet.species} (${pet.status})`,
      }];
    });
  }

  function toggleNews(news: AvailableNews) {
    setSelectedScenes(prev => {
      const exists = prev.find(s => s.source === 'news' && s.newsId === news.id);
      if (exists) return prev.filter(s => s !== exists);
      const newsText = [news.title, news.content].filter(Boolean).join('\n');
      if (newsText) {
        setVoiceScript(v => v || newsText);
      }
      return [...prev, {
        source: 'news' as const,
        newsId: news.id,
        overlayText: '',
        previewImage: news.image_data ? `data:${news.mime_type || 'image/jpeg'};base64,${news.image_data}` : null,
        label: news.title,
      }];
    });
  }

  function updateSceneOverlay(index: number, text: string) {
    setSelectedScenes(prev => prev.map((s, i) => i === index ? { ...s, overlayText: text } : s));
  }

  function removeScene(index: number) {
    setSelectedScenes(prev => prev.filter((_, i) => i !== index));
  }

  async function generateAIContent(sceneDescriptions?: string[]) {
    setAiLoading(true);
    setAiContent(null);
    setGenerateError(null);
    try {
      const body: any = {
        topic: topic || undefined,
        style: config.style,
        numScenes: sceneDescriptions ? sceneDescriptions.length : Math.max(3, Math.min(8, Math.floor(config.duration / 5))),
      };
      if (sceneDescriptions && sceneDescriptions.length > 0) {
        body.sceneDescriptions = sceneDescriptions;
      }
      const res = await authFetch('/api/admin/videos/generate-ai-content', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(data.error || `Error ${res.status}`);
      }
      const content = await res.json();
      setAiContent(content);
      if (content.voiceScript) setVoiceScript(content.voiceScript);
      if (sceneDescriptions && content.overlayTexts) {
        setSelectedScenes(prev => prev.map((s, i) => ({
          ...s,
          overlayText: content.overlayTexts[i] || s.overlayText,
        })));
      }
    } catch (e: any) {
      setGenerateError(e.message || 'Error generando contenido con IA');
    } finally {
      setAiLoading(false);
    }
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await authFetch('/api/admin/videos');
        if (res.ok) {
          const data = await res.json();
          setVideos(data.videos);
          const stillGenerating = data.videos?.some((v: Video) => v.status === 'generating');
          if (!stillGenerating) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setGenerating(false);
          }
        }
      } catch {}
      if (attempts >= 60) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setGenerating(false);
      }
    }, 10000);
  }

  async function generate() {
    if (!canManage || generating) return;
    setGenerateError(null);

    if (mode === 'real' && selectedScenes.length === 0) {
      setGenerateError('Seleccioná al menos una foto o noticia para el video.');
      return;
    }

    setGenerating(true);
    try {
    const body: any = {
      style: config.style,
      duration: config.duration,
      music: config.music,
      includeVoice: config.includeVoice,
      format: config.format,
      voice: config.voices.length === 1 ? config.voices[0] : 'both',
      voices: config.voices,
      frame: config.frame,
      stickers: config.stickers,
      confetti: config.confetti,
      mode,
    };

      if (mode === 'ai') {
        body.topic = topic || undefined;
        body.voiceScript = voiceScript || undefined;
        body.scenes = (aiContent?.imagePrompts || []).map((_, i) => ({
          type: 'photo',
          overlayText: aiContent?.overlayTexts?.[i] || '',
        }));
      } else {
        body.scenes = selectedScenes.map(s => ({
          source: s.source,
          petId: s.petId,
          newsId: s.newsId,
          overlayText: s.overlayText,
        }));
        body.voiceScript = voiceScript || undefined;
      }

      const res = await authFetch('/api/admin/videos/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(data.error || `Error ${res.status}`);
      }
      startPolling();
    } catch (e: any) {
      setGenerateError(e.message || 'Error generando video');
      setGenerating(false);
    }
  }

  async function publishStory(video: Video) {
    setStoryPublishingId(video.id);
    setStorySuccessId(null);
    try {
      const res = await authFetch('/api/instagram/publish-story', {
        method: 'POST',
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al publicar story');
      }
      setStorySuccessId(video.id);
      setTimeout(() => setStorySuccessId(null), 3000);
    } catch (e: any) {
      alert(e.message || 'Error al publicar story');
    } finally {
      setStoryPublishingId(null);
    }
  }

  async function updateStoryInterval(videoId: string, intervalMinutes: number | null) {
    try {
      await authFetch(`/api/instagram/videos/${videoId}/story-config`, {
        method: 'PUT',
        body: JSON.stringify({ intervalMinutes }),
      });
      setVideos(prev => prev.map(v =>
        v.id === videoId ? { ...v, story_interval_minutes: intervalMinutes } : v
      ));
    } catch {
      alert('Error al actualizar configuración de story');
    }
  }

  async function deleteVideo(id: string) {
    if (!confirm('Eliminar este video?')) return;
    try {
      const res = await authFetch(`/api/admin/videos/${id}`, { method: 'DELETE' });
      if (res.ok) setVideos(v => v.filter(vid => vid.id !== id));
    } catch (e) {
      alert('Error borrando video');
    }
  }

  async function shareVideo(video: Video) {
    const url = `${window.location.origin}/generated/videos/${video.video_data}`;
    if (navigator.share) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], `${video.title}.mp4`, { type: 'video/mp4' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: video.title });
          return;
        }
        await navigator.share({ title: video.title, url });
        return;
      } catch {}
    }
    await copyLink(video);
  }

  async function copyLink(video: Video) {
    const url = `${window.location.origin}/generated/videos/${video.video_data}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(video.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert('No se pudo copiar el link');
    }
  }

  if (!canManage) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 text-center">
        <Film className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <h3 className="text-xl font-bold text-gray-600 mb-2">Generador de Videos</h3>
        <p className="text-gray-500">Solo administradores pueden acceder.</p>
      </div>
    );
  }

  const isPetSelected = (petId: string) => selectedScenes.some(s => s.source === 'pet' && s.petId === petId);
  const isNewsSelected = (newsId: string) => selectedScenes.some(s => s.source === 'news' && s.newsId === newsId);

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <Film className="w-6 h-6" /> Generador de Reel
        </h2>

        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-600 mb-3">Modo</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setMode('real')}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left",
                mode === 'real'
                  ? "border-brand-primary bg-brand-primary/5"
                  : "border-brand-accent bg-brand-bg hover:border-brand-primary/40"
              )}
            >
              <Image className={cn("w-5 h-5 shrink-0", mode === 'real' ? "text-brand-primary" : "text-gray-400")} />
              <div>
                <div className={cn("text-sm font-bold", mode === 'real' ? "text-brand-primary" : "text-gray-700")}>Contenido Real</div>
                <div className="text-xs text-gray-400">Fotos de mascotas y noticias</div>
              </div>
            </button>
            <button
              onClick={() => setMode('ai')}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left",
                mode === 'ai'
                  ? "border-brand-secondary bg-brand-secondary/5"
                  : "border-brand-accent bg-brand-bg hover:border-brand-secondary/40"
              )}
            >
              <Sparkles className={cn("w-5 h-5 shrink-0", mode === 'ai' ? "text-brand-secondary" : "text-gray-400")} />
              <div>
                <div className={cn("text-sm font-bold", mode === 'ai' ? "text-brand-secondary" : "text-gray-700")}>Generado con IA</div>
                <div className="text-xs text-gray-400">Gemini guion + imagenes IA</div>
              </div>
            </button>
          </div>
        </div>

        {mode === 'ai' && (
          <div className="mb-6 p-4 bg-brand-secondary/5 rounded-2xl border border-brand-secondary/20">
            <label className="block text-sm font-bold text-gray-600 mb-2">
              Tema del video <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Ej: Mascotas perdidas que vuelven a casa"
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-secondary transition-colors text-sm"
            />
            <button
              onClick={generateAIContent}
              disabled={aiLoading}
              className={cn(
                "mt-3 w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
                aiLoading
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-brand-secondary text-white hover:shadow-lg"
              )}
            >
              {aiLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generando contenido...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Generar guion e imagenes con IA</>
              )}
            </button>

            {aiContent && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Guion de voz</label>
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{aiContent.voiceScript}</p>
                </div>
                {aiContent.overlayTexts.length > 0 && (
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Textos en pantalla</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {aiContent.overlayTexts.map((t, i) => (
                        <span key={i} className="text-xs bg-white border border-brand-accent px-3 py-1 rounded-full text-gray-700">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
      {aiContent.imagePrompts.length > 0 ? (
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Prompts de imagen ({aiContent.imagePrompts.length} escenas)</label>
          <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
            {aiContent.imagePrompts.map((p, i) => (
              <p key={i} className="text-xs text-gray-500 truncate">{i + 1}. {p}</p>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-xs text-brand-secondary bg-brand-secondary/5 px-3 py-2 rounded-lg">
          Se usaran fotos de mascotas de la web como fondo del video
        </div>
      )}
              </div>
            )}
          </div>
        )}

        {mode === 'real' && (
          <div className="mb-6 space-y-4">
            <div className="p-4 bg-brand-primary/3 rounded-2xl border border-brand-accent">
              <label className="block text-sm font-bold text-gray-600 mb-2">
                Tema del video <span className="text-gray-400 font-normal">(para guion IA, opcional)</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Ej: Mascotas perdidas que vuelven a casa"
                className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-brand-primary/3 rounded-2xl border border-brand-accent">
                <div className="flex items-center gap-2 mb-3">
                  <Image className="w-4 h-4 text-brand-primary" />
                  <h4 className="text-sm font-bold text-brand-primary">Mascotas</h4>
                </div>
                <select
                  value={petFilter}
                  onChange={e => setPetFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-brand-accent outline-none focus:border-brand-primary text-xs mb-3"
                >
                  {PET_STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {loadingContent ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-primary" /></div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {availablePets.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">No hay mascotas</p>
                    )}
                    {availablePets.map(pet => (
                      <button
                        key={pet.id}
                        onClick={() => togglePet(pet)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all text-xs",
                          isPetSelected(pet.id)
                            ? "bg-brand-primary/10 border border-brand-primary/30"
                            : "bg-white border border-brand-accent hover:border-brand-primary/30"
                        )}
                      >
                        {pet.cover_image ? (
                          <img src={`data:image/jpeg;base64,${pet.cover_image}`} className="w-8 h-8 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-brand-accent flex items-center justify-center shrink-0">
                            <Image className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <span className={cn("flex-1 truncate", isPetSelected(pet.id) ? "font-bold text-brand-primary" : "text-gray-700")}>
                          {pet.name || 'Sin nombre'} <span className="text-gray-400">({pet.species})</span>
                        </span>
                        {isPetSelected(pet.id) && <Check className="w-4 h-4 text-brand-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 bg-brand-secondary/3 rounded-2xl border border-brand-accent">
                <div className="flex items-center gap-2 mb-3">
                  <Film className="w-4 h-4 text-brand-secondary" />
                  <h4 className="text-sm font-bold text-brand-secondary">Noticias</h4>
                </div>
                <select
                  value={newsFilter}
                  onChange={e => setNewsFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-brand-accent outline-none focus:border-brand-secondary text-xs mb-3"
                >
                  {NEWS_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {loadingContent ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-secondary" /></div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {availableNews.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">No hay noticias</p>
                    )}
                    {availableNews.map(news => (
                      <button
                        key={news.id}
                        onClick={() => toggleNews(news)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all text-xs",
                          isNewsSelected(news.id)
                            ? "bg-brand-secondary/10 border border-brand-secondary/30"
                            : "bg-white border border-brand-accent hover:border-brand-secondary/30"
                        )}
                      >
                        {news.image_data ? (
                          <img src={`data:${news.mime_type || 'image/jpeg'};base64,${news.image_data}`} className="w-8 h-8 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-brand-accent flex items-center justify-center shrink-0">
                            <Film className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <span className={cn("flex-1 truncate", isNewsSelected(news.id) ? "font-bold text-brand-secondary" : "text-gray-700")}>
                          {news.title}
                        </span>
                        {isNewsSelected(news.id) && <Check className="w-4 h-4 text-brand-secondary shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

          {selectedScenes.length > 0 && (
          <div className="p-4 bg-white rounded-2xl border border-brand-accent">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-gray-700">
                Escenas seleccionadas ({selectedScenes.length})
              </h4>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const descriptions = selectedScenes.map(s => s.label);
                    generateAIContent(descriptions);
                  }}
                  disabled={aiLoading || selectedScenes.length === 0}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    aiLoading
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/20 hover:bg-brand-secondary/20"
                  )}
                >
                  {aiLoading ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generando...</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> Generar guion IA</>
                  )}
                </button>
                <button
                  onClick={() => setSelectedScenes([])}
                  className="text-xs text-red-500 hover:text-red-700 font-bold"
                >
                  Limpiar todo
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {selectedScenes.map((scene, i) => (
                <div key={i} className="flex items-center gap-3 p-2 bg-brand-bg rounded-xl">
                  <span className="text-xs font-bold text-gray-400 w-5 text-center shrink-0">{i + 1}</span>
                  {scene.previewImage ? (
                    <img src={scene.previewImage} className="w-10 h-10 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-brand-accent flex items-center justify-center shrink-0">
                      <Image className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <span className="text-xs text-gray-700 flex-1 truncate">{scene.label}</span>
                  <input
                    type="text"
                    value={scene.overlayText}
                    onChange={e => updateSceneOverlay(i, e.target.value)}
                    placeholder="Texto overlay"
                    className="flex-1 min-w-0 px-2 py-1 bg-white rounded-lg border border-brand-accent outline-none focus:border-brand-primary text-xs"
                  />
                  <button
                    onClick={() => removeScene(i)}
                    className="shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">Estilo</label>
            <select
              value={config.style}
              onChange={e => setConfig(c => ({ ...c, style: e.target.value }))}
              className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
            >
              {styleOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

      {!config.includeVoice && (
        <div>
          <label className="block text-sm font-bold text-gray-600 mb-2">Duracion (segundos)</label>
          <input
            type="number"
            min={10}
            max={120}
            value={config.duration}
            onChange={e => setConfig(c => ({ ...c, duration: parseInt(e.target.value) || 30 }))}
            className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-bold text-gray-600 mb-2">Musica de fondo</label>
        <select
          value={config.music}
          onChange={e => setConfig(c => ({ ...c, music: e.target.value }))}
          className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
        >
          {musicOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3 pt-6">
        <input
          type="checkbox"
          id="voiceEnabled"
          checked={config.includeVoice}
          onChange={e => setConfig(c => ({ ...c, includeVoice: e.target.checked }))}
          className="w-5 h-5 rounded accent-brand-primary"
        />
        <label htmlFor="voiceEnabled" className="font-bold text-gray-700">Incluir voz (TTS)</label>
        {!config.includeVoice && <span className="text-xs text-gray-400 ml-1">— duracion manual</span>}
      </div>

{config.includeVoice && (
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">Voz{config.voices.length > 1 ? 'es (alternan)' : ''}</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'elena', label: 'Elena', desc: 'Femenina AR' },
                { value: 'tomas', label: 'Tomas', desc: 'Masculina AR' },
                { value: 'mateo', label: 'Mateo', desc: 'Masculina UY' },
              ].map(opt => {
                const checked = config.voices.includes(opt.value);
                return (
                <button
                  key={opt.value}
                  onClick={() => setConfig(c => {
                    const next = c.voices.includes(opt.value)
                      ? c.voices.filter(v => v !== opt.value)
                      : [...c.voices, opt.value];
                    return { ...c, voices: next.length === 0 ? [opt.value] : next };
                  })}
                  className={cn(
                    "px-3 py-2 rounded-xl border-2 transition-all text-center",
                    checked
                      ? "border-brand-primary bg-brand-primary/5"
                      : "border-brand-accent bg-brand-bg hover:border-brand-primary/40"
                  )}
                >
                  <div className={cn("text-sm font-bold", checked ? "text-brand-primary" : "text-gray-700")}>{opt.label}</div>
                  <div className="text-xs text-gray-400">{opt.desc}</div>
                </button>
              );})}
            </div>
          </div>
        )}
    </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-600 mb-3">Formato</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {FORMAT_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = config.format === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setConfig(c => ({ ...c, format: opt.value }))}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left",
                    active
                      ? "border-brand-primary bg-brand-primary/5"
                      : "border-brand-accent bg-brand-bg hover:border-brand-primary/40"
                  )}
                >
                  <Icon className={cn("w-5 h-5 shrink-0", active ? "text-brand-primary" : "text-gray-400")} />
                  <div>
                    <div className={cn("text-sm font-bold", active ? "text-brand-primary" : "text-gray-700")}>{opt.label}</div>
                    <div className="text-xs text-gray-400">{opt.desc}</div>
                  </div>
                </button>
              );
})}
        </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-600 mb-3">Efectos visuales</label>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Marco</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: 'none', label: 'Sin marco', desc: '' },
                  { value: 'classic', label: 'Clasico', desc: 'Bordes + esquinas' },
                  { value: 'polaroid', label: 'Polaroid', desc: 'Fondo crema' },
                  { value: 'filmstrip', label: 'Filmstrip', desc: 'Rollo de pelicula' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setConfig(c => ({ ...c, frame: opt.value }))}
                    className={cn(
                      "px-3 py-2 rounded-xl border-2 transition-all text-center",
                      config.frame === opt.value
                        ? "border-brand-primary bg-brand-primary/5"
                        : "border-brand-accent bg-brand-bg hover:border-brand-primary/40"
                    )}
                  >
                    <div className={cn("text-sm font-bold", config.frame === opt.value ? "text-brand-primary" : "text-gray-700")}>{opt.label}</div>
                    {opt.desc && <div className="text-xs text-gray-400">{opt.desc}</div>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setConfig(c => ({ ...c, stickers: !c.stickers }))}
                className={cn(
                  "flex-1 px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold text-left",
                  config.stickers
                    ? "border-brand-primary bg-brand-primary/5 text-brand-primary"
                    : "border-brand-accent bg-brand-bg text-gray-700 hover:border-brand-primary/40"
                )}
              >
                {config.stickers ? '🐾 Stickers ON' : '🐾 Stickers OFF'}
              </button>
              <button
                onClick={() => setConfig(c => ({ ...c, confetti: !c.confetti }))}
                className={cn(
                  "flex-1 px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold text-left",
                  config.confetti
                    ? "border-brand-primary bg-brand-primary/5 text-brand-primary"
                    : "border-brand-accent bg-brand-bg text-gray-700 hover:border-brand-primary/40"
                )}
              >
                {config.confetti ? '🎉 Confetti ON' : '🎉 Confetti OFF'}
              </button>
            </div>
            {config.stickers && (
              <div className="text-xs text-gray-400 bg-brand-bg rounded-lg p-2">
                {config.style === 'emotive' && 'Huellas + corazon con pata (fade-in suave)'}
                {config.style === 'informative' && 'Huella olive discreta'}
                {config.style === 'viral' && 'Estrella + huella + corazon (aparicion rapida)'}
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-600 mb-2">
            Texto para voz en off <span className="text-gray-400 font-normal">(opcional, auto si se deja vacio)</span>
          </label>
          <textarea
            value={voiceScript}
            onChange={e => setVoiceScript(e.target.value)}
            placeholder="Deja vacio para generar texto automatico segun el estilo. En modo IA se genera con Gemini."
            rows={3}
            className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm resize-y"
          />
        </div>

        {generateError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {generateError}
          </div>
        )}

        <button
          onClick={generate}
          disabled={generating}
          className={cn(
            "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-white transition-all",
            generating
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-brand-primary to-brand-secondary hover:shadow-xl"
          )}
        >
          {generating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generando video... {generatingElapsed > 0 && `${generatingElapsed}s`}
            </>
          ) : (
            <>
              <Film className="w-5 h-5" /> Generar {mode === 'ai' ? 'Reel con IA' : 'Reel Promocional'}
            </>
          )}
        </button>
        <p className="text-xs text-gray-400 mt-3 text-center">
          La generacion toma unos segundos. Cuando termine, aparece en la lista de abajo.
        </p>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
            <Film className="w-6 h-6" /> Videos Generados
          </h2>
          <button
            onClick={fetchVideos}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-brand-primary border border-brand-accent rounded-xl hover:bg-brand-primary/5 transition-colors disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </button>
        </div>

        {videos.length === 0 ? (
          <div className="text-center py-16">
            <Film className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No hay videos generados aun.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map(video => {
              const styleColor = STYLE_COLORS[video.style] || STYLE_COLORS.emotive;
              const isGenerating = video.status === 'generating';
              const isFailed = video.status === 'failed';
              const isReady = video.status === 'ready';

              return (
                <div key={video.id} className="rounded-2xl border border-brand-accent overflow-hidden bg-brand-bg">
                  <div className={cn(
                    "relative",
                    video.format === 'vertical' ? 'aspect-[9/16]' : video.format === 'square' ? 'aspect-square' : 'aspect-video',
                    "bg-gray-200"
                  )}>
                    {isGenerating ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-bg">
                        <Loader2 className="w-8 h-8 animate-spin text-brand-primary mb-2" />
                        <p className="text-sm text-gray-500">Generando...</p>
                      </div>
                    ) : isFailed ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50">
                        <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                        <p className="text-sm text-red-500 px-4 text-center">{video.error_msg || 'Error desconocido'}</p>
                      </div>
                    ) : isReady && video.video_data ? (
                      <video
                        src={`/generated/videos/${video.video_data}`}
                        poster={video.thumbnail_data ? `/generated/videos/${video.thumbnail_data}` : undefined}
                        controls
                        preload="metadata"
                        className="w-full h-full object-contain bg-black"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                        <Film className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", styleColor.bg, styleColor.text, styleColor.border, "border")}>
                        {STYLE_LABELS[video.style] || video.style}
                      </span>
                      <span className="text-xs text-gray-400">
                        {video.format === 'vertical' ? '9:16' : video.format === 'square' ? '1:1' : '16:9'}
                      </span>
                      {video.title?.includes('IA') && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/20">IA</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      {new Date(video.created_at).toLocaleDateString('es-AR')} &middot; {video.duration}s
                      {video.created_by_name && <> &middot; {video.created_by_name}</>}
                    </p>
                    {isReady && video.video_data && (
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          onClick={() => publishStory(video)}
                          disabled={storyPublishingId === video.id}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-colors",
                            storySuccessId === video.id
                              ? "bg-green-100 text-green-700 border border-green-300"
                              : "bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/30 hover:bg-brand-secondary/20"
                          )}
                        >
                          {storyPublishingId === video.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : storySuccessId === video.id ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : (
                            <Film className="w-3.5 h-3.5" />
                          )}
                          {storySuccessId === video.id ? 'Publicado!' : 'Subir a Stories'}
                        </button>
                        <select
                          value={video.story_interval_minutes ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            updateStoryInterval(video.id, val ? parseInt(val) : null);
                          }}
                          className="text-[10px] border border-brand-accent rounded-lg px-2 py-1 bg-white text-gray-600"
                        >
                          <option value="">No auto</option>
                          <option value="30">30 min</option>
                          <option value="60">1 hora</option>
                          <option value="180">3 horas</option>
                          <option value="360">6 horas</option>
                          <option value="720">12 horas</option>
                          <option value="1440">24 horas</option>
                        </select>
                        {video.last_story_posted_at && (
                          <span className="text-[10px] text-gray-400 ml-auto">
                            Última story: {new Date(video.last_story_posted_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      {isReady && video.video_data && (
                        <>
                          <a
                            href={`/generated/videos/${video.video_data}`}
                            download
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl hover:bg-brand-primary/90"
                          >
                            <Download className="w-4 h-4" /> Descargar
                          </a>
                          <button
                            onClick={() => shareVideo(video)}
                            className="px-3 py-2 text-brand-primary border border-brand-accent rounded-xl hover:bg-brand-primary/5"
                            title="Compartir"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => copyLink(video)}
                            className="px-3 py-2 text-brand-primary border border-brand-accent rounded-xl hover:bg-brand-primary/5"
                            title="Copiar link"
                          >
                            {copiedId === video.id ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => deleteVideo(video.id)}
                        className="px-3 py-2 text-red-500 border border-red-200 rounded-xl hover:bg-red-50 ml-auto"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
