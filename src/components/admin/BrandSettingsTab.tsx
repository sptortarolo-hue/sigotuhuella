import React, { useState, useEffect } from 'react';
import { Loader2, Save, Palette, Eye } from 'lucide-react';
import { getBrandSettings, saveBrandSettings, BrandSettings } from '@/src/lib/newsService';
import { api } from '@/src/lib/api';

const DEFAULT_SETTINGS: BrandSettings = {
  primaryColor: '#7C3AED',
  secondaryColor: '#F59E0B',
  logo: null,
  defaultHashtags: '#SigoTuHuella',
  signature: 'Sigo tu Huella',
  ctaText: 'Conocé más en',
};

export default function BrandSettingsTab() {
  const [settings, setSettings] = useState<BrandSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getBrandSettings();
      setSettings(data);
      if (data.logo) setLogoPreview(`data:image/png;base64,${data.logo}`);
    } catch (e) {
      console.error('Error loading brand settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setLogoPreview(result);
      const base64 = result.split(',')[1];
      setSettings(prev => ({ ...prev, logo: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const payload = { ...settings };
      if (logoFile) {
        const reader = new FileReader();
        payload.logo = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(logoFile);
        });
      }
      await saveBrandSettings(payload);
      setLogoFile(null);
      setMessage('Configuración guardada');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      setMessage('Error: ' + (e.message || 'desconocido'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-2xl font-serif font-bold text-brand-primary mb-6">Identidad de Marca</h2>

        {/* Colors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Color Primario</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primaryColor}
                onChange={e => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="w-12 h-12 rounded-xl border border-brand-accent cursor-pointer"
              />
              <input
                type="text"
                value={settings.primaryColor}
                onChange={e => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="flex-1 px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Color Secundario</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.secondaryColor}
                onChange={e => setSettings(prev => ({ ...prev, secondaryColor: e.target.value }))}
                className="w-12 h-12 rounded-xl border border-brand-accent cursor-pointer"
              />
              <input
                type="text"
                value={settings.secondaryColor}
                onChange={e => setSettings(prev => ({ ...prev, secondaryColor: e.target.value }))}
                className="flex-1 px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent text-sm font-mono"
              />
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="mb-8">
          <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Logo</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent"
          />
          {logoPreview && (
            <div className="mt-3 flex items-center gap-4">
              <img src={logoPreview} alt="Logo preview" className="w-20 h-20 object-contain rounded-xl border border-brand-accent bg-gray-50" />
            </div>
          )}
        </div>

        {/* Texts */}
        <div className="grid grid-cols-1 gap-6 mb-8">
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Firma / Nombre de Marca</label>
            <input
              type="text"
              value={settings.signature}
              onChange={e => setSettings(prev => ({ ...prev, signature: e.target.value }))}
              className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Hashtags por Defecto</label>
            <input
              type="text"
              value={settings.defaultHashtags}
              onChange={e => setSettings(prev => ({ ...prev, defaultHashtags: e.target.value }))}
              className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Texto CTA</label>
            <input
              type="text"
              value={settings.ctaText}
              onChange={e => setSettings(prev => ({ ...prev, ctaText: e.target.value }))}
              className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent"
            />
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-2xl mb-4 text-sm font-bold ${message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {message}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto px-8 py-4 bg-brand-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
          Guardar
        </button>
      </div>

      {/* Preview */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-6">
          <Eye className="w-5 h-5 text-brand-primary" />
          <h3 className="text-xl font-serif font-bold text-brand-primary">Vista previa del overlay</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Así se verán las imágenes de novedades al publicarse en redes sociales.
        </p>
        <div className="bg-gray-100 rounded-2xl overflow-hidden border border-brand-accent">
          <div className="aspect-[1200/630] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
            <div className="text-center p-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ backgroundColor: settings.primaryColor }}>
                <Palette className="w-8 h-8 text-white" />
              </div>
              <p className="text-gray-400 font-medium">Overlay generado automáticamente</p>
              <p className="text-xs text-gray-400 mt-1">Logo + gradiente + badge + footer + URL</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
