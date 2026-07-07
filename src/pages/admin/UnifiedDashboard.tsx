import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';
import ChannelStatusCard from '@/src/components/admin/ChannelStatusCard';
import LastPostPreview from '@/src/components/admin/LastPostPreview';
import {
  Loader2, Save, RefreshCw, Globe, MessageSquare, Camera,
  Smartphone, Clock, Check, Zap, Users, Radio, Sparkles,
} from 'lucide-react';

type ConfigTab = 'scraping' | 'matching' | 'publisher' | 'instagram' | 'whatsapp' | 'relay_wa' | 'relay_fb' | 'broadcasts' | 'news';

interface DashboardData {
  channels: Record<string, { enabled: boolean; status: string; lastRun: string | null; detail: string }>;
  lastPost: { instagram: any; facebook: any; whatsapp: any };
  adoptionBroadcast: { wa_enabled: boolean; wa_hours: string; fb_enabled: boolean; fb_hours: string };
  settings: Record<string, string>;
}

const configTabs: { id: ConfigTab; label: string; icon: React.ReactNode }[] = [
  { id: 'scraping', label: 'Scraping', icon: <Globe className="w-4 h-4" /> },
  { id: 'matching', label: 'Matching', icon: <Zap className="w-4 h-4" /> },
  { id: 'publisher', label: 'Publisher FB', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'instagram', label: 'Instagram', icon: <Camera className="w-4 h-4" /> },
  { id: 'whatsapp', label: 'WhatsApp Biz', icon: <Smartphone className="w-4 h-4" /> },
  { id: 'relay_wa', label: 'Relay WA', icon: <Radio className="w-4 h-4" /> },
  { id: 'relay_fb', label: 'Relay FB', icon: <Users className="w-4 h-4" /> },
  { id: 'broadcasts', label: 'Broadcasts', icon: <RefreshCw className="w-4 h-4" /> },
  { id: 'news', label: 'Novedades', icon: <Sparkles className="w-4 h-4" /> },
];

function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-brand-bg rounded-2xl">
      <input type="checkbox" id={id} checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-5 h-5 rounded accent-brand-primary" />
      <label htmlFor={id} className="font-bold text-brand-primary text-sm">{label}</label>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-bold text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function ScrapingConfig({ settings, onChange }: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-4">
      <Toggle checked={settings.fb_scraping_enabled === 'true'} onChange={v => onChange('fb_scraping_enabled', String(v))} label="Activar scraping automático" id="d_fb_scraping_enabled" />
      <Field label="Token del scraper" hint="Debe coincidir con el token en el script del VPS.">
        <input type="text" value={settings.fb_scraper_token || ''} onChange={e => onChange('fb_scraper_token', e.target.value)}
          className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm font-mono" />
      </Field>
      <div className="bg-brand-bg rounded-2xl p-4 space-y-3">
        <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Clock className="w-4 h-4" /> Horarios (Apify)</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio banda">
            <select value={settings.fb_scraper_hour_1 || '8'} onChange={e => onChange('fb_scraper_hour_1', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary">
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>)}
            </select>
          </Field>
          <Field label="Fin banda">
            <select value={settings.fb_scraper_hour_2 || '22'} onChange={e => onChange('fb_scraper_hour_2', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary">
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>)}
            </select>
          </Field>
          <Field label="Intervalo (horas)">
            <input type="number" value={settings.fb_scraper_interval_hours || '3'} onChange={e => onChange('fb_scraper_interval_hours', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary" min="1" max="24" />
          </Field>
          <Field label="Jitter (min)">
            <input type="number" value={settings.fb_scraper_jitter_minutes || '15'} onChange={e => onChange('fb_scraper_jitter_minutes', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary" min="0" max="120" />
          </Field>
          <Field label="Máx posts/ciclo">
            <input type="number" value={settings.fb_scraper_max_posts || '50'} onChange={e => onChange('fb_scraper_max_posts', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary" min="1" max="200" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function MatchingConfig({ settings, onChange }: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-4">
      <Toggle checked={settings.fb_matching_enabled === 'true'} onChange={v => onChange('fb_matching_enabled', String(v))} label="Activar matching automático" id="d_fb_matching_enabled" />
      <Toggle checked={settings.fb_image_matching_enabled === 'true'} onChange={v => onChange('fb_image_matching_enabled', String(v))} label="Matching por imagen (AI/vision)" id="d_fb_image_matching_enabled" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Score mínimo (%)">
          <input type="number" value={settings.fb_matching_min_score || '50'} onChange={e => onChange('fb_matching_min_score', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary" min="0" max="100" />
        </Field>
        <Field label="Peso imagen (%)">
          <input type="number" value={settings.fb_image_matching_weight || '20'} onChange={e => onChange('fb_image_matching_weight', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary" min="0" max="100" />
        </Field>
      </div>
    </div>
  );
}

function PublisherConfig({ settings, onChange }: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-4">
      <Field label="ID de la Page de Facebook" hint="El ID numérico de la Page vinculada a Instagram.">
        <input type="text" value={settings.facebook_page_id || ''} onChange={e => onChange('facebook_page_id', e.target.value)}
          className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm font-mono" placeholder="ej: 123456789012345" />
      </Field>
      <Toggle checked={settings.facebook_page_publisher_enabled === 'true'} onChange={v => onChange('facebook_page_publisher_enabled', String(v))} label="Activar replicación Instagram → Facebook" id="d_fb_publisher_enabled" />
      <Field label="Intervalo (minutos)" hint="Cada cuántos minutos revisa posts nuevos de Instagram.">
        <input type="number" value={settings.facebook_publisher_interval || '30'} onChange={e => onChange('facebook_publisher_interval', e.target.value)}
          className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" min="5" max="1440" />
      </Field>
    </div>
  );
}

function InstagramConfig({ settings, onChange }: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-4">
      <Toggle checked={settings.instagram_publisher_enabled === 'true'} onChange={v => onChange('instagram_publisher_enabled', String(v))} label="Activar publicación automática a Instagram" id="d_ig_publisher" />
      <Toggle checked={settings.instagram_stories_enabled === 'true'} onChange={v => onChange('instagram_stories_enabled', String(v))} label="Publicar Stories automáticas (perdidos/adoptados/reunidos)" id="d_ig_stories" />
      <Toggle checked={settings.instagram_auto_reply_enabled === 'true'} onChange={v => onChange('instagram_auto_reply_enabled', String(v))} label="Auto-reply a comentarios de Instagram" id="d_ig_auto_reply" />
      <Field label="Hashtags por defecto" hint="Se agregan al final de cada caption.">
        <textarea value={settings.instagram_default_hashtags || ''} onChange={e => onChange('instagram_default_hashtags', e.target.value)} rows={3}
          className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" />
      </Field>
    </div>
  );
}

function WhatsAppConfig({ settings, onChange }: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-4">
      <Toggle checked={settings.whatsapp_enabled === 'true'} onChange={v => onChange('whatsapp_enabled', String(v))} label="Activar WhatsApp Business API" id="d_wa_enabled" />
      <Toggle checked={settings.whatsapp_broadcast_enabled === 'true'} onChange={v => onChange('whatsapp_broadcast_enabled', String(v))} label="Broadcast automático de reportes" id="d_wa_broadcast" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Phone Number ID">
          <input type="text" value={settings.whatsapp_phone_number_id || ''} onChange={e => onChange('whatsapp_phone_number_id', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary font-mono" />
        </Field>
        <Field label="Business Phone">
          <input type="text" value={settings.whatsapp_business_phone || ''} onChange={e => onChange('whatsapp_business_phone', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary font-mono" />
        </Field>
        <Field label="Access Token" hint="Token permanente de WhatsApp Cloud API.">
          <input type="password" value={settings.whatsapp_access_token || ''} onChange={e => onChange('whatsapp_access_token', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary font-mono" />
        </Field>
        <Field label="Verify Token">
          <input type="text" value={settings.whatsapp_verify_token || ''} onChange={e => onChange('whatsapp_verify_token', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary font-mono" />
        </Field>
      </div>
      <Field label="WABA ID">
        <input type="text" value={settings.whatsapp_waba_id || ''} onChange={e => onChange('whatsapp_waba_id', e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary font-mono" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Radio de matching (km)">
          <input type="number" value={settings.matching_radius_km || '20'} onChange={e => onChange('matching_radius_km', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary" min="1" max="500" />
        </Field>
        <Field label="Score mínimo (%)">
          <input type="number" value={settings.matching_min_score || '70'} onChange={e => onChange('matching_min_score', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary" min="0" max="100" />
        </Field>
      </div>
    </div>
  );
}

function RelayWAConfig({ settings, onChange }: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-4">
      <Toggle checked={settings.relay_enabled !== 'false'} onChange={v => onChange('relay_enabled', String(v))} label="Activar WhatsApp Relay (Phone)" id="d_relay_enabled" />
      <Toggle checked={settings.wa_adoption_broadcast_enabled === 'true'} onChange={v => onChange('wa_adoption_broadcast_enabled', String(v))} label="Broadcast automático de adopciones" id="d_wa_adoption" />
      <Toggle checked={settings.wa_status_enabled === 'true'} onChange={v => onChange('wa_status_enabled', String(v))} label="Publicar también como WhatsApp Status" id="d_wa_status" />
      <Field label="Horas de broadcast" hint="Comas separadas, ej: 8,12,16,20">
        <input type="text" value={settings.wa_adoption_broadcast_hours || '8,12,16,20'} onChange={e => onChange('wa_adoption_broadcast_hours', e.target.value)}
          className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm font-mono" />
      </Field>
      <Field label="Teléfono admin (notificaciones)" hint="Para notificar cuando falle un envío.">
        <input type="text" value={settings.relay_admin_phone || ''} onChange={e => onChange('relay_admin_phone', e.target.value)}
          className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm font-mono" />
      </Field>
    </div>
  );
}

function RelayFBConfig({ settings, onChange }: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-4">
      <Toggle checked={settings.fb_relay_enabled === 'true'} onChange={v => onChange('fb_relay_enabled', String(v))} label="Activar Facebook Relay (Desktop)" id="d_fb_relay_enabled" />
      <Toggle checked={settings.fb_adoption_broadcast_enabled === 'true'} onChange={v => onChange('fb_adoption_broadcast_enabled', String(v))} label="Broadcast automático de adopciones a FB" id="d_fb_adoption" />
      <Field label="Horas de broadcast FB" hint="Comas separadas, ej: 8,12,16,20">
        <input type="text" value={settings.fb_adoption_broadcast_hours || '8,12,16,20'} onChange={e => onChange('fb_adoption_broadcast_hours', e.target.value)}
          className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm font-mono" />
      </Field>
    </div>
  );
}

function BroadcastsConfig({ settings, onChange }: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Smartphone className="w-4 h-4 text-emerald-600" /> WhatsApp Adopciones</h4>
        <div className="space-y-3">
          <Toggle checked={settings.wa_adoption_broadcast_enabled === 'true'} onChange={v => onChange('wa_adoption_broadcast_enabled', String(v))} label="Activar broadcast WA adopciones" id="d_bc_wa" />
          <Field label="Horas WA" hint="Comas separadas">
            <input type="text" value={settings.wa_adoption_broadcast_hours || '8,12,16,20'} onChange={e => onChange('wa_adoption_broadcast_hours', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary font-mono" />
          </Field>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-blue-600" /> Facebook Adopciones</h4>
        <div className="space-y-3">
          <Toggle checked={settings.fb_adoption_broadcast_enabled === 'true'} onChange={v => onChange('fb_adoption_broadcast_enabled', String(v))} label="Activar broadcast FB adopciones" id="d_bc_fb" />
          <Field label="Horas FB" hint="Comas separadas">
            <input type="text" value={settings.fb_adoption_broadcast_hours || '8,12,16,20'} onChange={e => onChange('fb_adoption_broadcast_hours', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary font-mono" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function NewsPublishConfig({ settings, onChange }: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const platformList = [
    { key: 'instagram', label: 'Instagram Feed', icon: '📷' },
    { key: 'instagram_stories', label: 'Instagram Stories', icon: '📱' },
    { key: 'facebook_page', label: 'Facebook Página', icon: '📘' },
    { key: 'facebook_groups', label: 'Facebook Grupos', icon: '👥' },
    { key: 'whatsapp', label: 'WhatsApp Grupos', icon: '💬' },
    { key: 'status', label: 'WhatsApp Estado', icon: '📢' },
  ];

  const currentPlatforms = (() => {
    try { return JSON.parse(settings.news_auto_publish_platforms || '[]'); }
    catch { return []; }
  })();

  const togglePlatform = (key: string, v: boolean) => {
    const next = v ? [...currentPlatforms, key] : currentPlatforms.filter((k: string) => k !== key);
    onChange('news_auto_publish_platforms', JSON.stringify(next));
  };

  return (
    <div className="space-y-4">
      <Toggle checked={settings.news_auto_publish_enabled === 'true'} onChange={v => onChange('news_auto_publish_enabled', String(v))}
        label="Publicar novedades automáticamente"
        id="d_news_auto_publish" />
      <p className="text-xs text-gray-400 -mt-2">Al crear una novedad manual, se publica automáticamente en los canales activos.</p>
      <div className={settings.news_auto_publish_enabled !== 'true' ? 'opacity-50 pointer-events-none' : ''}>
        <p className="text-sm font-bold text-gray-600 mb-2">Canales:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {platformList.map(p => (
            <label key={p.key} className="flex items-center gap-3 p-3 bg-brand-bg rounded-xl cursor-pointer hover:bg-brand-accent/50 transition-colors">
              <input type="checkbox" checked={currentPlatforms.includes(p.key)}
                onChange={e => togglePlatform(p.key, e.target.checked)}
                className="w-5 h-5 rounded accent-brand-primary" />
              <span className="text-sm">{p.icon} {p.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

const configComponents: Record<ConfigTab, React.FC<{ settings: Record<string, string>; onChange: (k: string, v: string) => void }>> = {
  scraping: ScrapingConfig,
  matching: MatchingConfig,
  publisher: PublisherConfig,
  instagram: InstagramConfig,
  whatsapp: WhatsAppConfig,
  relay_wa: RelayWAConfig,
  relay_fb: RelayFBConfig,
  broadcasts: BroadcastsConfig,
  news: NewsPublishConfig,
};

export default function UnifiedDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeConfigTab, setActiveConfigTab] = useState<ConfigTab>('scraping');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await api.adminDashboard.get();
      setData(res);
      setSettings(res.settings || {});
      setDirty(false);
    } catch (e) {
      console.error('Error loading dashboard:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handleChange = useCallback((key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.adminDashboard.updateSettings(settings);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      loadDashboard();
    } catch (e: any) {
      alert(e.message || 'Error al guardar');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-center text-gray-400 py-10">Error al cargar el dashboard.</p>;
  }

  const ConfigForm = configComponents[activeConfigTab];

  return (
    <div className="space-y-8">
      {/* Channel Status Cards */}
      <div>
        <h2 className="text-lg font-serif font-bold text-brand-primary mb-4 flex items-center gap-2">
          <Radio className="w-5 h-5" /> Estado de Canales
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <ChannelStatusCard name="FB Scraper" icon={<Globe className="w-4 h-4 text-gray-600" />}
            enabled={data.channels.fb_scraper.enabled} status={data.channels.fb_scraper.status as any}
            lastRun={data.channels.fb_scraper.lastRun} detail={data.channels.fb_scraper.detail} />
          <ChannelStatusCard name="FB Publisher" icon={<MessageSquare className="w-4 h-4 text-blue-600" />}
            enabled={data.channels.fb_publisher.enabled} status={data.channels.fb_publisher.status as any}
            lastRun={data.channels.fb_publisher.lastRun} detail={data.channels.fb_publisher.detail} />
          <ChannelStatusCard name="Instagram" icon={<Camera className="w-4 h-4 text-pink-500" />}
            enabled={data.channels.instagram.enabled} status={data.channels.instagram.status as any}
            lastRun={data.channels.instagram.lastRun} detail={data.channels.instagram.detail} />
          <ChannelStatusCard name="WA Business" icon={<Smartphone className="w-4 h-4 text-emerald-600" />}
            enabled={data.channels.whatsapp_business.enabled} status={data.channels.whatsapp_business.status as any}
            lastRun={data.channels.whatsapp_business.lastRun} detail={data.channels.whatsapp_business.detail} />
          <ChannelStatusCard name="Relay WA" icon={<Radio className="w-4 h-4 text-orange-500" />}
            enabled={data.channels.relay_wa.enabled} status={data.channels.relay_wa.status as any}
            lastRun={data.channels.relay_wa.lastRun} detail={data.channels.relay_wa.detail} />
          <ChannelStatusCard name="Relay FB" icon={<Users className="w-4 h-4 text-indigo-500" />}
            enabled={data.channels.relay_fb.enabled} status={data.channels.relay_fb.status as any}
            lastRun={data.channels.relay_fb.lastRun} detail={data.channels.relay_fb.detail} />
        </div>
      </div>

      {/* Last Post Preview */}
      <LastPostPreview
        instagram={data.lastPost.instagram}
        facebook={data.lastPost.facebook}
        whatsapp={data.lastPost.whatsapp}
      />

      {/* Configuration */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-serif font-bold text-brand-primary flex items-center gap-2">
            <Clock className="w-5 h-5" /> Configuración
          </h2>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><Check className="w-4 h-4" /> Guardado</span>}
            <button onClick={handleSave} disabled={saving || !dirty}
              className="px-5 py-2.5 bg-brand-primary text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* Config sub-tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-brand-accent pb-px">
          {configTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveConfigTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-all",
                activeConfigTab === tab.id
                  ? "bg-brand-primary text-white"
                  : "text-gray-400 hover:text-gray-600 hover:bg-brand-bg"
              )}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <ConfigForm settings={settings} onChange={handleChange} />
      </div>

      {/* Footer */}
      <p className="text-[10px] text-gray-300 text-center">
        Los cambios se aplican a todos los canales. La sincronización con los tabs individuales es automática.
      </p>
    </div>
  );
}
