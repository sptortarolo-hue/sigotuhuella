import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, User, Mail, Phone, Calendar, Shield, Award, PawPrint, MessageSquare,
  BadgeCheck, MapPin, Activity, ExternalLink, ChevronRight, ChevronDown
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { BADGE_CONFIG } from '@/src/components/MemberCard';

const BADGE_ICONS: Record<string, { label: string; icon: string }> = {
  volunteer: { label: 'Voluntario/a', icon: '🤝' },
  first_donation: { label: '1ra Donación', icon: '❤️' },
  frequent_donor: { label: 'Donante Frecuente', icon: '💜' },
  foster_hero: { label: 'Héroe Tránsito', icon: '🏠' },
  rescuer: { label: 'Rescatista', icon: '🛡️' },
  founder: { label: 'Fundador/a', icon: '👑' },
  ayuda_traslados: { label: 'Ayuda en traslados', icon: '🚗' },
  hogares_transito: { label: 'Hogares de tránsito', icon: '🏠' },
  difusion_redes: { label: 'Difusión en redes', icon: '📱' },
  logistica: { label: 'Logística y org.', icon: '📋' },
  aporte_economico: { label: 'Aporte económico', icon: '💰' },
  fotografia_video: { label: 'Fotografía y video', icon: '📸' },
  recoleccion_insumos: { label: 'Recolección insumos', icon: '📦' },
  apoyo_veterinario: { label: 'Apoyo veterinario', icon: '🩺' },
  asesoria_legal: { label: 'Asesoría legal', icon: '⚖️' },
  diseno_grafico: { label: 'Diseño gráfico', icon: '🎨' },
  first_report: { label: '1er Reporte', icon: '📝' },
  reporter_5: { label: '5 Reportes', icon: '📋' },
  reporter_15: { label: '15 Reportes', icon: '📊' },
  reunited_hero: { label: 'Reencuentro Héroe', icon: '🏆' },
  reunited_legend: { label: 'Leyenda Reencuentro', icon: '👑' },
};

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, icon, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-brand-accent rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 bg-brand-bg/50 hover:bg-brand-bg transition-colors text-left"
      >
        <div className="flex items-center gap-2 font-bold text-sm text-brand-primary">
          {icon}
          {title}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Badge({ code }: { code: string }) {
  const cfg = BADGE_ICONS[code] || BADGE_CONFIG[code];
  if (!cfg) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-primary/10 text-brand-primary rounded-full text-[10px] font-bold">
      {cfg.icon} {cfg.label}
    </span>
  );
}

interface UserDetailPanelProps {
  data: any;
  onSelectPet?: (petId: string) => void;
  isMobile?: boolean;
  onClose?: () => void;
}

export default function UserDetailPanel({ data, onSelectPet, isMobile, onClose }: UserDetailPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'info' | 'myPets' | 'reported' | 'activity'>('info');
  const { user, volunteer_request, conversations, myPets, pets, stats } = data;

  const avatarSrc = user.avatar_data
    ? `data:${user.avatar_mime_type || 'image/jpeg'};base64,${user.avatar_data}`
    : null;

  return (
    <div className={cn("space-y-4", isMobile ? "p-4" : "p-6")}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-brand-accent" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center border-2 border-brand-accent">
              <User className="w-6 h-6 text-brand-primary" />
            </div>
          )}
          <div>
            <h3 className="font-bold text-brand-primary">{user.display_name || 'Sin nombre'}</h3>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Role + Member badges */}
      <div className="flex flex-wrap gap-2">
        <span className={cn("text-[10px] px-2.5 py-1 rounded-full font-bold uppercase",
          user.role === 'admin' ? "bg-brand-primary/10 text-brand-primary" : "bg-gray-100 text-gray-500"
        )}>
          <Shield className="w-3 h-3 inline mr-1" />
          {user.role}
        </span>
        {user.member_number && (
          <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700">
            <BadgeCheck className="w-3 h-3 inline mr-1" />
            {user.member_number}
          </span>
        )}
        {user.volunteer_status && user.volunteer_status !== 'none' && (
          <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-purple-100 text-purple-700">
            <Award className="w-3 h-3 inline mr-1" />
            {user.volunteer_status}
          </span>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-brand-accent gap-0">
        {[
          { id: 'info', label: 'Info' },
          { id: 'myPets', label: `Mis Mascotas (${(myPets || []).length})` },
          { id: 'reported', label: `Reportadas (${pets.length})` },
          { id: 'activity', label: 'Actividad' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={cn(
              "px-4 py-2 text-xs font-bold transition-all relative",
              activeSubTab === tab.id ? "text-brand-primary" : "text-gray-400 hover:text-gray-600"
            )}
          >
            {tab.label}
            {activeSubTab === tab.id && (
              <motion.div layoutId="user-subtab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Info tab */}
      {activeSubTab === 'info' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <Mail className="w-4 h-4 shrink-0" />
              <span className="truncate">{user.email}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <Phone className="w-4 h-4 shrink-0" />
              <span>{user.phone || '-'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Registro: {new Date(user.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <Activity className="w-4 h-4 shrink-0" />
              <span>Nivel: {user.points || 0} pts</span>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Reportes', value: stats.total_reports, color: 'text-blue-600 bg-blue-50' },
              { label: 'Reencuentros', value: stats.reunited_count, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Avistajes', value: stats.sighted_count, color: 'text-amber-600 bg-amber-50' },
              { label: 'Adopciones', value: stats.adopted_count, color: 'text-purple-600 bg-purple-50' },
            ].map(s => (
              <div key={s.label} className={cn("rounded-xl p-3 text-center", s.color)}>
                <div className="text-lg font-bold">{s.value}</div>
                <div className="text-[10px] font-medium opacity-75">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Badges */}
          {user.badges && user.badges.length > 0 && (
            <Section title={`Insignias (${user.badges.length})`} icon={<Award className="w-4 h-4" />}>
              <div className="flex flex-wrap gap-1.5">
                {user.badges.map((b: any, i: number) => (
                  <Badge key={i} code={b.code} />
                ))}
              </div>
            </Section>
          )}

          {/* Volunteer request */}
          {volunteer_request && (
            <Section title="Solicitud de voluntariado" icon={<Award className="w-4 h-4" />}>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> {volunteer_request.residence_zone}</div>
                <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {volunteer_request.whatsapp}</div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold",
                  volunteer_request.status === 'accepted' ? 'bg-green-100 text-green-700' :
                  volunteer_request.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-500'
                )}>{volunteer_request.status}</span>
              </div>
            </Section>
          )}

          {/* Member info */}
          {user.member_number && (
            <Section title="Membresía" icon={<BadgeCheck className="w-4 h-4" />}>
              <div className="text-sm text-gray-600">
                <div className="flex items-center gap-2"><PawPrint className="w-4 h-4 text-gray-400" /> Número: {user.member_number}</div>
              </div>
            </Section>
          )}

          <div className="text-[10px] text-gray-400">
            ID: {user.id} · {user.email_verified ? 'Email verificado' : 'Email no verificado'}
            {user.registration_pending ? ' · Registro pendiente' : ''}
          </div>
        </div>
      )}

      {/* My Pets tab */}
      {activeSubTab === 'myPets' && (
        <div className="space-y-3">
          {(!myPets || myPets.length === 0) ? (
            <p className="text-gray-400 text-sm text-center py-8">No tiene mascotas en su perfil</p>
          ) : (
            myPets.map((mp: any) => (
              <div
                key={mp.id}
                className="border border-brand-accent rounded-2xl p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-brand-bg overflow-hidden shrink-0">
                    {mp.photos?.[0]?.image_data ? (
                      <img
                        src={`data:${mp.photos[0].mime_type || 'image/jpeg'};base64,${mp.photos[0].image_data}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <PawPrint className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-brand-primary truncate">{mp.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase bg-brand-primary/10 text-brand-primary">
                        {mp.species === 'dog' ? 'Perro' : mp.species === 'cat' ? 'Gato' : mp.species}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      {mp.breed && <span>{mp.breed}</span>}
                      {mp.color && <span>{mp.color}</span>}
                      <span className="shrink-0">{new Date(mp.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {mp.gender && <span className="text-[10px] text-gray-400">{mp.gender}</span>}
                      {mp.birth_date && <span className="text-[10px] text-gray-400">Nac: {new Date(mp.birth_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Reported pets tab */}
      {activeSubTab === 'reported' && (
        <div className="space-y-3">
          {pets.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No tiene mascotas registradas</p>
          ) : (
            pets.map((pet: any) => (
              <div
                key={pet.id}
                className="border border-brand-accent rounded-2xl p-4 hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => onSelectPet?.(pet.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-brand-bg overflow-hidden shrink-0">
                    {pet.images?.[0]?.image_data ? (
                      <img
                        src={`data:${pet.images[0].mime_type || 'image/jpeg'};base64,${pet.images[0].image_data}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <PawPrint className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-brand-primary truncate">{pet.name || 'Sin nombre'}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase bg-brand-primary/10 text-brand-primary">
                        {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span className="truncate">{pet.location}</span>
                      <span className="shrink-0">{new Date(pet.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                        pet.status === 'reunited' ? 'bg-emerald-100 text-emerald-700' :
                        pet.status === 'adopted' ? 'bg-purple-100 text-purple-700' :
                        pet.status === 'for_adoption' ? 'bg-blue-100 text-blue-700' :
                        pet.status === 'lost' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      )}>{pet.status}</span>
                      {pet.instagram_posts?.length > 0 && <span className="text-[10px] text-gray-400">📷 IG: {pet.instagram_posts.length}</span>}
                      {pet.facebook_posts?.length > 0 && <span className="text-[10px] text-gray-400">📘 FB: {pet.facebook_posts.length}</span>}
                      {pet.whatsapp_messages?.length > 0 && <span className="text-[10px] text-gray-400">💬 WSP: {pet.whatsapp_messages.length}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Activity tab */}
      {activeSubTab === 'activity' && (
        <div className="space-y-4">
          {/* WhatsApp conversations */}
          {conversations.length > 0 && (
            <Section title={`Conversaciones WhatsApp (${conversations.length})`} icon={<MessageSquare className="w-4 h-4" />}>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {conversations.map((conv: any) => (
                  <div key={conv.id} className="p-3 bg-gray-50 rounded-xl text-sm">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span className="font-medium">{conv.wa_from}</span>
                      <span>{new Date(conv.last_message_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                        conv.status === 'active' ? 'bg-green-100 text-green-700' :
                        conv.status === 'closed' ? 'bg-gray-100 text-gray-500' :
                        'bg-amber-100 text-amber-700'
                      )}>{conv.status}</span>
                      <span className="text-gray-400">{conv.flow || '-'}</span>
                    </div>
                    {conv.messages?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                        {conv.messages.slice(0, 2).map((m: any) => m.text_body).filter(Boolean).join(' | ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Stats details */}
          <div className="border border-brand-accent rounded-2xl p-4">
            <h4 className="font-bold text-sm text-brand-primary mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Estadísticas
            </h4>
            <div className="text-sm text-gray-600 space-y-1">
              <p>Total reportes: <strong>{stats.total_reports}</strong></p>
              <p>Reencuentros: <strong>{stats.reunited_count}</strong></p>
              <p>Avistajes: <strong>{stats.sighted_count}</strong></p>
              <p>Adoptados: <strong>{stats.adopted_count}</strong></p>
              <p>En adopción: <strong>{stats.for_adoption_count}</strong></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
