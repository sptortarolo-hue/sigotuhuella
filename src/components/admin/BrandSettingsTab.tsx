import React, { useState, useEffect } from 'react';
import { Loader2, Save, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { getBrandSettings, saveBrandSettings, BrandSettings } from '@/src/lib/newsService';
import { api } from '@/src/lib/api';

const DEFAULT_SETTINGS: BrandSettings = {
  primaryColor: '#5A5A40',
  secondaryColor: '#D48C70',
  logo: null,
  defaultHashtags: '#AdoptaNoCompres #SigoTuHuella #MascotasPerdidas',
  signature: 'Sigo tu Huella',
  ctaText: 'Conocé más en',
  enabled: true,
  platforms: ['instagram', 'facebook_page', 'whatsapp', 'status'],
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook_page: 'Facebook Page + Grupos',
  whatsapp: 'WhatsApp',
  status: 'Estado WhatsApp',
};

export default function BrandSettingsTab() {
  const [settings, setSettings] = useState<BrandSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getBrandSettings();
      setSettings({ ...DEFAULT_SETTINGS, ...data });
      setPreviewUrl(`/api/news/brand-preview?t=${Date.now()}`);
    } catch (e) {
      console.error('Error loading brand settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const payload = { ...settings };
      if (settings.logo && settings.logo.startsWith('data:')) {
        payload.logo = settings.logo.split(',')[1];
      }
      await saveBrandSettings(payload);
      setMessage('Configuración guardada');
      setPreviewKey(k => k + 1);
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      setMessage('Error: ' + (e.message || 'desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const togglePlatform = (platform: string) => {
    setSettings(prev => {
      const platforms = prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform];
      return { ...prev, platforms };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Preview */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-hidden">
        <div className="flex items-center gap-2 px-6 pt-6 pb-3">
          <Eye className="w-5 h-5 text-brand-primary" />
          <h3 className="text-lg font-serif font-bold text-brand-primary">Preview del overlay</h3>
        </div>
        <div className="px-6 pb-6">
          <img
            key={previewKey}
            src={previewUrl}
            alt="Preview"
            className="w-full max-w-lg rounded-xl border border-brand-accent"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      </div>

      {/* Brand Settings */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h3 className="text-lg font-serif font-bold text-brand-primary mb-6">Colores y Logo</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Color Primario</label>
            <div className="flex items-center gap-3">
              <input type="color" value={settings.primaryColor}
                onChange={e => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="w-12 h-12 rounded-xl border border-brand-accent cursor-pointer" />
              <input type="text" value={settings.primaryColor}
                onChange={e => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="flex-1 px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Color Secundario</label>
            <div className="flex items-center gap-3">
              <input type="color" value={settings.secondaryColor}
                onChange={e => setSettings(prev => ({ ...prev, secondaryColor: e.target.value }))}
                className="w-12 h-12 rounded-xl border border-brand-accent cursor-pointer" />
              <input type="text" value={settings.secondaryColor}
                onChange={e => setSettings(prev => ({ ...prev, secondaryColor: e.target.value }))}
                className="flex-1 px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent text-sm font-mono" />
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="mb-8">
          <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Logo</label>
          <input type="file" accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                setSettings(prev => ({ ...prev, logo: result }));
              };
              reader.readAsDataURL(file);
            }}
            className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" />
          {settings.logo && (
            <div className="mt-3">
              <img src={settings.logo.startsWith('data:') ? settings.logo : `data:image/png;base64,${settings.logo}`}
                alt="Logo" className="w-20 h-20 object-contain rounded-xl border border-brand-accent bg-gray-50" />
            </div>
          )}
        </div>

        {/* Texts */}
        <div className="grid grid-cols-1 gap-6 mb-8">
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Firma</label>
            <input type="text" value={settings.signature}
              onChange={e => setSettings(prev => ({ ...prev, signature: e.target.value }))}
              className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Hashtags</label>
            <input type="text" value={settings.defaultHashtags}
              onChange={e => setSettings(prev => ({ ...prev, defaultHashtags: e.target.value }))}
              className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent font-mono text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Texto CTA</label>
            <input type="text" value={settings.ctaText}
              onChange={e => setSettings(prev => ({ ...prev, ctaText: e.target.value }))}
              className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" />
          </div>
        </div>
      </div>

      {/* Auto-publish Settings */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h3 className="text-lg font-serif font-bold text-brand-primary mb-6">Publicación Automática</h3>

        <div className="flex items-center gap-3 mb-6">
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={settings.enabled}
              onChange={e => setSettings(prev => ({ ...prev, enabled: e.target.checked }))}
              className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-brand-primary peer-focus:ring-2 peer-focus:ring-brand-accent transition-colors"></div>
            <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
          </label>
          <span className="text-sm font-bold text-gray-700">Publicar novedades automáticamente</span>
        </div>

        {settings.enabled && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">Plataformas</p>
            {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={settings.platforms.includes(key)}
                  onChange={() => togglePlatform(key)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary" />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-2xl text-sm font-bold ${message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {message}
        </div>
      )}

      <button onClick={handleSave} disabled={saving}
        className="w-full sm:w-auto px-8 py-4 bg-brand-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all disabled:opacity-50">
        {saving ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
        Guardar
      </button>
    </div>
  );
}
