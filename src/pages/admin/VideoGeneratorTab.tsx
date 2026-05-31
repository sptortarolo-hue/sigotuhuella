import React, { useState, useEffect, useRef } from 'react';
import { Film, Download, Trash2, Loader2, RefreshCw, Share2, Copy, AlertCircle, CheckCircle, Monitor, Smartphone, Square } from 'lucide-react';
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
}

interface Pet {
  id: string;
  name: string;
  species: string;
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

  const [config, setConfig] = useState({
    style: 'emotive',
    duration: 30,
    music: 'emotional',
    includeVoice: true,
    petId: '',
    customScript: '',
    overlayText: '',
    format: 'vertical',
  });
  const [generating, setGenerating] = useState(false);
  const [generatingElapsed, setGeneratingElapsed] = useState(0);
  const [videos, setVideos] = useState<Video[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pets, setPets] = useState<Pet[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

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
    fetchVideos();
    fetchPets();
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

  async function fetchVideos() {
    setRefreshing(true);
    try {
      const res = await authFetch('/api/admin/videos');
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos);
      }
    } catch (e) {
      console.error('Failed to fetch videos:', e);
    } finally {
      setRefreshing(false);
    }
  }

  async function fetchPets() {
    try {
      const res = await authFetch('/api/pets?status=reunited&limit=100');
      if (res.ok) {
        const data = await res.json();
        setPets(data.pets || data || []);
      }
    } catch (e) {
      console.error('Failed to fetch pets:', e);
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
          if (!stillGenerating || attempts >= 30) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setGenerating(false);
          }
        }
      } catch {}
      if (attempts >= 30) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setGenerating(false);
      }
    }, 6000);
  }

  async function generate() {
    if (!canManage || generating) return;
    setGenerateError(null);
    setGenerating(true);
    try {
      const body = {
        style: config.style,
        duration: config.duration,
        music: config.music,
        includeVoice: config.includeVoice,
        petId: config.petId || undefined,
        customScript: config.customScript?.trim() || undefined,
        overlayText: config.overlayText?.trim() || undefined,
        format: config.format,
      };
      const res = await authFetch('/api/admin/videos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-8 text-center">
        <Film className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <h3 className="text-xl font-bold text-gray-600 mb-2">Generador de Videos</h3>
        <p className="text-gray-500">Solo administradores pueden acceder.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <Film className="w-6 h-6" /> Configuracion del Video
        </h2>

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

          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">Duracion</label>
            <select
              value={config.duration}
              onChange={e => setConfig(c => ({ ...c, duration: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
            >
              <option value={30}>30 segundos</option>
              <option value={60}>60 segundos</option>
            </select>
          </div>

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
          </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">
              Mascota especifica <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <select
              value={config.petId}
              onChange={e => setConfig(c => ({ ...c, petId: e.target.value }))}
              className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
            >
              <option value="">Seleccionar mascota (fotos aleatorias)</option>
              {pets.map(pet => (
                <option key={pet.id} value={pet.id}>{pet.name || 'Sin nombre'} ({pet.species})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">
              Texto para voz en off <span className="text-gray-400 font-normal">(opcional, auto si se deja vacio)</span>
            </label>
            <textarea
              value={config.customScript}
              onChange={e => setConfig(c => ({ ...c, customScript: e.target.value }))}
              placeholder="Deja vacio para generar texto automatico segun el estilo"
              rows={3}
              className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm resize-y"
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-600 mb-2">
            Texto en pantalla <span className="text-gray-400 font-normal">(cada linea = un frame distinto, opcional)</span>
          </label>
          <textarea
            value={config.overlayText}
            onChange={e => setConfig(c => ({ ...c, overlayText: e.target.value }))}
            placeholder="Cada linea se mostrara en un frame distinto. Ejemplo:&#10;Una mascota mas volvio a casa&#10;Gracias a vos es posible&#10;Comparti Sigo Tu Huella"
            rows={4}
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
              <Film className="w-5 h-5" /> Generar Video Promocional
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
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      {new Date(video.created_at).toLocaleDateString('es-AR')} &middot; {video.duration}s
                      {video.created_by_name && <> &middot; {video.created_by_name}</>}
                    </p>
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
