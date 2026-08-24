import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Share2, MessageCircle, Camera, Search, Heart, Home, Truck, Plus, CheckCircle2, Check, AlertTriangle, Copy, ExternalLink, Clock, Users, Loader2, Globe, Bell } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { apiUrl } from '@/src/lib/api';
import { getActionCenterData, createFinding, logShare, logShareConfirmation, ActionCenterData } from '@/src/lib/volunteerService';
import ShareGroupsPicker, { type SelectedShareGroup } from '@/src/components/ShareGroupsPicker';
import { getCollaborationAccounts, CollaborationAccount } from '@/src/lib/collaborationService';

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  lost: { label: 'PERDIDO', color: '#EF4444', bg: 'bg-red-100 text-red-700' },
  sighted: { label: 'AVISTADO', color: '#F59E0B', bg: 'bg-amber-100 text-amber-700' },
  retained: { label: 'RETENIDO', color: '#3B82F6', bg: 'bg-blue-100 text-blue-700' },
  accidented: { label: 'ACCIDENTADO', color: '#EF4444', bg: 'bg-red-100 text-red-700' },
  needs_attention: { label: 'NECESITA ATENCIÓN', color: '#8B5CF6', bg: 'bg-purple-100 text-purple-700' },
  for_adoption: { label: 'EN ADOPCIÓN', color: '#10B981', bg: 'bg-emerald-100 text-emerald-700' },
  for_adoption_simple: { label: 'EN ADOPCIÓN', color: '#F97316', bg: 'bg-orange-100 text-orange-700' },
  adoption_trial: { label: 'EN PRUEBA', color: '#14B8A6', bg: 'bg-teal-100 text-teal-700' },
  adopted: { label: 'ADOPTADO', color: '#10B981', bg: 'bg-green-100 text-green-700' },
  reunited: { label: 'REENCUENTRO', color: '#10B981', bg: 'bg-green-100 text-green-700' },
  transitada: { label: 'EN TRÁNSITO', color: '#0D9488', bg: 'bg-teal-100 text-teal-700' },
};

const SPECIES_EMOJI: Record<string, string> = { dog: '🐶', cat: '🐱', other: '🐾' };
const SPECIES_LABEL: Record<string, string> = { dog: 'Perro', cat: 'Gato', other: 'Otro' };

const CATEGORY_CONFIG = {
  difusion: { label: 'Difusión', icon: Share2, description: 'Compartir en redes y grupos' },
  busqueda: { label: 'Búsqueda', icon: Search, description: 'Reportar avistamientos y hallazgos' },
  hogar_transito: { label: 'Hogar Tránsito', icon: Home, description: 'Ofrecer hogar temporal' },
  traslado: { label: 'Traslado', icon: Truck, description: 'Coordinar traslados' },
  donante: { label: 'Donante', icon: Heart, description: 'Donar insumos/medicación' },
  otra: { label: 'Otra', icon: Plus, description: 'Otras formas de ayudar' },
} as const;

type CategoryKey = keyof typeof CATEGORY_CONFIG;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

interface VolunteerActionCenterProps {
  petId: string;
  onClose: () => void;
  onNavigate?: (url: string) => void;
}

function CategoryTabButton({ category, isActive, onClick }: {
  category: CategoryKey;
  isActive: boolean;
  onClick: () => void;
}) {
  const cfg = CATEGORY_CONFIG[category];
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 font-medium text-xs whitespace-nowrap transition-all min-w-[70px]',
        isActive
          ? 'bg-brand-primary text-white border-brand-primary shadow-lg'
          : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
      )}
      title={cfg.description}
    >
      <cfg.icon className="w-4 h-4" />
      <span>{cfg.label}</span>
    </button>
  );
}

const CARD_STYLES: Record<string, { container: string; icon: string }> = {
  blue: { container: 'bg-white border-blue-200 hover:bg-blue-50 text-gray-800', icon: 'bg-blue-100 text-blue-600' },
  pink: { container: 'bg-white border-pink-200 hover:bg-pink-50 text-gray-800', icon: 'bg-pink-100 text-pink-600' },
};

function PublicationCard({ title, url, icon, color, onClick, disabled, children }: {
  title: string;
  url: string | null;
  icon: React.ReactNode;
  color: 'blue' | 'pink';
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const styles = CARD_STYLES[color];
  const inactive = disabled || !url;
  return (
    <button
      onClick={onClick}
      disabled={inactive}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left',
        inactive ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' : styles.container
      )}
    >
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', inactive ? 'bg-gray-100 text-gray-400' : styles.icon)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{title}</p>
        {url && <p className="text-xs text-gray-400 truncate">{url}</p>}
        {children}
      </div>
      {inactive ? (
        <span title="Publicación automática en proceso..." className="shrink-0">
          <Clock className="w-5 h-5 text-gray-300" />
        </span>
      ) : (
        <ExternalLink className="w-5 h-5 text-gray-400 shrink-0" />
      )}
    </button>
  );
}

function SharePreviewCard({ caption, onCopy, onShare, copied, generating, label, color, icon }: {
  caption: string;
  onCopy: () => void;
  onShare: () => void;
  copied: boolean;
  generating: boolean;
  label: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + '1A', color }}>
            {icon}
          </div>
          <span className="text-xs font-bold uppercase text-gray-600">{label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onCopy}
            disabled={generating}
            aria-label={'Copiar caption de ' + label}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition disabled:opacity-50"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button
            onClick={onShare}
            disabled={generating}
            className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-white rounded-lg transition disabled:opacity-50"
            style={{ backgroundColor: color }}
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
            Compartir
          </button>
        </div>
      </div>
      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 p-2 rounded-lg max-h-32 overflow-y-auto">{caption}</pre>
    </div>
  );
}

function DiffusionTab({ data, onShare, onLogShare, copiedCaptions, setCopiedCaption, generatingShare }: {
  data: ActionCenterData;
  onShare: (platform: 'facebook' | 'instagram' | 'whatsapp') => Promise<boolean>;
  onLogShare: (platform: string) => void;
  copiedCaptions: Record<string, boolean>;
  setCopiedCaption: (platform: string, value: boolean) => void;
  generatingShare: string | null;
}) {
  const { publications, sharePreview, fbSearchGroups } = data;
  const [selectedGroups, setSelectedGroups] = useState<SelectedShareGroup[]>([]);
  const [groupsSaving, setGroupsSaving] = useState(false);
  const [groupsSaved, setGroupsSaved] = useState(false);

  const handleConfirmGroups = async () => {
    if (groupsSaving || groupsSaved || selectedGroups.length === 0) return;
    setGroupsSaving(true);
    try {
      await logShareConfirmation(data.pet.id, 'facebook', selectedGroups);
      setGroupsSaved(true);
    } catch { }
    setGroupsSaving(false);
  };

  const handlePlatformShare = async (platform: 'facebook' | 'instagram' | 'whatsapp') => {
    const ok = await onShare(platform);
    // Loguear solo si el share se completó (no si el usuario lo canceló)
    if (ok) onLogShare(platform);
  };

  return (
    <div className="space-y-4">
      {/* Publicaciones automáticas */}
      <div>
        <h4 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
          <Globe className="w-3.5 h-3.5" /> Publicaciones automáticas
        </h4>
        <div className="space-y-2">
          {publications?.facebook ? (
            <>
              <PublicationCard
                title="Post en Página FB"
                url={publications.facebook.url}
                icon={<MessageCircle className="w-5 h-5" />}
                color="blue"
                onClick={() => window.open(publications.facebook!.url, '_blank')}
              />
              {publications.facebook.group_count > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600 shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-800">Compartido en {publications.facebook.group_count} grupo(s) de FB</p>
                    {publications.facebook.date && (
                      <p className="text-xs text-gray-500">{fmtDate(publications.facebook.date)}</p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <PublicationCard
              title="Post en Página FB"
              url={null}
              icon={<MessageCircle className="w-5 h-5" />}
              color="blue"
              onClick={() => {}}
              disabled
            />
          )}
          {publications?.instagram ? (
            <PublicationCard
              title="Post en Instagram"
              url={publications.instagram.permalink}
              icon={<Camera className="w-5 h-5" />}
              color="pink"
              onClick={() => window.open(publications.instagram!.permalink, '_blank')}
            />
          ) : (
            <PublicationCard
              title="Post en Instagram"
              url={null}
              icon={<Camera className="w-5 h-5" />}
              color="pink"
              onClick={() => {}}
              disabled
            />
          )}
        </div>
      </div>

      {/* Compartir manual + captions */}
      <div>
        <h4 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
          <Share2 className="w-3.5 h-3.5" /> Compartir manual + captions
        </h4>
        <div className="space-y-3">
          <SharePreviewCard
            caption={sharePreview.facebook}
            onCopy={() => { setCopiedCaption('facebook', true); navigator.clipboard.writeText(sharePreview.facebook).catch(() => {}); setTimeout(() => setCopiedCaption('facebook', false), 2000); }}
            onShare={() => handlePlatformShare('facebook')}
            copied={copiedCaptions.facebook}
            generating={generatingShare === 'facebook'}
            label="Facebook"
            color="#3B82F6"
            icon={<MessageCircle className="w-4 h-4" />}
          />
          <SharePreviewCard
            caption={sharePreview.instagram}
            onCopy={() => { setCopiedCaption('instagram', true); navigator.clipboard.writeText(sharePreview.instagram).catch(() => {}); setTimeout(() => setCopiedCaption('instagram', false), 2000); }}
            onShare={() => handlePlatformShare('instagram')}
            copied={copiedCaptions.instagram}
            generating={generatingShare === 'instagram'}
            label="Instagram"
            color="#E4405F"
            icon={<Camera className="w-4 h-4" />}
          />
          <SharePreviewCard
            caption={sharePreview.whatsapp}
            onCopy={() => { setCopiedCaption('whatsapp', true); navigator.clipboard.writeText(sharePreview.whatsapp).catch(() => {}); setTimeout(() => setCopiedCaption('whatsapp', false), 2000); }}
            onShare={() => handlePlatformShare('whatsapp')}
            copied={copiedCaptions.whatsapp}
            generating={generatingShare === 'whatsapp'}
            label="WhatsApp"
            color="#25D366"
            icon={<MessageCircle className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* Registro de difusión en grupos */}
      <div>
        <h4 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
          <Users className="w-3.5 h-3.5" /> ¿Ya compartiste en grupos?
        </h4>
        {groupsSaved ? (
          <p className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm font-bold text-green-700">
            <CheckCircle2 className="w-5 h-5 shrink-0" /> Difusión registrada. ¡Gracias!
          </p>
        ) : (
          <>
            <ShareGroupsPicker
              petId={data.pet.id}
              selected={selectedGroups}
              onChange={setSelectedGroups}
            />
            <button
              onClick={handleConfirmGroups}
              disabled={groupsSaving || selectedGroups.length === 0}
              className="mt-3 w-full py-2.5 rounded-xl font-bold text-sm transition-all bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {groupsSaving ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</span>
              ) : (
                <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Ya compartí{selectedGroups.length > 0 ? ` (${selectedGroups.length})` : ''}</span>
              )}
            </button>
          </>
        )}
      </div>

      {/* Grupos sugeridos */}
      {fbSearchGroups.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> Grupos para compartir (click para abrir)
          </h4>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {fbSearchGroups.slice(0, 12).map(g => (
              <a
                key={g.id}
                href={g.group_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200 hover:bg-blue-100 transition truncate max-w-[180px]"
                title={g.group_name}
              >
                {g.group_name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchTab({ data }: { data: ActionCenterData }) {
  const { pet, fbSearchGroups, recentFindings } = data;
  const [findingUrl, setFindingUrl] = useState('');
  const [findingDesc, setFindingDesc] = useState('');
  const [findingGroup, setFindingGroup] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!findingUrl.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createFinding(pet.id, findingUrl.trim(), findingDesc.trim() || undefined, findingGroup.trim() || undefined);
      setFindingUrl('');
      setFindingDesc('');
      setFindingGroup('');
    } catch (err: any) {
      console.error('Error reporting finding:', err);
      setError(err.message || 'Error al reportar avistamiento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Reportar avistamiento */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
          <Search className="w-4 h-4" /> Reportar avistamiento
        </h4>
        <p className="text-xs text-blue-700 mb-3">
          Si viste a {pet.name} en la calle o en un grupo, dejá el link del post acá. Queda registrado en el timeline del caso y se le notifica al equipo.
        </p>
        <form onSubmit={handleSubmitFinding} className="space-y-3">
          <div>
            <label htmlFor="finding-url" className="text-xs text-gray-600 block mb-1">URL del post/comentario en FB *</label>
            <input
              id="finding-url"
              type="url"
              value={findingUrl}
              onChange={e => setFindingUrl(e.target.value)}
              placeholder="https://facebook.com/groups/.../posts/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="finding-group" className="text-xs text-gray-600 block mb-1">Grupo (opcional)</label>
            <input
              id="finding-group"
              type="text"
              value={findingGroup}
              onChange={e => setFindingGroup(e.target.value)}
              placeholder="Nombre del grupo"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="finding-desc" className="text-xs text-gray-600 block mb-1">Descripción (opcional)</label>
            <textarea
              id="finding-desc"
              value={findingDesc}
              onChange={e => setFindingDesc(e.target.value)}
              placeholder="Detalles del avistamiento..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitting ? 'Enviando...' : 'Reportar avistamiento'}
          </button>
          {!submitting && findingUrl === '' && !error && (
            <p className="text-xs text-green-600 text-center">✅ El avistamiento queda registrado y notifica al reportante</p>
          )}
          {error && <p className="text-xs text-red-600 text-center">{error}</p>}
        </form>
      </div>

      {/* Hallazgos previos */}
      <div>
        <h4 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
          <Bell className="w-3.5 h-3.5" /> Hallazgos previos
        </h4>
        {recentFindings.length === 0 ? (
          <p className="text-sm text-gray-500 px-1">Todavía no hay avistamientos registrados para esta mascota.</p>
        ) : (
          <div className="space-y-2">
            {recentFindings.map(f => (
              <a
                key={f.id}
                href={f.fb_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white border border-gray-200 rounded-xl p-3 hover:bg-gray-50 transition"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-blue-700 truncate">{f.group_name || 'Avistamiento'}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(f.created_at)}</span>
                </div>
                {f.description && <p className="text-xs text-gray-600 line-clamp-2">{f.description}</p>}
                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                  Ver post <ExternalLink className="w-3 h-3" />
                </p>
              </a>
            ))}
          </div>
        )}
        <button
          onClick={() => window.open(`/pet/${pet.id}`, '_blank')}
          className="w-full mt-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-left hover:bg-gray-50 transition flex items-center gap-3"
        >
          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          <div>
            <p className="font-medium text-gray-800">Ver timeline completo en la ficha</p>
            <p className="text-xs text-gray-500">Avistamientos, hallazgos y eventos registrados</p>
          </div>
        </button>
      </div>

      {/* Compartir en grupos de búsqueda */}
      {fbSearchGroups.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> Grupos de búsqueda (click para abrir)
          </h4>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {fbSearchGroups.slice(0, 12).map(g => (
              <a
                key={g.id}
                href={g.group_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200 hover:bg-blue-100 transition truncate max-w-[180px]"
                title={g.group_name}
              >
                {g.group_name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function buildWaLink(phone: string | undefined | null, message: string): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function TransitTab({ pet }: { pet: ActionCenterData['pet'] }) {
  const [showReqs, setShowReqs] = useState(false);
  const transitMsg = `¡Hola! Soy voluntario/a de Sigo Tu Huella y me ofrezco como hogar de tránsito para ${pet.name} 🐾. ¿Cómo podemos coordinar?`;
  const waOffer = buildWaLink(pet.reporter_phone, transitMsg);

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2">
          <Home className="w-4 h-4" /> Ofrecer hogar de tránsito
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          ¿Podés cuidar temporalmente a <strong>{pet.name}</strong> hasta que encuentre hogar definitivo?
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          {waOffer ? (
            <a
              href={waOffer}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-center"
            >
              <MessageCircle className="w-4 h-4" /> Me ofrezco como tránsito
            </a>
          ) : (
            <button
              onClick={() => alert('No hay teléfono de contacto para esta mascota. Escribinos por la página de Colaborar y te ayudamos a coordinar.')}
              className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition"
            >
              Me ofrezco como tránsito
            </button>
          )}
          <button
            onClick={() => setShowReqs(v => !v)}
            className="flex-1 py-2 bg-white border border-emerald-300 text-emerald-700 rounded-lg font-medium text-sm hover:bg-emerald-50 transition"
          >
            {showReqs ? 'Ocultar requisitos' : 'Ver requisitos'}
          </button>
        </div>
        {showReqs && (
          <ul className="mt-3 space-y-1 text-xs text-gray-600 bg-white/70 rounded-lg p-3">
            <li>• Tener un espacio seguro y cerrado (no suelto en la calle).</li>
            <li>• Poder separarlo de otras mascotas los primeros días.</li>
            <li>• Alimento y agua a diario (la agrupación puede ayudar con insumos).</li>
            <li>• Llevarlo al vet si lo necesita y avisar ante cualquier novedad.</li>
            <li>• Compromiso de cuidado mientras se busca adoptante definitivo.</li>
          </ul>
        )}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <MessageCircle className="w-4 h-4" /> Contactar reportante
        </h4>
        {pet.reporter_phone ? (
          <a
            href={buildWaLink(pet.reporter_phone, `¡Hola! Vi a ${pet.name} en Sigo Tu Huella y quisiera consultar sobre él/ella.`) || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp al reportante
          </a>
        ) : (
          <p className="text-sm text-gray-500 text-center">No hay teléfono de contacto disponible</p>
        )}
      </div>
    </div>
  );
}

function TransferTab({ pet }: { pet: ActionCenterData['pet'] }) {
  const transferMsg = `¡Hola! Vi el caso de ${pet.name} en Sigo Tu Huella y ofrezco ayudar con un traslado 🚗 (al vet, a un hogar de tránsito o a una jornada de adopción). ¿Qué necesitan?`;
  const waOffer = buildWaLink(pet.reporter_phone, transferMsg);

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4" /> Coordinar traslado
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          ¿Tenés vehículo y podés trasladar a <strong>{pet.name}</strong> al vet, a un tránsito o a una jornada de adopción?
        </p>
        {waOffer ? (
          <a
            href={waOffer}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2 bg-amber-600 text-white rounded-lg font-medium text-sm hover:bg-amber-700 transition flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" /> Ofrecer traslado por WhatsApp
          </a>
        ) : (
          <button
            onClick={() => alert('No hay teléfono de contacto para esta mascota. Escribinos por la página de Colaborar y te sumamos al grupo de traslados.')}
            className="w-full py-2 bg-amber-600 text-white rounded-lg font-medium text-sm hover:bg-amber-700 transition"
          >
            Ofrecer traslado
          </button>
        )}
        <p className="text-[11px] text-gray-500 mt-3">
          Se abre WhatsApp con un mensaje ya redactado para coordinar con quien reportó el caso.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-gray-700 mb-2">Tips para el traslado</h4>
        <ul className="space-y-1 text-xs text-gray-600">
          <li>• Usá transportadora o caja ventilada (nunca suelto en el auto).</li>
          <li>• Llevá una manta vieja: ayuda a calmarlo y protege el asiento.</li>
          <li>• Ventanas entreabiertas y música baja.</li>
          <li>• Confirmá horario y dirección con el reportante antes de salir.</li>
        </ul>
      </div>
    </div>
  );
}

function CopyFieldButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
          () => {}
        );
      }}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition text-left"
    >
      <span className="min-w-0">
        <span className="block text-[10px] uppercase text-gray-400 font-bold">{label}</span>
        <span className="block text-sm text-gray-800 font-mono truncate">{value}</span>
      </span>
      {copied ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <Copy className="w-4 h-4 text-gray-400 shrink-0" />}
    </button>
  );
}

function DonorTab({ pet, onNavigate }: { pet: ActionCenterData['pet']; onNavigate?: (url: string) => void }) {
  const [accounts, setAccounts] = useState<CollaborationAccount[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCollaborationAccounts()
      .then(list => { if (!cancelled) setAccounts(list.filter(a => a.mercadopago_link || a.cbu || a.cvu || a.alias)); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-red-800 mb-3 flex items-center gap-2">
          <Heart className="w-4 h-4" /> Necesidades de {pet.name}
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          Según su estado (<span className="font-medium capitalize">{(pet.status || '').replace(/_/g, ' ')}</span>), puede necesitar:
        </p>
        <ul className="space-y-1 text-sm text-gray-700">
          <li>• Alimento específico (cachorro/senior/renal)</li>
          <li>• Medicación / antiparasitarios</li>
          <li>• Camita / manta / transportadora</li>
          <li>• Gastos veterinarios (vacunas, castración, estudios)</li>
        </ul>
        <p className="text-xs text-gray-500 mt-3">
          Coordiná la entrega de insumos escribiendo al reportante desde la solapa "Hogar Tránsito".
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-gray-800 mb-3">Formas de donar</h4>
        {loadError && (
          <p className="text-sm text-gray-500 mb-3">No se pudieron cargar los datos de pago. Podés donar desde la página de Colaborar.</p>
        )}
        {accounts !== null && accounts.length === 0 && !loadError && (
          <p className="text-sm text-gray-500 mb-3">Todavía no hay cuentas cargadas. Podés colaborar desde la página de Colaborar.</p>
        )}
        {accounts && accounts.length > 0 && (
          <div className="space-y-3">
            {accounts.map(acc => (
              <div key={acc.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="font-medium text-sm text-gray-800">{acc.title}{acc.bank_name ? ` · ${acc.bank_name}` : ''}</p>
                {acc.alias && <CopyFieldButton label="Alias" value={acc.alias} />}
                {acc.cbu && <CopyFieldButton label="CBU" value={acc.cbu} />}
                {acc.cvu && <CopyFieldButton label="CVU" value={acc.cvu} />}
                {acc.mercadopago_link && (
                  <a
                    href={acc.mercadopago_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 bg-[#00AEEF] text-white rounded-lg font-medium text-sm hover:brightness-95 transition flex items-center justify-center gap-2"
                  >
                    <Heart className="w-4 h-4" /> Donar por Mercado Pago
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => onNavigate?.('/collaborate')}
          className="w-full mt-3 py-2 bg-white border border-brand-accent text-brand-primary rounded-lg font-medium text-sm hover:bg-brand-bg transition"
        >
          Ver página de Colaborar
        </button>
      </div>
    </div>
  );
}

function OtherTab({ pet, onNavigate }: { pet: ActionCenterData['pet']; onNavigate?: (url: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-gray-800 mb-3">Info completa de {pet.name}</h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-gray-500">Especie</dt><dd className="font-medium">{SPECIES_LABEL[pet.species] || pet.species} {SPECIES_EMOJI[pet.species] || ''}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Raza</dt><dd className="font-medium">{pet.breed || 'Mestizo'}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Sexo / Edad</dt><dd className="font-medium">{pet.gender || '-'} / {pet.age || '-'}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Color</dt><dd className="font-medium">{pet.color || '-'}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Ubicación</dt><dd className="font-medium break-words text-right">{pet.location || '-'}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Contacto</dt><dd className="font-medium text-right">{pet.contact_info || pet.reporter_phone || 'Ver en ficha'}</dd></div>
        </dl>
      </div>

      {pet.description && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-bold text-gray-700 mb-2">Descripción</h4>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{pet.description}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => onNavigate?.(`/pet/${pet.id}`)}
          className="flex-1 py-2 bg-brand-primary text-white rounded-lg font-medium text-sm hover:shadow transition"
        >
          Ver ficha completa
        </button>
        {pet.reporter_phone && (
          <a
            href={buildWaLink(pet.reporter_phone, `¡Hola! Quiero ayudar con ${pet.name} (caso en Sigo Tu Huella) 🐾`) || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

export default function VolunteerActionCenter({ petId, onClose, onNavigate }: VolunteerActionCenterProps) {
  const [data, setData] = useState<ActionCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CategoryKey>('difusion');
  const [copiedCaptions, setCopiedCaptionsState] = useState<Record<string, boolean>>({});
  const [generatingShare, setGeneratingShare] = useState<string | null>(null);

  const setCopiedCaption = useCallback((platform: string, value: boolean) => {
    setCopiedCaptionsState(prev => ({ ...prev, [platform]: value }));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getActionCenterData(petId);
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [petId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Ajustar tab activo cuando llegan las categorías del voluntario
  const volunteerTabs = data
    ? (data.volunteerCategories.filter(c => c in CATEGORY_CONFIG) as CategoryKey[])
    : [];
  const availableTabs = volunteerTabs.length > 0 ? volunteerTabs : (['difusion'] as CategoryKey[]);
  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [availableTabs.join(','), activeTab]);

  /**
   * Comparte con imagen real descargada (mismo origen, sin CORS).
   * Devuelve true solo si el usuario completó el flujo de compartir.
   */
  const handleShare = async (platform: 'facebook' | 'instagram' | 'whatsapp'): Promise<boolean> => {
    if (!data) return false;
    setGeneratingShare(platform);
    const { pet, sharePreview } = data;
    const petUrl = `${window.location.origin}/pet/${pet.id}`;
    const caption = sharePreview[platform];
    const statusStyle = STATUS_STYLES[(pet.status || '').toLowerCase()] || { label: 'MASCOTA', color: '#6B7280', bg: 'bg-gray-100 text-gray-700' };

    try {
      // Descargar la primera foto (thumb same-origin) para adjuntarla al share
      let file: File | null = null;
      try {
        const res = await fetch(apiUrl(`/api/images/pet-thumb/${pet.id}/0`));
        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 0) file = new File([blob], `${pet.name || 'mascota'}.jpg`, { type: blob.type || 'image/jpeg' });
        }
      } catch {
        // sin foto disponible: compartir solo texto
      }

      const baseData: Record<string, any> = {
        title: `${pet.name || 'Mascota'} - ${statusStyle.label}`,
        text: caption,
        url: petUrl,
      };
      if (file) baseData.files = [file];

      if (typeof navigator.share === 'function') {
        let shareData = { ...baseData };
        if (navigator.canShare && !navigator.canShare(shareData)) {
          delete shareData.files; // reintentar solo texto
          shareData = { ...baseData };
          delete shareData.files;
        }
        if (!navigator.canShare || navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return true;
        }
      }

      // Desktop fallback
      if (platform === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(caption + '\n\n' + petUrl)}`, '_blank');
        return true;
      }
      if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(petUrl)}&quote=${encodeURIComponent(caption)}`, '_blank');
        return true;
      }
      if (platform === 'instagram') {
        let copied = false;
        try {
          await navigator.clipboard.writeText(caption);
          copied = true;
        } catch {
          // sin permiso de clipboard
        }
        alert(
          (copied ? 'Caption copiado.\n\n' : 'No se pudo copiar el caption automáticamente: copialo desde el cuadro de texto.\n\n') +
          'Para Instagram: guardá la foto de la mascota desde su ficha, creá un post nuevo y pegá el texto.'
        );
        window.open('https://www.instagram.com', '_blank', 'noopener,noreferrer');
        return true;
      }
      return false;
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        return false; // usuario canceló: no loguear
      }
      console.error('Share error:', e);
      alert('No se pudo compartir. Probá de nuevo.');
      return false;
    } finally {
      setGeneratingShare(null);
    }
  };

  const handleLogShare = useCallback(async (platform: string) => {
    try {
      await logShare(petId, platform);
    } catch (err) {
      console.error('Error logging share:', err);
    }
  }, [petId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Centro de acción de voluntarios"
          className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col"
        >
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
          </div>
        </motion.div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Error al cargar el centro de acción"
          className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="font-bold text-lg text-gray-800 mb-2">Error al cargar</h3>
          <p className="text-gray-500 mb-4">{error || 'No se pudo cargar la información'}</p>
          <div className="flex gap-2 justify-center">
            <button onClick={loadData} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition">
              Reintentar
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-brand-primary text-white rounded-lg font-medium hover:shadow transition">
              Cerrar
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const { pet, publications } = data;
  const statusStyle = STATUS_STYLES[(pet.status || '').toLowerCase()] || { label: 'MASCOTA', color: '#6B7280', bg: 'bg-gray-100 text-gray-700' };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        role="dialog"
        aria-modal="true"
        aria-label={`Centro de acción para ${pet.name}`}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10 rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button onClick={onClose} aria-label="Cerrar" className="p-1 rounded-full hover:bg-gray-100 transition shrink-0">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl">{SPECIES_EMOJI[pet.species] || '🐾'}</span>
                <h3 className="font-bold text-lg text-brand-dark truncate">{pet.name}</h3>
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', statusStyle.bg)}>
                  {statusStyle.label}
                </span>
                {data?.expired ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                    Publicación vencida
                  </span>
                ) : typeof data?.days_left === 'number' && data.days_left >= 0 && data.days_left <= 7 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                    Vence en {data.days_left}d
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-gray-500 truncate">{pet.location || 'Sin ubicación'}</p>
            </div>
          </div>
          {pet.case_number && (
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full shrink-0">Caso: {pet.case_number}</span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-gray-100 overflow-x-auto bg-white/95 backdrop-blur-sm sticky top-[60px] z-10">
          {availableTabs.map(cat => (
            <CategoryTabButton
              key={cat}
              category={cat}
              isActive={activeTab === cat}
              onClick={() => setActiveTab(cat)}
            />
          ))}
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto p-4 sm:p-5 flex-1">
          <AnimatePresence mode="wait">
            {activeTab === 'difusion' && (
              <motion.div
                key="difusion"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <DiffusionTab
                  key={data.pet.id}
                  data={data}
                  onShare={handleShare}
                  onLogShare={handleLogShare}
                  copiedCaptions={copiedCaptions}
                  setCopiedCaption={setCopiedCaption}
                  generatingShare={generatingShare}
                />
              </motion.div>
            )}
            {activeTab === 'busqueda' && (
              <motion.div
                key="busqueda"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <SearchTab data={data} />
              </motion.div>
            )}
            {activeTab === 'hogar_transito' && (
              <motion.div
                key="hogar_transito"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <TransitTab pet={pet} />
              </motion.div>
            )}
            {activeTab === 'traslado' && (
              <motion.div
                key="traslado"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <TransferTab pet={pet} />
              </motion.div>
            )}
            {activeTab === 'donante' && (
              <motion.div
                key="donante"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <DonorTab pet={pet} onNavigate={onNavigate} />
              </motion.div>
            )}
            {activeTab === 'otra' && (
              <motion.div
                key="otra"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <OtherTab pet={pet} onNavigate={onNavigate} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-4 bg-gray-50 rounded-b-2xl">
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => onNavigate?.(`/pet/${pet.id}`)}
              className="px-4 py-2 bg-white border border-brand-accent text-brand-primary rounded-xl font-medium text-sm hover:bg-brand-bg transition"
            >
              Ver ficha completa
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-200 transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
