import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Share2, MessageCircle, Camera, Search, MapPin, Heart, Home, Truck, Plus, CheckCircle2, AlertTriangle, Copy, ExternalLink, Clock, Users, Loader2, Globe, Bell } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getActionCenterData, logShare, ActionCenterData, SharePreview } from '@/src/lib/volunteerService';

// Need useState for SearchTab
import { useState } from 'react';

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  lost: { label: 'PERDIDO', color: '#EF4444', bg: 'bg-red-100 text-red-700' },
  sighted: { label: 'AVISTADO', color: '#F59E0B', bg: 'bg-amber-100 text-amber-700' },
  retained: { label: 'RETENIDO', color: '#3B82F6', bg: 'bg-blue-100 text-blue-700' },
  accidented: { label: 'ACCIDENTADO', color: '#EF4444', bg: 'bg-red-100 text-red-700' },
  needs_attention: { label: 'NECESITA ATENCIÓN', color: '#8B5CF6', bg: 'bg-purple-100 text-purple-700' },
  for_adoption: { label: 'EN ADOPCIÓN', color: '#10B981', bg: 'bg-emerald-100 text-emerald-700' },
  for_adoption_simple: { label: 'EN ADOPCIÓN', color: '#F97316', bg: 'bg-orange-100 text-orange-700' },
  adopted: { label: 'ADOPTADO', color: '#10B981', bg: 'bg-green-100 text-green-700' },
  reunited: { label: 'REENCUENTRO', color: '#10B981', bg: 'bg-green-100 text-green-700' },
  transitada: { label: 'EN TRÁNSITO', color: '#0D9488', bg: 'bg-teal-100 text-teal-700' },
};

const SPECIES_EMOJI: Record<string, string> = { dog: '🐶', cat: '🐱', other: '🐾' };
const SPECIES_LABEL: Record<string, string> = { dog: 'Perro', cat: 'Gato', other: 'Otro' };

const CATEGORY_CONFIG = {
  difusion: { label: 'Difusión', icon: Share2, color: 'bg-purple-100 text-purple-700', description: 'Compartir en redes y grupos' },
  busqueda: { label: 'Búsqueda', icon: Search, color: 'bg-blue-100 text-blue-700', description: 'Reportar avistamientos y hallazgos' },
  hogar_transito: { label: 'Hogar Tránsito', icon: Home, color: 'bg-emerald-100 text-emerald-700', description: 'Ofrecer hogar temporal' },
  traslado: { label: 'Traslado', icon: Truck, color: 'bg-amber-100 text-amber-700', description: 'Coordinar traslados' },
  donante: { label: 'Donante', icon: Heart, color: 'bg-red-100 text-red-700', description: 'Donar insumos/medicación' },
  otra: { label: 'Otra', icon: Plus, color: 'bg-gray-100 text-gray-700', description: 'Otras formas de ayudar' },
} as const;

type CategoryKey = keyof typeof CATEGORY_CONFIG;

interface VolunteerActionCenterProps {
  petId: string;
  onClose: () => void;
  onNavigate?: (url: string) => void;
}

function CategoryTabButton({ category, isActive, onClick, hasData }: {
  category: CategoryKey;
  isActive: boolean;
  onClick: () => void;
  hasData: boolean;
}) {
  const cfg = CATEGORY_CONFIG[category];
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 font-medium text-xs whitespace-nowrap transition-all min-w-[70px]',
        isActive
          ? cfg.color.replace('100', '500').replace('700', 'white') + ' border-current shadow-lg'
          : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
      )}
      title={cfg.description}
    >
      <cfg.icon className="w-4 h-4" />
      <span>{cfg.label}</span>
      {!hasData && !isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
      )}
    </button>
  );
}

function PublicationCard({ title, url, icon, color, onClick, disabled, children }: {
  title: string;
  url: string | null;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || !url}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
        disabled || !url
          ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
          : `bg-white border-${color}-200 hover:bg-${color}-50 text-gray-800`
      )}
    >
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{title}</p>
        {url && <p className="text-xs text-gray-400 truncate">{url}</p>}
      </div>
      {disabled ? (
        <Clock className="w-5 h-5 text-gray-300" title="Publicación automática en proceso..." />
      ) : url ? (
        <ExternalLink className="w-5 h-5 text-gray-400" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-amber-400" />
      )}
    </button>
  );
}

function SharePreviewCard({ platform, caption, onCopy, onShare, copied, generating, label, color, icon }: {
  platform: 'facebook' | 'instagram' | 'whatsapp';
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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
            {icon}
          </div>
          <span className="text-xs font-bold uppercase text-gray-600">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            disabled={generating}
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
  onShare: (platform: 'facebook' | 'instagram' | 'whatsapp') => void;
  onLogShare: (platform: string, groups?: { name: string; url: string }[]) => void;
  copiedCaptions: Record<string, boolean>;
  setCopiedCaption: (platform: string, value: boolean) => void;
  generatingShare: string | null;
}) {
  const { publications, sharePreview, fbSearchGroups, pet } = data;
  const petUrl = `${window.location.origin}/pet/${pet.id}`;

  const handleFbShare = async (groups?: { name: string; url: string }[]) => {
    if (publications?.facebook?.pagePostUrl) {
      await onShare('facebook');
      onLogShare('facebook', groups);
    }
  };

  const handleIgShare = async () => {
    if (publications?.instagram?.permalink) {
      await onShare('instagram');
      onLogShare('instagram');
    }
  };

  const handleWaShare = async (groups?: { name: string; url: string }[]) => {
    await onShare('whatsapp');
    onLogShare('whatsapp', groups);
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
                url={publications.facebook.pagePostUrl}
                icon={<MessageCircle className="w-5 h-5" />}
                color="blue"
                onClick={() => window.open(publications.facebook!.pagePostUrl, '_blank')}
              />
              {publications.facebook.groupPosts.length > 0 && (
                <PublicationCard
                  title={`Compartido en ${publications.facebook.groupPosts.length} grupo(s) FB`}
                  url={publications.facebook.groupPosts[0].postUrl}
                  icon={<Users className="w-5 h-5" />}
                  color="blue"
                  onClick={() => window.open(publications.facebook!.groupPosts[0].postUrl, '_blank')}
                >
                  <span className="text-xs text-blue-600">Ver todos ({publications.facebook.groupPosts.length})</span>
                </PublicationCard>
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
            platform="facebook"
            caption={sharePreview.facebook}
            onCopy={() => { setCopiedCaption('facebook', true); navigator.clipboard.writeText(sharePreview.facebook); setTimeout(() => setCopiedCaption('facebook', false), 2000); }}
            onShare={() => handleFbShare()}
            copied={copiedCaptions.facebook}
            generating={generatingShare === 'facebook'}
            label="Facebook"
            color="#3B82F6"
            icon={<MessageCircle className="w-4 h-4" />}
          />
          <SharePreviewCard
            platform="instagram"
            caption={sharePreview.instagram}
            onCopy={() => { setCopiedCaption('instagram', true); navigator.clipboard.writeText(sharePreview.instagram); setTimeout(() => setCopiedCaption('instagram', false), 2000); }}
            onShare={() => handleIgShare()}
            copied={copiedCaptions.instagram}
            generating={generatingShare === 'instagram'}
            label="Instagram"
            color="#E4405F"
            icon={<Camera className="w-4 h-4" />}
          />
          <SharePreviewCard
            platform="whatsapp"
            caption={sharePreview.whatsapp}
            onCopy={() => { setCopiedCaption('whatsapp', true); navigator.clipboard.writeText(sharePreview.whatsapp); setTimeout(() => setCopiedCaption('whatsapp', false), 2000); }}
            onShare={() => handleWaShare()}
            copied={copiedCaptions.whatsapp}
            generating={generatingShare === 'whatsapp'}
            label="WhatsApp"
            color="#25D366"
            icon={<MessageCircle className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* Grupos sugeridos */}
      {fbSearchGroups.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> Grupos para compartir (click para abrir)
          </h4>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {fbSearchGroups.slice(0, 10).map(g => (
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

function SearchTab({ data, onLogShare }: {
  data: ActionCenterData;
  onLogShare: (platform: string, groups?: { name: string; url: string }[]) => void;
}) {
  const { pet, fbSearchGroups } = data;
  const [findingUrl, setFindingUrl] = useState('');
  const [findingDesc, setFindingDesc] = useState('');
  const [findingGroup, setFindingGroup] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmitFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!findingUrl.trim()) return;
    setSubmitting(true);
    try {
      await logShare('finding', [{ name: findingGroup || 'Grupo FB', url: findingUrl }]);
      setSuccess(true);
      setFindingUrl('');
      setFindingDesc('');
      setFindingGroup('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error reporting finding:', err);
      alert('Error al reportar avistamiento');
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
        <form onSubmit={handleSubmitFinding} className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 block mb-1">URL del post/comentario en FB *</label>
            <input
              type="url"
              value={findingUrl}
              onChange={e => setFindingUrl(e.target.value)}
              placeholder="https://facebook.com/groups/.../posts/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Grupo (opcional)</label>
            <input
              type="text"
              value={findingGroup}
              onChange={e => setFindingGroup(e.target.value)}
              placeholder="Nombre del grupo"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Descripción (opcional)</label>
            <textarea
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
            className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Reportar avistamiento'}
          </button>
          {success && <p className="text-xs text-green-600 text-center">✅ Avistamiento reportado al timeline del caso</p>}
        </form>
      </div>

      {/* Ver hallazgos previos */}
      <div>
        <h4 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
          <Bell className="w-3.5 h-3.5" /> Hallazgos previos
        </h4>
        <button
          onClick={() => window.open(`/pet/${pet.id}`, '_blank')}
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-left hover:bg-gray-50 transition flex items-center gap-3"
        >
          <CheckCircle2 className="w-5 h-5 text-green-500" />
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
            <Users className="w-3.5 h-3.5" /> Compartir en grupos de búsqueda
          </h4>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {fbSearchGroups.slice(0, 10).map(g => (
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

function TransitTab({ pet }: { pet: ActionCenterData['pet'] }) {
  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2">
          <Home className="w-4 h-4" /> Ofrecer hogar de tránsito
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          ¿Podés cuidar temporalmente a <strong>{pet.name}</strong> hasta que encuentre hogar definitivo?
        </p>
        <div className="flex gap-2">
          <button className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition">
            Me ofrezco como tránsito
          </button>
          <button className="flex-1 py-2 bg-white border border-emerald-300 text-emerald-700 rounded-lg font-medium text-sm hover:bg-emerald-50 transition">
            Ver requisitos
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4" /> Coordinar traslado
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          ¿Tenés vehículo y podés trasladar a <strong>{pet.name}</strong> a vet, tránsito o adopción?
        </p>
        <button className="w-full py-2 bg-amber-600 text-white rounded-lg font-medium text-sm hover:bg-amber-700 transition">
          Ofrecer traslado
        </button>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <MessageCircle className="w-4 h-4" /> Contactar reportante
        </h4>
        {pet.reporter_phone && (
          <a href={`https://wa.me/${pet.reporter_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-full py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition flex items-center justify-center gap-2">
            <MessageCircle className="w-4 h-4" /> WhatsApp al reportante
          </a>
        )}
        {!pet.reporter_phone && <p className="text-sm text-gray-500 text-center">No hay teléfono de contacto disponible</p>}
      </div>
    </div>
  );
}

function DonorTab({ pet }: { pet: ActionCenterData['pet'] }) {
  return (
    <div className="space-y-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-red-800 mb-3 flex items-center gap-2">
          <Heart className="w-4 h-4" /> Necesidades de {pet.name}
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          Según su estado (<span className="font-medium capitalize">{pet.status.replace(/_/g, ' ')}</span>), puede necesitar:
        </p>
        <ul className="space-y-1 text-sm text-gray-700">
          <li>• Alimento específico (cachorro/senior/renal)</li>
          <li>• Medicación / antiparasitarios</li>
          <li>• Camita / manta / transportadora</li>
          <li>• Gastos veterinarios (vacunas, castración, estudios)</li>
        </ul>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-gray-800 mb-3">Formas de donar</h4>
        <div className="grid grid-cols-2 gap-2">
          <button className="py-2 bg-brand-primary text-white rounded-lg font-medium text-sm hover:shadow transition">
            Mercado Pago
          </button>
          <button className="py-2 bg-white border border-brand-accent text-brand-primary rounded-lg font-medium text-sm hover:bg-brand-bg transition">
            Transferencia (CBU/CVU)
          </button>
        </div>
      </div>
    </div>
  );
}

function OtherTab({ pet }: { pet: ActionCenterData['pet'] }) {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-gray-800 mb-3">Info completa de {pet.name}</h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-gray-500">Especie</dt><dd className="font-medium">{SPECIES_LABEL[pet.species] || pet.species} {SPECIES_EMOJI[pet.species] || ''}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Raza</dt><dd className="font-medium">{pet.breed || 'Mestizo'}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Sexo / Edad</dt><dd className="font-medium">{pet.gender || '-'} / {pet.age || '-'}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Color</dt><dd className="font-medium">{pet.color || '-'}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Ubicación</dt><dd className="font-medium">{pet.location || '-'}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Contacto</dt><dd className="font-medium">{pet.contact_info || pet.reporter_phone || 'Ver en ficha'}</dd></div>
        </dl>
      </div>

      {pet.description && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-bold text-gray-700 mb-2">Descripción</h4>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{pet.description}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button className="flex-1 py-2 bg-brand-primary text-white rounded-lg font-medium text-sm hover:shadow transition">
          Ver ficha completa
        </button>
        {pet.reporter_phone && (
          <a href={`https://wa.me/${pet.reporter_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition flex items-center justify-center gap-2">
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
  const [copiedCaptions, setCopiedCaptions] = useState<Record<string, boolean>>({});
  const [generatingShare, setGeneratingShare] = useState<string | null>(null);

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

  const availableTabs = data ? data.volunteerCategories.filter(c => CATEGORY_CONFIG[c as CategoryKey]) : [];
  if (availableTabs.length === 0) {
    availableTabs.push('otra');
  }
  if (!availableTabs.includes(activeTab)) {
    setActiveTab(availableTabs[0]);
  }

  const handleShare = async (platform: 'facebook' | 'instagram' | 'whatsapp') => {
    if (!data) return;
    setGeneratingShare(platform);
    const { pet, sharePreview } = data;
    const petUrl = `${window.location.origin}/pet/${pet.id}`;
    const caption = sharePreview[platform];
    const statusStyle = STATUS_STYLES[pet.status] || { label: 'MASCOTA', color: '#6B7280' };

    try {
      const file = new File([], `${pet.name || 'mascota'}-${platform}.jpg`, { type: 'image/jpeg' });
      const shareData = {
        title: `${pet.name || 'Mascota'} - ${statusStyle.label}`,
        text: caption,
        url: petUrl,
        files: [file],
      };

      if (navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        // Desktop fallback
        if (platform === 'whatsapp') {
          window.open(`https://wa.me/?text=${encodeURIComponent(caption + '\n\n' + petUrl)}`, '_blank');
        } else if (platform === 'facebook') {
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(petUrl)}&quote=${encodeURIComponent(caption)}`, '_blank');
        } else if (platform === 'instagram') {
          await navigator.clipboard.writeText(caption);
          alert('Caption copiado. La imagen está lista. Abrí Instagram, creá post nuevo, pegá el texto y subí la imagen.');
          window.open('https://www.instagram.com', '_blank', 'noopener,noreferrer');
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error('Share error:', e);
    } finally {
      setGeneratingShare(null);
    }
  };

  const handleLogShare = async (platform: string, groups?: { name: string; url: string }[]) => {
    try {
      await logShare(petId, platform, groups);
    } catch (err) {
      console.error('Error logging share:', err);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
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
          className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="font-bold text-lg text-gray-800 mb-2">Error al cargar</h3>
          <p className="text-gray-500 mb-4">{error || 'No se pudo cargar la información'}</p>
          <button onClick={onClose} className="px-4 py-2 bg-brand-primary text-white rounded-lg font-medium hover:shadow transition">
            Cerrar
          </button>
        </motion.div>
      </div>
    );
  }

  const { pet, publications, sharePreview } = data;
  const statusStyle = STATUS_STYLES[pet.status] || { label: 'MASCOTA', color: '#6B7280', bg: 'bg-gray-100 text-gray-700' };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10 rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 transition shrink-0">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl">{SPECIES_EMOJI[pet.species] || '🐾'}</span>
                <h3 className="font-bold text-lg text-brand-dark truncate">{pet.name}</h3>
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', statusStyle.bg)}>
                  {statusStyle.label}
                </span>
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
              hasData={
                (cat === 'difusion' && (publications?.facebook || publications?.instagram)) ||
                (cat === 'busqueda') ||
                (cat === 'hogar_transito') ||
                (cat === 'traslado') ||
                (cat === 'donante') ||
                true
              }
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
                  data={data}
                  onShare={handleShare}
                  onLogShare={handleLogShare}
                  copiedCaptions={copiedCaptions}
                  setCopiedCaption={setCopiedCaptions}
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
                <SearchTab data={data} onLogShare={handleLogShare} />
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
                <TransitTab pet={pet} />
              </motion.div>
            )}
            {activeTab === 'donante' && (
              <motion.div
                key="donante"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <DonorTab pet={pet} />
              </motion.div>
            )}
            {activeTab === 'otra' && (
              <motion.div
                key="otra"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <OtherTab pet={pet} />
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