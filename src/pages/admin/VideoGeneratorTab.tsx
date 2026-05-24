import React, { useState, useEffect } from 'react';
import { Film, Download, Trash2, Loader2, RefreshCw } from 'lucide-react';
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
  video_data: string; // filename
  thumbnail_data: string;
}

export default function VideoGeneratorTab() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin';

  const [config, setConfig] = useState({
    style: 'emotive',
    duration: 60,
    music: 'emotional',
    includeVoice: true
  });
  const [generating, setGenerating] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const musicOptions = [
    { value: 'emotional', label: 'Emocional Piano' },
    { value: 'latin', label: 'Latino Uplifting' },
    { value: 'calm', label: 'Calma Guitar' },
    { value: 'energetic', label: 'Energético Dance' }
  ];

  const styleOptions = [
    { value: 'emotive', label: 'Emotivo' },
    { value: 'informative', label: 'Informativo' },
    { value: 'viral', label: 'Viral' }
  ];

  useEffect(() => {
    fetchVideos();
  }, []);

  async function fetchVideos() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/videos');
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

  async function generate() {
    if (!canManage || generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!res.ok) throw new Error('Failed to start generation');
      // Poll for result
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await fetchVideos();
        if (attempts >= 12) clearInterval(poll); // 1 min max poll
      }, 5000);
    } catch (e) {
      alert('Error generando video');
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  async function deleteVideo(id: string, filename: string) {
    if (!confirm('¿Eliminar este video?')) return;
    try {
      const res = await fetch(`/api/admin/videos/${id}`, { method: 'DELETE' });
      if (res.ok) setVideos(v => v.filter(vid => vid.id !== id));
    } catch (e) {
      alert('Error borrando video');
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
          <Film className="w-6 h-6" /> Configuración del Video
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
            <label className="block text-sm font-bold text-gray-600 mb-2">Duración</label>
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
            <label className="block text-sm font-bold text-gray-600 mb-2">Música de fondo</label>
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
              <Loader2 className="w-5 h-5 animate-spin" /> Generando video...
            </>
          ) : (
            <>
              <Film className="w-5 h-5" /> Generar Video Promocional
            </>
          )}
        </button>
        <p className="text-xs text-gray-400 mt-3 text-center">
          Descargará automáticamente cuando esté listo. Mientras tanto, ya aparece en la lista inferior.
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
            <p className="text-gray-500">No hay videos generados aún.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map(video => (
              <div key={video.id} className="rounded-2xl border border-brand-accent overflow-hidden bg-brand-bg">
                <div className="aspect-video bg-gray-200 relative">
                  <img 
                    src={`/api/admin/videos/thumb/${video.thumbnail_data}`}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.src = '/placeholder-video-thumb.jpg'; }}
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-brand-primary mb-1">{video.style}</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    {new Date(video.created_at).toLocaleDateString('es-AR')} · {video.duration}s
                  </p>
                  <div className="flex gap-2">
                    <a 
                      href={`/api/admin/videos/file/${video.video_data}`}
                      download
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl hover:bg-brand-primary/90"
                    >
                      <Download className="w-4 h-4" /> Descargar
                    </a>
                    <button 
                      onClick={() => deleteVideo(video.id, video.video_data)}
                      className="px-3 py-2 text-red-500 border border-red-200 rounded-xl hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
