import { FilePlus2, Instagram, Facebook, MessageCircle, Users, MapPin, Radar, HandHeart, PartyPopper, Lock, Info, BellRing, QrCode, RefreshCw } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const EVENT_ICONS: Record<string, any> = {
  case_created: FilePlus2,
  flyer_generated: FilePlus2,
  instagram_published: Instagram,
  facebook_published: Facebook,
  whatsapp_group_sent: MessageCircle,
  whatsapp_sent_reporter: MessageCircle,
  neighborhood_alert_sent: BellRing,
  social_shared: Users,
  match_confirmed: Users,
  qr_scanned: QrCode,
  sighting_reported: MapPin,
  search_area_logged: Radar,
  meeting_arranged: HandHeart,
  reunited: PartyPopper,
  reunion_announced: HandHeart,
  case_closed: Lock,
  case_renewed: RefreshCw,
  status_changed: Info,
};

const EVENT_STYLES: Record<string, string> = {
  case_created: 'bg-brand-primary/10 text-brand-primary',
  flyer_generated: 'bg-brand-secondary/10 text-brand-secondary',
  instagram_published: 'bg-pink-500/10 text-pink-600',
  facebook_published: 'bg-blue-500/10 text-blue-600',
  whatsapp_group_sent: 'bg-emerald-500/10 text-emerald-600',
  whatsapp_sent_reporter: 'bg-emerald-500/10 text-emerald-600',
  neighborhood_alert_sent: 'bg-amber-500/10 text-amber-600',
  social_shared: 'bg-purple-500/10 text-purple-600',
  match_confirmed: 'bg-cyan-500/10 text-cyan-600',
  qr_scanned: 'bg-indigo-500/10 text-indigo-600',
  sighting_reported: 'bg-amber-500/10 text-amber-600',
  search_area_logged: 'bg-emerald-500/10 text-emerald-600',
  meeting_arranged: 'bg-brand-secondary/10 text-brand-secondary',
  reunited: 'bg-emerald-500/10 text-emerald-600',
  reunion_announced: 'bg-emerald-500/10 text-emerald-600',
  case_closed: 'bg-gray-500/10 text-gray-600',
  case_renewed: 'bg-indigo-500/10 text-indigo-600',
  status_changed: 'bg-blue-500/10 text-blue-600',
};

function eventLabel(type: string, payload: any) {
  switch (type) {
    case 'case_created': return 'Caso creado';
    case 'flyer_generated': return 'Flyer generado';
    case 'instagram_published': return 'Publicado en Instagram';
    case 'facebook_published': return 'Publicado en Facebook (página y grupos)';
    case 'whatsapp_group_sent': return 'Publicado en grupos de WhatsApp';
    case 'whatsapp_sent_reporter': return 'WhatsApp enviado al reportante';
    case 'neighborhood_alert_sent': return 'Alerta vecinal enviada';
    case 'social_shared': return 'Compartido en redes';
    case 'match_confirmed': return 'Coincidencia confirmada';
    case 'qr_scanned': return 'QR escaneado';
    case 'sighting_reported': return 'Nuevo avistamiento';
    case 'search_area_logged': return 'Zona de búsqueda registrada';
    case 'meeting_arranged': return 'Punto de encuentro propuesto';
    case 'reunited': return 'Reencontrada';
    case 'reunion_announced': return '¡Volvió a casa!';
    case 'case_closed': {
      const reasonMap: any = { reunited: 'reunida', adopted: 'adoptada', deceased: 'fallecida', transferred: 'traspasada' };
      return `Caso cerrado (${reasonMap[payload?.reason] || payload?.reason || 'motivo'})`;
    }
    case 'status_changed': return 'Estado del caso actualizado';
    case 'case_renewed': return 'Publicación renovada';
    default: return type;
  }
}

function eventDetail(type: string, payload: any) {
  switch (type) {
    case 'instagram_published': return payload?.permalink ? `Ver publicación en Instagram` : null;
    case 'flyer_generated':
      return payload?.flyer_url ? `Volante 4x5 listo para imprimir` : null;
    case 'facebook_published': {
      const groups = Array.isArray(payload?.group_post_ids) ? payload.group_post_ids.length : 0;
      if (payload?.page_post_id) return `Publicado en la página${groups > 0 ? ` y ${groups} grupo${groups === 1 ? '' : 's'}` : ''} de Facebook`;
      if (groups > 0) return `Publicado en ${groups} grupo${groups === 1 ? '' : 's'} de Facebook`;
      return null;
    }
    case 'whatsapp_group_sent':
      if (payload?.group_name) return `Grupo "${payload.group_name}"${payload?.reach_estimate ? ` (~${payload.reach_estimate} alcanzados)` : ''}`;
      return null;
    case 'whatsapp_sent_reporter':
      return payload?.message || 'Se envió la publicación al reportante por WhatsApp';
    case 'neighborhood_alert_sent':
      return payload?.recipients ? `${payload.recipients} vecinos notificados en un radio de ${payload.radius_km ?? 5}km` : null;
    case 'social_shared':
      if (payload?.platform) return payload.platform;
      return null;
    case 'match_confirmed':
      return payload?.matched_pet_id ? 'Se encontró una coincidencia visual con otra publicación.' : null;
    case 'sighting_reported':
      if (payload?.lat && payload?.lng) return `Ubicación: ${payload.lat.toFixed ? payload.lat.toFixed(5) : payload.lat}, ${payload.lng.toFixed ? payload.lng.toFixed(5) : payload.lng}`;
      return null;
    case 'reunion_announced':
      return payload?.collaborators_count ? `Se avisó a ${payload.collaborators_count} personas que colaboraron` : null;
    case 'meeting_arranged': {
      if (!payload?.time) return null;
      const d = new Date(payload.time);
      const when = isNaN(d.getTime()) ? String(payload.time) : d.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      return payload?.location ? `${when} · ${payload.location}` : when;
    }
    case 'reunited':
      return 'La mascota volvió a casa';
    case 'case_renewed': {
      if (!payload?.active_until) return null;
      const d = new Date(payload.active_until);
      if (isNaN(d.getTime())) return null;
      return `El caso queda activo hasta el ${d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' })}`;
    }
    default: return null;
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CaseTimeline({ events }: { events: any[] }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Todavía no hay eventos registrados en el caso.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l-2 border-brand-accent ml-3">
      {events.map((ev) => {
        const Icon = EVENT_ICONS[ev.event_type] || Info;
        const dest = payload => (payload?.permalink && typeof payload.permalink === 'string' ? payload.permalink : null);
        return (
          <li key={ev.id} className="relative ml-6">
            <span className={cn(
              "absolute -left-[27px] w-11 h-11 rounded-full flex items-center justify-center ring-4 ring-white shrink-0",
              EVENT_STYLES[ev.event_type] || 'bg-brand-bg text-gray-500'
            )}>
              <Icon className="w-5 h-5" />
            </span>
            <div className="bg-white rounded-2xl border border-brand-accent p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-gray-800">{eventLabel(ev.event_type, ev.payload)}</p>
                <p className="text-xs text-gray-400">{formatDate(ev.created_at)}</p>
              </div>
              {eventDetail(ev.event_type, ev.payload) && (
                <p className="text-sm text-gray-500 mt-1">{eventDetail(ev.event_type, ev.payload)}</p>
              )}
              {ev.event_type === 'instagram_published' && dest(ev.payload) && (
                <a href={dest(ev.payload)} target="_blank" rel="noreferrer" className="text-xs text-brand-primary underline mt-1 inline-block">Ver en Instagram</a>
              )}
              {ev.event_type === 'facebook_published' && ev.payload?.page_post_url && (
                <a href={ev.payload.page_post_url} target="_blank" rel="noreferrer" className="text-xs text-brand-primary underline mt-1 inline-block">Ver en Facebook</a>
              )}
              {ev.user_name && <p className="text-xs text-gray-400 mt-1.5">por {ev.user_name}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}