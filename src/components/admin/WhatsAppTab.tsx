import React, { useState, useEffect } from 'react';
import { api } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';
import {
  Save, Loader2, MessageSquare, RefreshCw, Send,
  Phone, User, X, CheckCircle, XCircle,
  Bot, Settings, BarChart3, Map, FlaskConical, Building2,
} from 'lucide-react';

interface Conversation {
  id: string;
  wa_from: string;
  bot_name: string;
  flow: string;
  context: any;
  last_message_at: string;
  status: string;
  created_at: string;
  message_count: number;
  last_message: string;
  last_message_type: string;
}

interface Message {
  id: string;
  wa_from: string;
  conversation_id: string;
  sender_name: string;
  message_type: string;
  text_body: string;
  image_data: string;
  image_mime: string;
  status: string;
  direction: string;
  user_name: string;
  created_at: string;
}

interface Stats {
  total: number;
  today: number;
  activeConversations: number;
  byType: { message_type: string; count: number }[];
  byFlow: { flow: string; count: number }[];
}

const BOT_NAMES = ['Tute', 'Lilo', 'Toto'];

export default function WhatsAppTab() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileForm, setProfileForm] = useState({ about: '', description: '', email: '', websites: [''] });

  const fetchProfile = async () => {
    setProfileLoading(true);
    try {
      const data = await api.whatsapp.profile();
      setProfile(data);
      setProfileForm({
        about: data?.about || '',
        description: data?.description || '',
        email: data?.email || '',
        websites: data?.websites?.length ? data.websites : [''],
      });
    } catch (e) { console.error(e); }
    setProfileLoading(false);
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const fields: any = {};
      if (profileForm.about !== profile?.about) fields.about = profileForm.about;
      if (profileForm.description !== profile?.description) fields.description = profileForm.description;
      if (profileForm.email !== profile?.email) fields.email = profileForm.email;
      const websites = profileForm.websites.filter(Boolean);
      if (JSON.stringify(websites) !== JSON.stringify(profile?.websites || [])) fields.websites = websites;
      if (Object.keys(fields).length > 0) {
        await api.whatsapp.updateProfile(fields);
      }
      await fetchProfile();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || e?.error || 'Error desconocido';
      alert('Error al guardar perfil: ' + msg);
    }
    setProfileSaving(false);
  };

  const fetchSettings = async () => {
    try {
      const data = await api.settings.list();
      const map: Record<string, string> = {};
      data.forEach((s: any) => { map[s.key] = s.value; });
      setSettings(map);
    } catch (e) { console.error(e); }
  };

  const fetchConversations = async () => {
    setConvsLoading(true);
    try {
      const data = await api.whatsapp.conversations();
      setConversations(data);
    } catch (e) { console.error(e); }
    setConvsLoading(false);
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const data = await api.whatsapp.stats();
      setStats(data);
    } catch (e) { console.error(e); }
    setStatsLoading(false);
  };

  const fetchConversationMessages = async (convId: string) => {
    setMessagesLoading(true);
    try {
      const data = await api.whatsapp.getConversation(convId);
      setMessages(data.messages);
      setSelectedConv(data.conversation);
    } catch (e) { console.error(e); }
    setMessagesLoading(false);
  };

  const refreshAll = () => {
    fetchConversations();
    fetchStats();
  };

  useEffect(() => {
    fetchSettings();
    fetchConversations();
    fetchStats();
  }, []);

  const saveSettings = async () => {
    setSettingsLoading(true);
    setSettingsSaved(false);
    try {
      const keys = [
        'whatsapp_enabled', 'whatsapp_phone_number_id', 'whatsapp_access_token',
        'whatsapp_verify_token', 'whatsapp_business_phone', 'whatsapp_greeting',
        'matching_radius_km', 'matching_min_score',
      ];
      await Promise.all(keys.map(k => api.settings.update(k, settings[k] || '')));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (e) {
      console.error(e);
      alert('Error al guardar configuración');
    }
    setSettingsLoading(false);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedConv || sendingReply) return;
    setSendingReply(true);
    try {
      await api.whatsapp.reply(selectedConv.id, replyText.trim());
      setReplyText('');
      await fetchConversationMessages(selectedConv.id);
      fetchConversations();
    } catch (e) {
      console.error(e);
      alert('Error al enviar mensaje');
    }
    setSendingReply(false);
  };

  const assignBotName = async (convId: string, name: string) => {
    try {
      await api.whatsapp.assignBot(convId, name);
      refreshAll();
      if (selectedConv?.id === convId) {
        setSelectedConv((prev: any) => prev ? { ...prev, bot_name: name } : null);
      }
    } catch (e) { console.error(e); }
  };

  const closeConversation = async (convId: string) => {
    try {
      await api.whatsapp.closeConversation(convId);
      if (selectedConv?.id === convId) setSelectedConv(null);
      refreshAll();
    } catch (e) { console.error(e); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  const flowLabel = (flow: string) => {
    const labels: Record<string, string> = {
      menu: 'Menú',
      pending_human: '👤 Pendiente humano',
      report_lost: '📷 Perdida',
      info_qr: 'ℹ️ Info QR',
      volunteer: '🙋 Voluntario',
    };
    if (flow?.startsWith('report_lost')) return '📷 Perdida';
    if (flow?.startsWith('report_sighted')) return '👀 Avistaje';
    if (flow?.startsWith('report_found')) return '✅ Encontrada';
    if (flow?.startsWith('volunteer')) return '🙋 Voluntario';
    return labels[flow] || flow || 'Menú';
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '';
    if (phone.startsWith('54') && phone.length > 10) {
      const area = phone.slice(2, phone.length - 4);
      const num = phone.slice(-4);
      return `+54 ${area} ${num}`;
    }
    return phone;
  };

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-brand-accent p-5">
          <p className="text-2xl font-bold text-brand-primary">{statsLoading ? '...' : stats?.activeConversations || 0}</p>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">Activas</p>
        </div>
        <div className="bg-white rounded-2xl border border-brand-accent p-5">
          <p className="text-2xl font-bold text-brand-primary">{statsLoading ? '...' : stats?.today || 0}</p>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">Hoy</p>
        </div>
        <div className="bg-white rounded-2xl border border-brand-accent p-5">
          <p className="text-2xl font-bold text-brand-primary">{statsLoading ? '...' : stats?.total || 0}</p>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">Total mensajes</p>
        </div>
        <div className="bg-white rounded-2xl border border-brand-accent p-5">
          <p className="text-2xl font-bold text-brand-primary">
            {statsLoading ? '...' : settings.whatsapp_enabled === 'true' ? '✅' : '❌'}
          </p>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">{settings.whatsapp_enabled === 'true' ? 'Activo' : 'Inactivo'}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button onClick={refreshAll} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-brand-accent text-sm font-bold text-brand-primary hover:shadow-md transition-all">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
        <button onClick={() => setShowSettings(!showSettings)} className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-all",
          showSettings ? "bg-brand-primary text-white border-brand-primary" : "bg-white text-brand-primary border-brand-accent hover:shadow-md"
        )}>
          <Settings className="w-4 h-4" /> Configuración
        </button>
        <button onClick={() => { setShowProfile(!showProfile); if (!showProfile) fetchProfile(); }} className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-all",
          showProfile ? "bg-brand-primary text-white border-brand-primary" : "bg-white text-brand-primary border-brand-accent hover:shadow-md"
        )}>
          <Building2 className="w-4 h-4" /> Perfil WhatsApp
        </button>
      </div>

      {/* Profile panel */}
      {showProfile && (
        <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
          <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
            <Building2 className="w-6 h-6" /> Perfil de WhatsApp Business
          </h2>

          {profileLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>
          ) : (
            <>
              {profile?.profile_picture_url && (
                <div className="flex justify-center">
                  <img src={profile.profile_picture_url} alt="Profile" className="w-24 h-24 rounded-full object-cover border-2 border-brand-accent" />
                </div>
              )}
              {!profile?.profile_picture_url && (
                <div className="flex justify-center">
                  <div className="w-24 h-24 rounded-full bg-brand-bg flex items-center justify-center border-2 border-brand-accent">
                    <Building2 className="w-10 h-10 text-gray-300" />
                  </div>
                </div>
              )}
              <p className="text-xs text-center text-gray-400">La foto de perfil se cambia desde el Business Manager de Meta</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-600 mb-1">About / Estado</label>
                  <input
                    type="text"
                    value={profileForm.about}
                    onChange={(e) => setProfileForm(p => ({ ...p, about: e.target.value }))}
                    className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
                    maxLength={139}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-600 mb-1">Descripción</label>
                <textarea
                  value={profileForm.description}
                  onChange={(e) => setProfileForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm h-24 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-600 mb-1">Sitios web</label>
                {profileForm.websites.map((w: string, i: number) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="url"
                      value={w}
                      onChange={(e) => {
                        const next = [...profileForm.websites];
                        next[i] = e.target.value;
                        setProfileForm(p => ({ ...p, websites: next }));
                      }}
                      className="flex-1 px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
                      placeholder="https://..."
                    />
                    {profileForm.websites.length > 1 && (
                      <button
                        onClick={() => setProfileForm(p => ({ ...p, websites: p.websites.filter((_, j) => j !== i) }))}
                        className="px-3 py-2 text-red-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setProfileForm(p => ({ ...p, websites: [...p.websites, ''] }))}
                  className="text-sm text-brand-primary font-bold hover:underline"
                >+ Agregar sitio web</button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={saveProfile}
                  disabled={profileSaving}
                  className="px-8 py-3.5 bg-brand-primary text-white text-base font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                >
                  {profileSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {profileSaving ? 'Guardando...' : profileSaved ? '✅ Guardado' : 'Guardar Perfil'}
                </button>
                <button
                  onClick={() => { setShowProfile(false); }}
                  className="px-6 py-3.5 bg-white text-gray-500 text-base font-bold rounded-2xl border border-brand-accent hover:shadow-md transition-all"
                >Cerrar</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
          <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
            <Settings className="w-6 h-6" /> Configuración WhatsApp Business
          </h2>

          <div className="flex items-center gap-3 p-4 bg-brand-bg rounded-2xl">
            <input
              type="checkbox"
              id="whatsapp_enabled"
              checked={settings.whatsapp_enabled === 'true'}
              onChange={(e) => setSettings(p => ({ ...p, whatsapp_enabled: e.target.checked ? 'true' : 'false' }))}
              className="w-5 h-5 rounded accent-brand-primary"
            />
            <label htmlFor="whatsapp_enabled" className="font-bold text-brand-primary">Activar WhatsApp Business</label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'whatsapp_phone_number_id', label: 'Phone Number ID', type: 'text' },
              { key: 'whatsapp_access_token', label: 'Access Token', type: 'password' },
              { key: 'whatsapp_verify_token', label: 'Verify Token', type: 'password' },
              { key: 'whatsapp_business_phone', label: 'Número WhatsApp (cód. país + nro)', type: 'text' },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-sm font-bold text-gray-600 mb-1">{field.label}</label>
                <input
                  type={field.type}
                  value={settings[field.key] || ''}
                  onChange={(e) => setSettings(p => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
                />
              </div>
            ))}
          </div>

          <div className="p-5 bg-blue-50 rounded-2xl border border-blue-200 text-sm text-blue-700">
            <p className="font-bold text-blue-800 mb-2">📘 Guía rápida</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Andá a <strong>developers.facebook.com</strong> → WhatsApp Cloud API</li>
              <li>Copiá <strong>Phone Number ID</strong> y generá un <strong>Access Token</strong> permanente</li>
              <li>Inventá un <strong>Verify Token</strong> y configuralo en Webhook</li>
              <li>URL del Webhook: <code className="bg-blue-100 px-1 rounded">https://sigotuhuella.online/api/whatsapp/webhook</code></li>
              <li>Suscribí al evento <strong>messages</strong></li>
            </ol>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">
                <Map className="w-4 h-4 inline mr-1" /> Radio de búsqueda (km)
              </label>
              <input
                type="number"
                value={settings.matching_radius_km || '20'}
                onChange={(e) => setSettings(p => ({ ...p, matching_radius_km: e.target.value }))}
                className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
                min="1" max="500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">Score mínimo (%)</label>
              <input
                type="number"
                value={settings.matching_min_score || '70'}
                onChange={(e) => setSettings(p => ({ ...p, matching_min_score: e.target.value }))}
                className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
                min="0" max="100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Mensaje de Bienvenida</label>
            <textarea
              value={settings.whatsapp_greeting || ''}
              onChange={(e) => setSettings(p => ({ ...p, whatsapp_greeting: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm h-28 resize-none"
            />
          </div>

          <button
            onClick={saveSettings}
            disabled={settingsLoading}
            className="px-8 py-3.5 bg-brand-primary text-white text-base font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
          >
            {settingsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {settingsLoading ? 'Guardando...' : settingsSaved ? '✅ Guardado' : 'Guardar Configuración'}
          </button>
        </div>
      )}

      {/* Conversations + Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversations List */}
        <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-hidden flex flex-col h-[500px]">
          <div className="p-5 sm:p-6 border-b border-brand-accent">
            <h3 className="font-bold text-brand-primary flex items-center gap-2">
              <MessageSquare className="w-5 h-5" /> Conversaciones
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-brand-accent">
            {convsLoading && conversations.length === 0 ? (
              <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-10">
                <MessageSquare className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p className="text-gray-400 font-medium">Sin conversaciones</p>
              </div>
            ) : conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => { fetchConversationMessages(conv.id); }}
                className={cn(
                  "w-full text-left p-4 hover:bg-brand-bg/50 transition-colors",
                  selectedConv?.id === conv.id && "bg-brand-bg"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-brand-primary truncate text-sm">
                        {conv.sender_name || formatPhone(conv.wa_from)}
                      </span>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0",
                        conv.status === 'active' ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      )}>{conv.status}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{formatPhone(conv.wa_from)}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-bg font-bold text-gray-500 shrink-0">
                        {conv.bot_name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-bg font-bold text-gray-500 shrink-0">
                        {flowLabel(conv.flow)}
                      </span>
                      <span className="text-xs text-gray-400">{conv.message_count} msgs</span>
                    </div>
                    {conv.last_message && (
                      <p className="text-xs text-gray-500 mt-1.5 truncate">
                        {conv.last_message_type === 'image' ? '📷 ' : ''}{conv.last_message}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-300 mt-1">
                      {new Date(conv.last_message_at).toLocaleString('es-AR')}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Messages Thread */}
        <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-hidden flex flex-col h-[500px]">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                <p className="text-gray-400 font-medium">Seleccioná una conversación</p>
              </div>
            </div>
          ) : (
            <>
              {/* Contact header */}
              <div className="p-4 sm:p-5 border-b border-brand-accent">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-brand-primary text-sm">{formatPhone(selectedConv.wa_from)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-bg font-bold text-gray-500">{selectedConv.bot_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-bg font-bold text-gray-500">{flowLabel(selectedConv.flow)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative group">
                      <button className="p-2 rounded-xl hover:bg-brand-bg transition-colors" title="Cambiar bot">
                        <Bot className="w-4 h-4 text-gray-400" />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-white border border-brand-accent rounded-xl shadow-lg p-1 hidden group-hover:block z-10 min-w-[100px]">
                        {BOT_NAMES.map(name => (
                          <button
                            key={name}
                            onClick={() => assignBotName(selectedConv.id, name)}
                            className={cn(
                              "block w-full text-left px-3 py-1.5 text-xs font-bold rounded-lg hover:bg-brand-bg transition-colors",
                              selectedConv.bot_name === name && "text-brand-primary"
                            )}
                          >{name}</button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => closeConversation(selectedConv.id)}
                      className="p-2 rounded-xl hover:bg-red-50 transition-colors"
                      title="Cerrar conversación"
                    >
                      <XCircle className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                {messagesLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-gray-400 py-10 text-sm">Sin mensajes</p>
                ) : messages.map(msg => (
                  <div key={msg.id} className={cn(
                    "flex flex-col max-w-[80%]",
                    msg.direction === 'outbound' ? "ml-auto items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "px-4 py-2.5 rounded-2xl text-sm",
                      msg.direction === 'outbound'
                        ? "bg-brand-primary text-white rounded-br-md"
                        : "bg-brand-bg text-gray-800 rounded-bl-md"
                    )}>
                      {msg.message_type === 'image' && msg.image_data ? (
                        <div className="mb-1">
                          <img
                            src={`data:${msg.image_mime || 'image/jpeg'};base64,${msg.image_data}`}
                            alt=""
                            className="max-w-[200px] rounded-xl"
                          />
                        </div>
                      ) : null}
                      {msg.message_type === 'location' ? (
                        <span>📍 Ubicación compartida</span>
                      ) : null}
                      {msg.text_body ? <p className="whitespace-pre-wrap break-words">{msg.text_body}</p> : null}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn(
                        "text-[10px]",
                        msg.direction === 'outbound' ? "text-brand-primary/60" : "text-gray-400"
                      )}>
                        {msg.direction === 'outbound' ? 'Admin' : msg.sender_name || 'Usuario'}
                      </span>
                      <span className="text-[10px] text-gray-300">
                        {new Date(msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply box */}
              <div className="p-4 border-t border-brand-accent">
                <div className="flex items-center gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Escribí tu respuesta..."
                    className="flex-1 px-4 py-2.5 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm resize-none h-10 max-h-20"
                    rows={1}
                  />
                  <button
                    onClick={sendReply}
                    disabled={!replyText.trim() || sendingReply}
                    className="p-2.5 bg-brand-primary text-white rounded-xl hover:shadow-lg hover:shadow-brand-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingReply ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Enter para enviar · Shift+Enter para nueva línea</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
