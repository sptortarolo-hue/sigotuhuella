import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/src/lib/api';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import {
  Save, Loader2, Plus, X, Trash2, ExternalLink,
  RefreshCw, MessageSquare, Globe, Camera, Send,
  Settings, BarChart3, Zap, Check, XCircle, Search, ImageIcon,
} from 'lucide-react';

type SubTab = 'dashboard' | 'publish' | 'comments' | 'rules' | 'config';

interface Post {
  id: string;
  pet_id: string;
  pet_name: string;
  species: string;
  media_type: string;
  caption: string;
  status: string;
  ig_media_id: string;
  ig_permalink: string;
  error_message: string;
  image_data: string;
  mime_type: string;
  published_at: string;
  created_at: string;
}

interface Comment {
  id: string;
  ig_comment_id: string;
  ig_media_id: string;
  username: string;
  text: string;
  replied: boolean;
  dm_sent: boolean;
  classification: string;
  ig_permalink: string;
  post_caption: string;
  created_at: string;
}

interface AutoReplyRule {
  id: string;
  keywords: string[];
  reply_type: 'public_reply' | 'private_dm' | 'both';
  reply_template: string;
  dm_template: string;
  is_active: boolean;
}

export default function InstagramTab({ initialError = '' }: { initialError?: string }) {
  const [subTab, setSubTab] = useState<SubTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(initialError);

  const [connected, setConnected] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [username, setUsername] = useState('');

  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [stats, setStats] = useState({ totalPosts: 0, publishedPosts: 0, totalComments: 0, pendingComments: 0, totalPetsPublished: 0 });

  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState<Record<string, boolean>>({});

  const [ruleForm, setRuleForm] = useState({ keywords: '', reply_type: 'public_reply' as AutoReplyRule['reply_type'], reply_template: '', dm_template: '', is_active: true });
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  const [publisherEnabled, setPublisherEnabled] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [defaultHashtags, setDefaultHashtags] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/instagram/status');
      setConnected(res.connected);
      setExpiresAt(res.expiresAt || '');
      setUsername(res.username || '');
    } catch { setConnected(false); }
  }, []);

  const fetchPosts = useCallback(async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.get(`/instagram/posts${params}`);
      setPosts(res);
    } catch (e) { console.error(e); }
  }, [statusFilter]);

  const fetchComments = useCallback(async () => {
    try {
      const res = await api.get('/instagram/comments');
      setComments(res);
    } catch (e) { console.error(e); }
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const res = await api.get('/instagram/auto-reply-rules');
      setRules(res);
    } catch (e) { console.error(e); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/instagram/stats');
      setStats(res);
    } catch (e) { console.error(e); }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const keys = ['instagram_publisher_enabled', 'instagram_auto_reply_enabled', 'instagram_default_hashtags'];
      const res = await api.post('/settings/batch', { keys });
      setPublisherEnabled(res.instagram_publisher_enabled === 'true');
      setAutoReplyEnabled(res.instagram_auto_reply_enabled === 'true');
      setDefaultHashtags(res.instagram_default_hashtags || '');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchStatus(), fetchPosts(), fetchComments(), fetchRules(), fetchStats(), fetchConfig(),
    ]).finally(() => setLoading(false));
  }, [fetchStatus, fetchPosts, fetchComments, fetchRules, fetchStats, fetchConfig]);

  const handleConnect = async () => {
    try {
      const res = await api.get('/instagram/auth-url');
      window.location.href = res.url;
    } catch (e) { setError('Error al generar URL de autenticación'); }
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Desconectar Instagram? Se perderán los tokens.')) return;
    await api.post('/instagram/disconnect');
    setConnected(false);
    setExpiresAt('');
    setUsername('');
  };

  const handleReply = async (commentId: string) => {
    const message = replyText[commentId]?.trim();
    if (!message) return;
    setSendingReply(prev => ({ ...prev, [commentId]: true }));
    try {
      await api.post(`/instagram/comments/${commentId}/reply`, { message });
      setReplyText(prev => ({ ...prev, [commentId]: '' }));
      fetchComments();
    } catch (e) { setError('Error al responder'); }
    finally { setSendingReply(prev => ({ ...prev, [commentId]: false })); }
  };

  const handleSendDm = async (commentId: string) => {
    const message = replyText[commentId]?.trim();
    if (!message) return;
    setSendingReply(prev => ({ ...prev, [commentId]: true }));
    try {
      await api.post(`/instagram/comments/${commentId}/dm`, { message });
      setReplyText(prev => ({ ...prev, [commentId]: '' }));
      fetchComments();
    } catch (e) { setError('Error al enviar DM'); }
    finally { setSendingReply(prev => ({ ...prev, [commentId]: false })); }
  };

  const saveRule = async () => {
    if (!ruleForm.keywords.trim() || !ruleForm.reply_template.trim()) {
      setError('Keywords y template son requeridos');
      return;
    }
    setSavingRule(true);
    try {
      const keywords = ruleForm.keywords.split(',').map(k => k.trim()).filter(Boolean);
      const body = { ...ruleForm, keywords, is_active: ruleForm.is_active };
      if (editingRule) {
        await api.put(`/instagram/auto-reply-rules/${editingRule.id}`, body);
      } else {
        await api.post('/instagram/auto-reply-rules', body);
      }
      setRuleForm({ keywords: '', reply_type: 'public_reply', reply_template: '', dm_template: '', is_active: true });
      setEditingRule(null);
      fetchRules();
    } catch (e) { setError('Error al guardar regla'); }
    finally { setSavingRule(false); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('¿Eliminar regla?')) return;
    await api.delete(`/instagram/auto-reply-rules/${id}`);
    fetchRules();
  };

  const editRule = (rule: AutoReplyRule) => {
    setRuleForm({
      keywords: rule.keywords.join(', '),
      reply_type: rule.reply_type,
      reply_template: rule.reply_template,
      dm_template: rule.dm_template || '',
      is_active: rule.is_active,
    });
    setEditingRule(rule);
  };

  const retryFailed = async () => {
    setRetrying(true);
    try {
      const res = await api.post('/instagram/retry-failed');
      await fetchPosts();
      if (res.retried > 0) setError('');
    } catch (e) { setError('Error al reintentar'); }
    finally { setRetrying(false); }
  };

  const processQueue = async () => {
    setProcessing(true);
    try {
      await api.post('/instagram/process-queue');
      await fetchPosts();
    } catch (e) { setError('Error al procesar cola'); }
    finally { setProcessing(false); }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await api.post('/settings', { key: 'instagram_publisher_enabled', value: String(publisherEnabled) });
      await api.post('/settings', { key: 'instagram_auto_reply_enabled', value: String(autoReplyEnabled) });
      await api.post('/settings', { key: 'instagram_default_hashtags', value: defaultHashtags });
    } catch (e) { setError('Error al guardar configuración'); }
    finally { setSavingConfig(false); }
  };

  const imageUrl = (post: Post) => {
    if (post.image_data && post.mime_type) {
      return `data:${post.mime_type};base64,${post.image_data}`;
    }
    return '';
  };

  const timeAgo = (date: string) => {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `hace ${days}d`;
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-2xl flex items-center justify-center">
              <Camera className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-brand-primary">Instagram</h2>
              <p className="text-sm text-gray-500">
                {connected
                  ? `Conectado como ${username || '@sigotuhuella.sicardi'}`
                  : 'No conectado'}
              </p>
              {connected && expiresAt && (
                <p className="text-xs text-gray-400">
                  Token expira: {new Date(expiresAt).toLocaleDateString('es-AR')}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {!connected ? (
              <button onClick={handleConnect} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 text-white font-bold rounded-2xl hover:opacity-90 transition-all">
                <Camera className="w-5 h-5" /> Conectar Instagram
              </button>
            ) : (
              <button onClick={handleDisconnect} className="flex items-center gap-2 px-4 py-2 text-sm bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 transition-all">
                <XCircle className="w-4 h-4" /> Desconectar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-brand-accent pb-px">
        {[
          { id: 'dashboard' as SubTab, label: 'Dashboard', icon: BarChart3 },
          { id: 'publish' as SubTab, label: 'Publicaciones', icon: Camera },
          { id: 'comments' as SubTab, label: 'Comentarios', icon: MessageSquare },
          { id: 'rules' as SubTab, label: 'Auto-respuesta', icon: Zap },
          { id: 'config' as SubTab, label: 'Configuración', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 font-bold transition-all relative text-sm",
              subTab === tab.id ? "text-brand-primary" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {subTab === tab.id && (
              <motion.div layoutId="ig-subtab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {subTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Publicaciones', value: stats.totalPosts, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Publicadas', value: stats.publishedPosts, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Comentarios', value: stats.totalComments, color: 'text-pink-600', bg: 'bg-pink-50' },
              { label: 'Mascotas publicadas', value: stats.totalPetsPublished, color: 'text-orange-600', bg: 'bg-orange-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-2xl p-5`}>
                <p className="text-sm text-gray-500 mb-1">{s.label}</p>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
          {connected && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <h3 className="font-bold text-blue-800 mb-2">✅ Conexión activa</h3>
              <p className="text-blue-700 text-sm">
                Instagram está conectado. Las publicaciones encoladas se procesan automáticamente.
              </p>
            </div>
          )}
          {!connected && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
              <h3 className="font-bold text-amber-800 mb-2">⚠️ No conectado</h3>
              <p className="text-amber-700 text-sm">
                Conectá la cuenta de Instagram para empezar a publicar y gestionar comentarios.
              </p>
            </div>
          )}
        </div>
      )}

      {subTab === 'publish' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-brand-primary">Publicaciones</h3>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-sm bg-white border border-brand-accent rounded-xl px-3 py-2 outline-none"
              >
                <option value="">Todas</option>
                <option value="queued">En cola</option>
                <option value="published">Publicadas</option>
                <option value="failed">Fallidas</option>
              </select>
              <button onClick={fetchPosts} className="p-2 bg-brand-accent rounded-xl hover:bg-brand-accent/70 transition-all">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={retryFailed}
                disabled={retrying}
                className="flex items-center gap-1 px-3 py-2 bg-amber-50 text-amber-700 text-xs font-bold rounded-xl hover:bg-amber-100 transition-all disabled:opacity-50"
              >
                {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Reintentar fallidas
              </button>
              <button
                onClick={processQueue}
                disabled={processing}
                className="flex items-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl hover:bg-blue-100 transition-all disabled:opacity-50"
              >
                {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Procesar cola
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-brand-accent">
            <table className="w-full text-left min-w-max">
              <thead>
                <tr className="bg-gray-50 text-sm text-gray-500">
                  <th className="p-4">Imagen</th>
                  <th className="p-4">Mascota</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Enlace</th>
                  <th className="p-4">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {posts.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">Sin publicaciones aún</td></tr>
                )}
                {posts.map(post => (
                  <tr key={post.id} className="border-t border-brand-accent text-sm">
                    <td className="p-4">
                      {imageUrl(post) ? (
                        <img src={imageUrl(post)} alt="" className="w-12 h-12 object-cover rounded-xl" />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-gray-300" />
                        </div>
                      )}
                    </td>
                    <td className="p-4 font-medium">{post.pet_name || '—'}</td>
                    <td className="p-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold",
                        post.status === 'published' && "bg-green-100 text-green-700",
                        post.status === 'queued' && "bg-amber-100 text-amber-700",
                        post.status === 'failed' && "bg-red-100 text-red-700",
                        post.status === 'pending' && "bg-gray-100 text-gray-500",
                      )}>
                        {post.status === 'published' ? 'Publicada' : post.status === 'queued' ? 'En cola' : post.status === 'failed' ? 'Fallida' : post.status}
                      </span>
                      {post.status === 'failed' && post.error_message && (
                        <p className="text-xs text-red-500 mt-1">{post.error_message}</p>
                      )}
                    </td>
                    <td className="p-4">
                      {post.ig_permalink ? (
                        <a href={post.ig_permalink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                          Ver <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : '—'}
                    </td>
                    <td className="p-4 text-gray-500">{timeAgo(post.published_at || post.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'comments' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-brand-primary">Comentarios</h3>
            <button onClick={fetchComments} className="p-2 bg-brand-accent rounded-xl hover:bg-brand-accent/70 transition-all">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-4">
            {comments.length === 0 && (
              <div className="text-center py-10 text-gray-400">Sin comentarios aún</div>
            )}
            {comments.map(comment => (
              <div key={comment.id} className="bg-white rounded-2xl border border-brand-accent p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="font-bold text-brand-primary">@{comment.username}</span>
                    <span className="text-gray-400 text-sm ml-3">{timeAgo(comment.created_at)}</span>
                  </div>
                  <div className="flex gap-2">
                    {comment.replied && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Respondido</span>}
                    {comment.dm_sent && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">DM enviado</span>}
                  </div>
                </div>
                <p className="text-gray-700 mb-3">{comment.text}</p>
                <div className="flex gap-2 items-start">
                  <input
                    type="text"
                    placeholder="Escribí una respuesta..."
                    value={replyText[comment.id] || ''}
                    onChange={e => setReplyText(prev => ({ ...prev, [comment.id]: e.target.value }))}
                    className="flex-1 bg-gray-50 border border-brand-accent rounded-xl px-4 py-2 text-sm outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleReply(comment.id)}
                  />
                  <button
                    onClick={() => handleReply(comment.id)}
                    disabled={!replyText[comment.id]?.trim() || sendingReply[comment.id]}
                    className="flex items-center gap-1 px-4 py-2 bg-brand-primary text-white text-sm font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    {sendingReply[comment.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Reply
                  </button>
                  <button
                    onClick={() => handleSendDm(comment.id)}
                    disabled={!replyText[comment.id]?.trim() || sendingReply[comment.id]}
                    className="flex items-center gap-1 px-4 py-2 bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    {sendingReply[comment.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    DM
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
            <h3 className="text-lg font-bold text-brand-primary mb-4">
              {editingRule ? 'Editar regla' : 'Nueva regla de auto-respuesta'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Palabras clave (separadas por coma)</label>
                <input
                  type="text"
                  value={ruleForm.keywords}
                  onChange={e => setRuleForm(prev => ({ ...prev, keywords: e.target.value }))}
                  placeholder="adoptar, quiero, info, precio"
                  className="w-full bg-gray-50 border border-brand-accent rounded-xl px-4 py-3 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Tipo de respuesta</label>
                <select
                  value={ruleForm.reply_type}
                  onChange={e => setRuleForm(prev => ({ ...prev, reply_type: e.target.value as any }))}
                  className="w-full bg-gray-50 border border-brand-accent rounded-xl px-4 py-3 text-sm outline-none"
                >
                  <option value="public_reply">Respuesta pública</option>
                  <option value="private_dm">Mensaje privado (DM)</option>
                  <option value="both">Ambos</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Template respuesta pública</label>
                <textarea
                  value={ruleForm.reply_template}
                  onChange={e => setRuleForm(prev => ({ ...prev, reply_template: e.target.value }))}
                  placeholder="Gracias por tu interés {username}! Más info en sigotuhuella.online 🐾"
                  rows={3}
                  className="w-full bg-gray-50 border border-brand-accent rounded-xl px-4 py-3 text-sm outline-none resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">Usá {'{username}'} para mencionar al usuario</p>
              </div>
              {(ruleForm.reply_type === 'private_dm' || ruleForm.reply_type === 'both') && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Template DM privado</label>
                  <textarea
                    value={ruleForm.dm_template}
                    onChange={e => setRuleForm(prev => ({ ...prev, dm_template: e.target.value }))}
                    placeholder="Hola! Gracias por tu interés. Adoptalo en sigotuhuella.online/pet/..."
                    rows={3}
                    className="w-full bg-gray-50 border border-brand-accent rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ruleForm.is_active}
                  onChange={e => setRuleForm(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded"
                />
                Activa
              </label>
              <div className="flex gap-2">
                <button
                  onClick={saveRule}
                  disabled={savingRule}
                  className="flex items-center gap-2 px-6 py-3 bg-brand-primary text-white font-bold rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {savingRule ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingRule ? 'Actualizar' : 'Guardar regla'}
                </button>
                {editingRule && (
                  <button
                    onClick={() => { setEditingRule(null); setRuleForm({ keywords: '', reply_type: 'public_reply', reply_template: '', dm_template: '', is_active: true }); }}
                    className="px-4 py-3 text-sm text-gray-600 font-bold rounded-2xl hover:bg-gray-100 transition-all"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-bold text-brand-primary">Reglas existentes</h3>
            {rules.length === 0 && (
              <div className="text-center py-10 text-gray-400 bg-white rounded-[2.5rem] border border-brand-accent">
                Sin reglas de auto-respuesta configuradas
              </div>
            )}
            {rules.map(rule => (
              <div key={rule.id} className="bg-white rounded-2xl border border-brand-accent p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex gap-2 flex-wrap">
                    {rule.keywords.map(kw => (
                      <span key={kw} className="text-xs bg-brand-accent px-2 py-1 rounded-full text-gray-600">#{kw}</span>
                    ))}
                  </div>
                  <span className={cn(
                    "text-xs px-2 py-1 rounded-full font-bold",
                    rule.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500",
                    !rule.is_active && "line-through"
                  )}>
                    {rule.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-1">
                  {rule.reply_type === 'public_reply' ? '🗣️ Respuesta pública' : rule.reply_type === 'private_dm' ? '💬 DM privado' : '🗣️💬 Ambos'}
                </p>
                <p className="text-sm text-gray-700 mb-2">{rule.reply_template}</p>
                {rule.dm_template && <p className="text-xs text-gray-400">DM: {rule.dm_template}</p>}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => editRule(rule)} className="text-xs text-blue-600 hover:underline">Editar</button>
                  <button onClick={() => deleteRule(rule.id)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'config' && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
            <h3 className="text-lg font-bold text-brand-primary mb-6">Configuración del Publisher</h3>
            <div className="space-y-5">
              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-700">Publisher automático</p>
                  <p className="text-sm text-gray-400">Publicar automáticamente mascotas nuevas en Instagram</p>
                </div>
                <button
                  onClick={() => setPublisherEnabled(!publisherEnabled)}
                  className={cn("w-12 h-7 rounded-full transition-colors relative", publisherEnabled ? "bg-brand-primary" : "bg-gray-300")}
                >
                  <div className={cn("w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm", publisherEnabled ? "left-[26px]" : "left-1")} />
                </button>
              </label>

              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-700">Auto-respuesta a comentarios</p>
                  <p className="text-sm text-gray-400">Responder automáticamente según reglas configuradas</p>
                </div>
                <button
                  onClick={() => setAutoReplyEnabled(!autoReplyEnabled)}
                  className={cn("w-12 h-7 rounded-full transition-colors relative", autoReplyEnabled ? "bg-brand-primary" : "bg-gray-300")}
                >
                  <div className={cn("w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm", autoReplyEnabled ? "left-[26px]" : "left-1")} />
                </button>
              </label>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Hashtags por defecto</label>
                <textarea
                  value={defaultHashtags}
                  onChange={e => setDefaultHashtags(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-50 border border-brand-accent rounded-xl px-4 py-3 text-sm outline-none resize-none"
                />
              </div>

              <button
                onClick={saveConfig}
                disabled={savingConfig}
                className="flex items-center gap-2 px-6 py-3 bg-brand-primary text-white font-bold rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {savingConfig ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Guardar configuración
              </button>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-[2.5rem] p-6">
            <h3 className="font-bold text-amber-800 mb-2">⚠️ App Review de Meta</h3>
            <p className="text-amber-700 text-sm">
              Para usar en producción, la app de Meta necesita pasar App Review con los permisos:
              <code className="block mt-2 bg-amber-100 px-3 py-2 rounded-lg text-xs">
                instagram_basic, instagram_content_publish, instagram_manage_comments, instagram_manage_messages
              </code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
