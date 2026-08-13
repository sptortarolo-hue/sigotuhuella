import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/hooks/useAuth';
import { getPetCoordinates } from '@/src/lib/petService';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';
import { Loader2, MapPin, Calendar, Heart, ArrowLeft, Share2, BadgeCheck, Eye, BellRing, Star, ShieldAlert } from 'lucide-react';
import CaseTimeline from '@/src/components/CaseTimeline';
import CaseMap from '@/src/components/CaseMap';
import SightingModal from '@/src/components/SightingModal';
import CaseShares from '@/src/components/CaseShares';
import CaseActions from '@/src/components/CaseActions';
import CaseImpact from '@/src/components/CaseImpact';

const DEFAULT_CENTER = { lat: -34.9961, lng: -57.8524 };

function getApproxCenter(pet: any): { lat: number; lng: number } | null {
  const ns = Array.isArray(pet.neighborhoods) ? pet.neighborhoods : (() => { try { return JSON.parse(pet.neighborhoods || '[]'); } catch { return []; } })();
  const centers = ns.map((id: string) => NEIGHBORHOODS.find(n => n.id === id)?.center).filter(Boolean) as { lat: number; lng: number }[];
  if (centers.length === 0) return null;
  return { lat: centers.reduce((s, c) => s + c.lat, 0) / centers.length, lng: centers.reduce((s, c) => s + c.lng, 0) / centers.length };
}

const STATUS_LABELS: Record<string, string> = {
  active: 'En búsqueda',
  closed: 'Cerrado',
  pause: 'Pausado',
};

const TYPE_LABELS: Record<string, string> = {
  lost: 'Perdida',
  found: 'Encontrada',
};

const PET_STATUS_LABELS: Record<string, string> = {
  lost: 'Perdido', retained: 'Retenido', sighted: 'Avistado', accidented: 'Accidentado',
  needs_attention: 'Necesita Atención', for_adoption: 'En Adopción', for_adoption_simple: 'Adopción',
  adopted: 'Adoptado', reunited: 'Reencontrado', transitada: 'En Tránsito',
};

export default function CaseDashboard() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendingAlert, setSendingAlert] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSightingModal, setShowSightingModal] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  const refresh = async () => {
    const res = await api.cases.get(id!);
    setData(res.case);
  };

  useEffect(() => {
    let alive = true;
    const fetchCase = async () => {
      try {
        const res = await api.cases.get(id!);
        if (alive) setData(res.case);
      } catch (e: any) {
        if (alive) setError(e.message || 'Caso no encontrado');
      } finally {
        if (alive) setLoading(false);
      }
    };
    fetchCase();
    return () => { alive = false; };
  }, [id]);

  const handleToggleSighting = async (sightingId: string, hidden: boolean) => {
    try {
      await api.cases.hideSighting(sightingId, hidden);
      await refresh();
    } catch (e: any) {
      alert(e.message || 'Error al actualizar avistamiento');
    }
  };

  const isOwner = data && user && (data.reporter_id === user.id || data.pet?.created_by === user.id);
  const pet = data?.pet || {};
  const isFollowing = !!data?.is_following;

  const handleToggleFollow = async () => {
    if (!user) {
      alert('Iniciá sesión para seguir casos');
      return;
    }
    setFollowBusy(true);
    try {
      if (isFollowing) await api.cases.unfollow(data.id);
      else await api.cases.follow(data.id);
      await refresh();
    } catch (e: any) {
      alert(e.message || 'Error al actualizar el seguimiento');
    } finally {
      setFollowBusy(false);
    }
  };

  const handleReportPhone = async () => {
    if (!user) {
      alert('Iniciá sesión para reportar un teléfono');
      return;
    }
    const phone = prompt('Ingresá el número de teléfono sospechoso (ej: 5492211234567):');
    if (!phone || !phone.trim()) return;
    const reason = prompt('¿Por qué lo reportás? (opcional)', '') || '';
    setReportBusy(true);
    try {
      await api.blacklist.report({ phone: phone.trim(), context_type: 'sighting', context_id: data.id, reason: reason.trim() || null });
      alert('Reporte enviado. El equipo lo revisará y, si se confirma, ese número quedará en la lista negra para proteger a la comunidad.');
    } catch (e: any) {
      alert(e.message || 'Error al reportar el teléfono');
    } finally {
      setReportBusy(false);
    }
  };

  const handleRenew = async () => {
    setRenewing(true);
    try {
      await api.cases.renew(data.id);
      await refresh();
    } catch (e: any) {
      alert(e.message || 'Error al renovar el caso');
    } finally {
      setRenewing(false);
    }
  };

  const isExpiring = data?.expired || (typeof data?.days_left === 'number' && data.days_left >= 0 && data.days_left <= 3);

  const handleSendNeighborhoodAlert = async () => {
    if (!pet?.neighborhoods || (Array.isArray(pet.neighborhoods) ? pet.neighborhoods.length : 0) === 0) {
      alert('La mascota no tiene barrios configurados. Editala para definir los barrios de difusión.');
      return;
    }
    setSendingAlert(true);
    setAlertMsg('');
    try {
      const res = await api.cases.sendNeighborhoodAlert(id!);
      setAlertMsg(`Alerta enviada a ${res.recipients ?? 0} vecino(s)${res.sent ? ` (${res.sent} entregada(s))` : ''}.`);
      await refresh();
    } catch (e: any) {
      alert(e.message || 'Error al enviar la alerta vecinal');
    } finally {
      setSendingAlert(false);
    }
  };

  const imgUrl = (img: any) => {
    if (!img) return null;
    if (img.image_data) return `data:${img.mime_type || 'image/jpeg'};base64,${img.image_data}`;
    return img.external_url || null;
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-brand-primary" /></div>;
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-gray-500 mb-4">{error || 'Caso no encontrado'}</p>
        <Link to="/perdidos" className="text-brand-primary font-bold underline">Volver a mascotas reportadas</Link>
      </div>
    );
  }

  const images = (pet.images || []);
  const heroImg = imgUrl(images[0]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
      <Link to={user ? '/mis-casos' : '/perdidos'} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-brand-primary mb-6">
        <ArrowLeft className="w-4 h-4" /> {user ? 'Mis Casos' : 'Volver'}
      </Link>

      <div className="bg-white rounded-[2rem] border border-brand-accent overflow-hidden mb-8">
        <div className="relative aspect-video sm:aspect-[2/1] bg-brand-bg">
          {heroImg ? (
            <img src={heroImg} alt={pet.name || 'Mascota'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300"><Heart className="w-16 h-16" /></div>
          )}
          <div className="absolute bottom-3 left-3 flex gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${data.status === 'active' ? 'bg-brand-primary' : 'bg-gray-600'}`}>
              {STATUS_LABELS[data.status] || data.status}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-black/50">
              {TYPE_LABELS[data.type] || data.type}
            </span>
          </div>
        </div>
        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl sm:text-4xl font-serif font-bold text-brand-primary">{pet.name || 'Mascota sin identificar'}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {PET_STATUS_LABELS[pet.status] || pet.status} · {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species || ''}
                {pet.breed ? ` · ${pet.breed}` : ''}{pet.color ? ` · ${pet.color}` : ''}
              </p>
              {pet.case_number && (
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(pet.case_number).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold hover:bg-brand-primary/20 transition-colors"
                >
                  <BadgeCheck className="w-3.5 h-3.5" /> {pet.case_number}
                  <span className="font-medium">{copied ? '✓ copiado' : 'copiar'}</span>
                </button>
              )}
            </div>
            {isOwner && (
              <Link to={`/pet/${pet.id}`} className="text-sm font-bold text-brand-primary underline">Ver publicación</Link>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {pet.location && (
              <p className="flex items-center gap-2 text-sm text-gray-600"><MapPin className="w-4 h-4 text-brand-primary shrink-0" /> {pet.location}</p>
            )}
            <p className="flex items-center gap-2 text-sm text-gray-500"><Calendar className="w-4 h-4 text-brand-primary shrink-0" /> Caso iniciado el {new Date(data.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>

          {pet.description && <p className="text-sm text-gray-700 mt-4 bg-brand-bg rounded-2xl p-4">{pet.description}</p>}

          {images.length > 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              {images.slice(1).map((img: any, i: number) => {
                const src = imgUrl(img);
                return src ? <img key={i} src={src} alt="" className="aspect-square object-cover rounded-xl w-full" /> : null;
              })}
            </div>
          )}

          {(isOwner || isAdmin) && data.status !== 'closed' && (
            <CaseActions caseId={data.id} onChanged={refresh} />
          )}
          {(isOwner || isAdmin) && data.status !== 'closed' && (
            <div className="mt-4">
              <button
                onClick={handleSendNeighborhoodAlert}
                disabled={sendingAlert}
                className="w-full sm:w-auto px-6 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingAlert ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                {sendingAlert ? 'Enviando...' : 'Enviar alerta vecinal'}
              </button>
            </div>
          )}
          {alertMsg && <p className="mt-3 text-sm text-gray-600 flex items-center gap-2"><BellRing className="w-4 h-4 text-amber-500" /> {alertMsg}</p>}

          {(isOwner || isAdmin) && data.status !== 'closed' && isExpiring && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5">
              <p className="text-sm font-bold text-amber-800 mb-1">Este caso está por vencer{data?.expired ? ' (vencido)' : ''}</p>
              <p className="text-sm text-amber-700 mb-3">
                {data?.expired
                  ? `El caso venció hace ${Math.abs(data.days_left) || 1} día(s). Renovaló para seguir ayudando a encontrarla.`
                  : '¿Seguís buscando? Renová su publicación para mantenerla visible por 45 días más.'}
              </p>
              <button
                onClick={handleRenew}
                disabled={renewing}
                className="px-5 py-2.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              >
                {renewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                {renewing ? 'Renovando...' : 'Renovar caso (45 días)'}
              </button>
            </div>
          )}

          {user && !isOwner && !isAdmin && data.status !== 'closed' && (
            <button
              onClick={handleToggleFollow}
              disabled={followBusy}
              className={`mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 border ${isFollowing ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-brand-primary border-brand-accent hover:bg-brand-bg'}`}
            >
              {followBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className={`w-4 h-4 ${isFollowing ? 'fill-current' : ''}`} />}
              {isFollowing ? 'Siguiendo este caso' : 'Seguir este caso'}
              {data?.followerCount > 0 && <span className={`text-xs ${isFollowing ? 'text-white/80' : 'text-gray-400'}`}>{data.followerCount}</span>}
            </button>
          )}

          {user && (
            <button
              onClick={handleReportPhone}
              disabled={reportBusy}
              className="mt-3 flex items-center gap-2 text-sm font-bold text-red-500 hover:text-red-600"
            >
              <ShieldAlert className="w-4 h-4" /> {reportBusy ? 'Enviando...' : 'Reportar teléfono sospechoso'}
            </button>
          )}

          <button
            onClick={() => {
              const url = `${window.location.origin}/caso/${data.id}`;
              if (navigator.share) navigator.share({ title: `${pet.name || 'Mascota'} — Sigo Tu Huella`, text: pet.description || '', url }).catch(() => {});
              else {
                navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
              }
            }}
            className="mt-4 flex items-center gap-2 text-sm font-bold text-brand-primary"
          >
            <Share2 className="w-4 h-4" /> {copied ? 'Link copiado' : 'Compartir caso'}
          </button>
        </div>
      </div>

      {/* Mapa de avistamientos + áreas (solo casos activos o con datos) */}
      {data.status !== 'closed' || (data.sightings?.length > 0) || (data.searchAreas?.length > 0) ? (
        <div className="mb-8">
          <h2 className="text-lg sm:text-xl font-serif font-bold text-brand-primary mb-3 flex items-center gap-2">
            <MapPin className="w-5 h-5" /> Mapa de avistamientos
          </h2>
          <CaseMap
            center={getPetCoordinates(pet) || getApproxCenter(pet) || DEFAULT_CENTER}
            sightings={data.sightings || []}
            searchAreas={data.searchAreas || []}
            isAdmin={!!isAdmin}
            onReportClick={() => setShowSightingModal(true)}
            onToggleSighting={handleToggleSighting}
          />
          {(data.sightings?.length > 0) && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              <Eye className="w-3.5 h-3.5 inline mr-1 text-amber-500" />
              {data.sightings.length} avistamiento{data.sightings.length === 1 ? '' : 's'} reportado{data.sightings.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
      ) : null}

      {/* Impacto de la publicación (métricas + comentarios) */}
      <CaseImpact caseId={data.id} impact={data.impact} canReply={isOwner || !!isAdmin} />

      <div className="mb-8">
        <CaseShares caseId={data.id} />
      </div>

      <h2 className="text-lg sm:text-xl font-serif font-bold text-brand-primary mb-4 flex items-center gap-2">
        <BadgeCheck className="w-5 h-5" /> Trazabilidad
      </h2>
      <CaseTimeline events={data.events} />

      {showSightingModal && (
        <SightingModal
          caseId={data.id}
          onClose={() => setShowSightingModal(false)}
          onSaved={async () => {
            setShowSightingModal(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}