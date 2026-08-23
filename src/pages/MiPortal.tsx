import { useState, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { api, apiUrl } from '@/src/lib/api';
import { getPetImageUrl } from '@/src/lib/petService';
import { getNewsImageUrl } from '@/src/lib/newsService';
import {
  PawPrint, Plus, Eye, Heart, Trophy, Users,
  Loader2, Clock, ChevronRight, Search, Camera,
  FileText, RotateCcw, Star, HandCoins, Sparkles,
  Share2, Mail, Phone, Check, X as XIcon,
  User, Megaphone, HeartHandshake, FolderOpen, MapPin, Cat, Dog, Truck, Home,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import ReportModal from '@/src/components/auth/ReportModal';

const formatRelativeTime = (iso: string) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return `hace ${Math.floor(days / 30)} meses`;
};

const getSpeciesIcon = (species?: string) => {
  if (species === 'cat') return <Cat className="w-5 h-5" />;
  if (species === 'dog') return <Dog className="w-5 h-5" />;
  return <PawPrint className="w-5 h-5" />;
};

const safeFetch = async (fn: () => Promise<any>): Promise<any | null> => {
  try {
    return await fn();
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'SESSION_EXPIRED') {
      return null;
    }
    console.warn('Fetch failed:', e.message);
    return null;
  }
};

export default function MiPortal() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const [myPets, setMyPets] = useState<any[]>([]);
  const [myPetsLoading, setMyPetsLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [recentActivityLoading, setRecentActivityLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [gamification, setGamification] = useState<any>(null);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [sharedPets, setSharedPets] = useState<any[]>([]);
  const [sharedPetsLoading, setSharedPetsLoading] = useState(true);

  // Volunteer data
  const [volunteerSubscriptions, setVolunteerSubscriptions] = useState<any[]>([]);
  const [volunteerSubsLoading, setVolunteerSubsLoading] = useState(true);
  const [zonePets, setZonePets] = useState<any[]>([]);
  const [zonePetsLoading, setZonePetsLoading] = useState(true);
  const [shareStats, setShareStats] = useState<any>(null);
  const [shareStatsLoading, setShareStatsLoading] = useState(true);

  const [reportModalOpen, setReportModalOpen] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }

    const fetchMyPets = async () => {
      try {
        setMyPetsLoading(true);
        const data = await safeFetch(() => api.myPets.list());
        setMyPets(data?.myPets || []);
      } catch (e) {
        console.error('Error fetching my pets:', e);
      } finally {
        setMyPetsLoading(false);
      }
    };

    const fetchRecentActivity = async () => {
      try {
        const data = await safeFetch(async () => {
          const [newsData, petsData] = await Promise.all([
            api.news.list(),
            api.pets.list(),
          ]);
          const newsItems = (newsData.news || []).map((item: any) => ({
            id: item.id,
            type: 'news' as const,
            typeLabel: item.type,
            title: item.title,
            description: (item.content || '').replace(/<[^>]*>/g, '').slice(0, 80),
            image: getNewsImageUrl(item),
            created_at: item.created_at,
          }));
          const petItems = (petsData.pets || []).slice(0, 5).map((item: any) => {
            const petTitle = item.status === 'lost' ? `Mascota perdida: ${item.name}`
              : item.status === 'sighted' ? `Avistaje: ${item.name}`
              : item.status === 'adoption' ? `En adopción: ${item.name}`
              : item.name || 'Mascota sin nombre';
            return {
              id: item.id,
              type: 'pet' as const,
              typeLabel: item.status,
              title: petTitle,
              description: '',
              image: getPetImageUrl(item),
              created_at: item.created_at,
            };
          });
          const merged = [...newsItems, ...petItems]
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 10);
          return merged;
        });
        setRecentActivity(data || []);
      } catch (e) {
        console.error('Error fetching recent activity:', e);
      } finally {
        setRecentActivityLoading(false);
      }
    };

    const fetchStats = async () => {
      try {
        const data = await safeFetch(() => api.users.stats(user.id));
        setStats(data);
      } catch (e) {
        console.error('Error fetching stats:', e);
      }
    };

    const fetchGamification = async () => {
      try {
        const data = await safeFetch(() => api.gamification.myStats());
        setGamification(data);
      } catch (e) {
        console.error('Error fetching gamification:', e);
      }
    };

const fetchInvites = async () => {
      try {
        const data = await safeFetch(() => api.users.invites.pending());
        if (data) setPendingInvites(data);
      } catch (e) { console.error(e); }
      finally { setInvitesLoading(false); }
    };
    
    const fetchShared = async () => {
      try {
        const data = await safeFetch(() => api.myPets.sharedWithMe());
        if (data) setSharedPets(data);
      } catch (e) { console.error(e); }
      finally { setSharedPetsLoading(false); }
    };
    
    // Volunteer data
    const fetchVolunteerSubscriptions = async () => {
      try {
        const data = await safeFetch(() => api.volunteers.mySubscriptions());
        if (data) setVolunteerSubscriptions(data.subscriptions || data || []);
      } catch (e) { console.error('Error fetching volunteer subscriptions:', e); }
      finally { setVolunteerSubsLoading(false); }
    };

    const fetchZonePets = async () => {
      try {
        const neighborhoods = myPets.flatMap(p => p.neighborhoods || []).filter(Boolean);
        if (neighborhoods.length === 0) { setZonePets([]); return; }
        const data = await safeFetch(() => api.pets.byNeighborhoods(neighborhoods, 'lost,sighted', 10));
        if (data) setZonePets(data.pets || []);
      } catch (e) { console.error('Error fetching zone pets:', e); }
      finally { setZonePetsLoading(false); }
    };

    const fetchShareStats = async () => {
      try {
        const data = await safeFetch(async () => {
          const res = await fetch(apiUrl('/api/volunteers/share-stats'), { credentials: 'include' });
          if (!res.ok) throw new Error(res.status === 401 ? 'UNAUTHORIZED' : 'Failed');
          return res.json();
        });
        if (data) setShareStats(data);
      } catch (e) { console.error('Error fetching share stats:', e); }
      finally { setShareStatsLoading(false); }
    };

    const fetchAll = async () => {
      await Promise.all([
        fetchMyPets(),
        fetchRecentActivity(),
        fetchStats(),
        fetchGamification(),
      ]);
      
      // Volunteer data after myPets loaded (for neighborhoods)
      await Promise.all([
        fetchInvites(),
        fetchShared(),
        fetchVolunteerSubscriptions(),
      ]);

      if (myPets.length > 0) {
        await Promise.all([
          fetchZonePets(),
          fetchShareStats(),
        ]);
      }
    };

    fetchAll();
  }, [user, navigate]);

  const handleAcceptInvite = async (token: string) => {
    try {
      await api.users.invites.accept(token);
      setPendingInvites(prev => prev.filter(i => i.token !== token));
    } catch (e) { console.error(e); }
  };

  const handleRejectInvite = async (token: string) => {
    try {
      await api.users.invites.reject(token);
      setPendingInvites(prev => prev.filter(i => i.token !== token));
    } catch (e) { console.error(e); }
  };

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center text-brand-primary">
      <Loader2 className="w-10 h-10 animate-spin" />
    </div>
  );

  if (!user) return null;

  const isMember = user.volunteer_status === 'active' || !!user.member_number;

  const statCards = [
    { icon: FileText, label: 'Reportes', value: stats?.stats?.total_reports ?? 0, color: 'text-blue-600 bg-blue-50' },
    { icon: RotateCcw, label: 'Reencuentros', value: stats?.stats?.reunited_count ?? 0, color: 'text-green-600 bg-green-50' },
    { icon: PawPrint, label: 'Mascotas', value: myPets.length, color: 'text-brand-primary bg-brand-primary/10' },
    { icon: Star, label: 'Puntos', value: gamification?.points ?? 0, color: 'text-amber-600 bg-amber-50' },
  ];

  const openReportModal = () => setReportModalOpen(true);

  const getSpeciesIcon = (species?: string) => {
    if (species === 'cat') return <Cat className="w-5 h-5" />;
    if (species === 'dog') return <Dog className="w-5 h-5" />;
    return <PawPrint className="w-5 h-5" />;
  };

  const SecondaryButton = ({ icon: Icon, label, onClick, disabled = false }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all",
        "bg-brand-primary/10 text-brand-primary border border-brand-primary/20",
        "hover:bg-brand-primary/20 hover:border-brand-primary",
        "min-w-[80px] lg:min-w-[120px] touch-target",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </button>
  );

  const PrimaryButton = ({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 px-4 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all min-w-[80px] lg:min-w-[120px] touch-target"
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* HEADER */}
      <header className="flex items-center justify-between mb-6 lg:mb-8">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-brand-primary">Mi Portal</h1>
        {isMember && (
          <span className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold shrink-0">
            ★ Socio
          </span>
        )}
      </header>

      {/* BOTONERA PRINCIPAL - 5 BOTONES */}
      <div className="flex gap-2 overflow-x-auto pb-4 lg:flex-wrap lg:overflow-visible lg:pb-6 lg:gap-3 mb-6 lg:mb-8 touch-scroll">
        <SecondaryButton
          icon={User}
          label="Mi Perfil"
          onClick={() => navigate('/perfil')}
        />
        <SecondaryButton
          icon={isMember ? Megaphone : HeartHandshake}
          label={isMember ? 'Voluntario' : 'Ser voluntario'}
          onClick={() => navigate(isMember ? '/voluntario' : '/sumate')}
        />
        <SecondaryButton
          icon={FolderOpen}
          label="Mis Casos"
          onClick={() => navigate('/mis-casos')}
        />
        <SecondaryButton
          icon={PawPrint}
          label="Mis Mascotas"
          onClick={() => navigate('/mi-mascota')}
        />
        <PrimaryButton
          icon={Plus}
          label="Reportar"
          onClick={() => setReportModalOpen(true)}
        />
      </div>

      {/* BOTÓN COLABORAR - FULL WIDTH MOBILE, AUTO DESKTOP */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        onClick={() => navigate('/colaborar')}
        className="w-full sm:w-auto bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all mb-6 lg:mb-8 touch-target"
      >
        <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600">
          <HandCoins className="w-6 h-6" />
        </div>
        <div className="text-left">
          <p className="text-base font-bold text-gray-700">Colaborar / Donar</p>
          <p className="text-sm text-gray-500">Tu ayuda transforma vidas</p>
        </div>
      </motion.button>

      {/* CONTENIDO PRINCIPAL - REORDENADO */}
      <div className="space-y-6 lg:space-y-8">
        {/* 1. MIS MASCOTAS STRIP */}
        <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-gray-400">Mis mascotas</h2>
            <button
              onClick={() => navigate('/mi-mascota')}
              className="text-xs sm:text-sm font-bold text-brand-primary flex items-center gap-1"
            >
              Ver todas <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
          </div>

          {myPetsLoading ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="shrink-0 w-20 sm:w-24 h-20 sm:h-24 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : myPets.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-dashed border-brand-accent p-5 sm:p-6 text-center"
            >
              <PawPrint className="w-8 sm:w-10 h-8 sm:h-10 text-brand-accent mx-auto mb-2" />
              <p className="text-xs sm:text-sm text-gray-500 mb-3">Todavía no registraste mascotas</p>
              <button
                onClick={() => navigate('/mi-mascota')}
                className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs sm:text-sm font-bold hover:shadow-lg transition-all"
              >
                <Plus className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1" /> Registrar
              </button>
            </motion.div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none touch-scroll">
              {myPets.map((pet) => (
                <motion.button
                  key={pet.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => navigate(`/mi-mascota/${pet.id}`)}
                  className="shrink-0 snap-start group"
                >
                  <div className="w-20 sm:w-24 h-20 sm:h-24 rounded-2xl overflow-hidden bg-brand-bg border border-brand-accent group-hover:border-brand-primary/50 transition-all shadow-sm group-hover:shadow-md">
                    {pet.avatar_image ? (
                      <img
                        src={apiUrl(`/my-pet-avatar/${pet.id}`)}
                        alt={pet.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PawPrint className="w-8 sm:w-10 h-8 sm:h-10 text-brand-accent" />
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-gray-700 text-center mt-1.5 truncate max-w-20 sm:max-w-24">
                    {pet.name}
                  </p>
                </motion.button>
              ))}
              <button
                onClick={() => navigate('/mi-mascota')}
                className="shrink-0 w-20 sm:w-24 h-20 sm:h-24 rounded-2xl border-2 border-dashed border-brand-accent flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-brand-primary hover:border-brand-primary transition-all"
              >
                <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="text-[10px] sm:text-xs font-medium">Agregar</span>
              </button>
            </div>
          )}
        </section>

        {/* 2. TU IMPACTO - STATS */}
        <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 lg:p-6">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-gray-400 mb-3 lg:mb-4">Tu impacto</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {statCards.map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={`${card.color} rounded-2xl p-4 sm:p-5 flex items-center gap-3 lg:gap-4`}
              >
                <card.icon className="w-6 sm:w-8 h-6 sm:h-8 shrink-0" />
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{card.value}</p>
                  <p className="text-[10px] sm:text-xs font-medium opacity-75">{card.label}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 3. SECCIONES SOCIO / VOLUNTARIO - solo si es miembro */}
        {isMember && (
          <>
            {/* MIS SUSCRIPCIONES / AGRUPACIONES */}
            <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 lg:p-6">
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-gray-400 mb-3 lg:mb-4 flex items-center gap-2">
                <Megaphone className="w-4 h-4" /> Mis suscripciones
              </h2>
              {volunteerSubsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : volunteerSubscriptions.length === 0 ? (
                <div className="bg-brand-primary/5 rounded-xl p-4 text-center text-sm text-brand-primary/80">
                  No tenés suscripciones activas. <button onClick={() => navigate('/sumate')} className="text-brand-primary underline ml-1">Suscribirte</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {volunteerSubscriptions.map((sub: any) => (
                    <div key={`${sub.agrupacion_id}-${sub.category}`} className="flex items-center gap-3 p-3 bg-brand-bg/50 rounded-xl border border-brand-accent">
                      <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
                        {sub.category === 'difusion' && <Share2 className="w-5 h-5 text-brand-primary" />}
                        {sub.category === 'busqueda' && <Search className="w-5 h-5 text-brand-primary" />}
                        {sub.category === 'hogar_transito' && <Home className="w-5 h-5 text-brand-primary" />}
                        {sub.category === 'traslado' && <Truck className="w-5 h-5 text-brand-primary" />}
                        {sub.category === 'donante' && <Heart className="w-5 h-5 text-brand-primary" />}
                        {sub.category === 'otra' && <Plus className="w-5 h-5 text-brand-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-800 truncate">{sub.agrupacion_name || sub.agrupacion_id}</p>
                        <p className="text-xs text-gray-500 capitalize">{sub.category.replace('_', ' ')}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        sub.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {sub.status === 'active' ? 'Activa' : 'Pendiente'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* MASCOTAS EN MI ZONA */}
            <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 lg:p-6">
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-gray-400 mb-3 lg:mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Mascotas en mi zona
              </h2>
              {zonePetsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : zonePets.length === 0 ? (
                <div className="bg-brand-primary/5 rounded-xl p-4 text-center text-sm text-brand-primary/80">
                  No hay mascotas reportadas cerca de tus barrios ahora mismo.
                </div>
              ) : (
                <div className="space-y-2">
                  {zonePets.slice(0, 3).map((pet: any) => (
                    <div key={pet.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-brand-accent">
                      <div className="w-12 h-12 rounded-xl bg-brand-bg flex items-center justify-center shrink-0 overflow-hidden">
                        {getPetImageUrl(pet) ? (
                          <img src={getPetImageUrl(pet)} alt={pet.name || ''} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-brand-primary/30">
                            {getSpeciesIcon(pet.species)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-800 truncate">{pet.name || 'Mascota'}</p>
                        <p className="text-xs text-gray-500">{pet.neighborhoods?.[0] || 'Zona cercana'}</p>
                      </div>
                    </div>
                  ))}
                  {zonePets.length > 3 && (
                    <button onClick={() => navigate('/perdidos')} className="w-full mt-2 text-sm text-brand-primary font-bold hover:underline">
                      Ver todas ({zonePets.length})
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* COMPARTIDOS POR PLATAFORMA */}
            <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 lg:p-6">
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-gray-400 mb-3 lg:mb-4 flex items-center gap-2">
                <Share2 className="w-4 h-4" /> Compartidos por plataforma
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { icon: Share2, label: 'WhatsApp', value: shareStats?.whatsapp ?? 0, color: 'bg-green-100 text-green-700' },
                  { icon: Camera, label: 'Instagram', value: shareStats?.instagram ?? 0, color: 'bg-pink-100 text-pink-700' },
                  { icon: Users, label: 'Facebook', value: shareStats?.facebook ?? 0, color: 'bg-blue-100 text-blue-700' },
                  { icon: FileText, label: 'Otros', value: shareStats?.other ?? 0, color: 'bg-gray-100 text-gray-700' },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className={`${item.color} rounded-2xl p-4 flex flex-col items-center gap-2`}
                  >
                    <item.icon className="w-6 h-6 shrink-0" />
                    <span className="text-xs font-medium">{item.label}</span>
                    <span className="text-lg font-bold">{item.value}</span>
                  </motion.div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* INVITACIONES PENDIENTES */}
        {!invitesLoading && pendingInvites.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 lg:p-6">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-amber-500 mb-3 lg:mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4" /> Invitaciones pendientes
            </h2>
            <div className="space-y-2">
              {pendingInvites.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      <strong>{inv.inviter_name}</strong> te compartió <strong>{inv.pet_name}</strong>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {inv.invited_email && <><Mail className="w-3 h-3 inline mr-1" />{inv.invited_email}</>}
                      {inv.invited_phone && <><Phone className="w-3 h-3 inline mr-1 ml-2" />{inv.invited_phone}</>}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-3">
                    <button onClick={() => handleAcceptInvite(inv.token)}
                      className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-200 transition-colors flex items-center gap-1 touch-target">
                      <Check className="w-4 h-4" /> Aceptar
                    </button>
                    <button onClick={() => handleRejectInvite(inv.token)}
                      className="px-4 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors touch-target">
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* COMPARTIDAS CONMIGO */}
        {!sharedPetsLoading && sharedPets.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 lg:p-6">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-gray-400 mb-3 lg:mb-4 flex items-center gap-2">
              <Share2 className="w-4 h-4" /> Compartidas conmigo
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 touch-scroll">
              {sharedPets.map((pet: any) => (
                <button key={pet.id} onClick={() => navigate(`/mi-mascota/${pet.id}`)}
                  className="shrink-0 snap-start group">
                  <div className="w-20 sm:w-24 h-20 sm:h-24 rounded-2xl overflow-hidden bg-brand-bg border border-brand-accent group-hover:border-brand-primary/50 transition-all shadow-sm">
                    {pet.avatar_image ? (
                      <img src={apiUrl(`/my-pet-avatar/${pet.id}`)} alt={pet.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PawPrint className="w-8 sm:w-10 h-8 sm:h-10 text-brand-accent" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-medium text-gray-700 text-center mt-1.5 truncate max-w-20 sm:max-w-24">{pet.name}</p>
                  <p className="text-[10px] sm:text-xs text-gray-400 text-center">{pet.owner_name}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 4. ÚLTIMA ACTIVIDAD - AL FINAL */}
        <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 lg:p-6">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-gray-400 mb-3 lg:mb-4">Última actividad</h2>
          {recentActivityLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-dashed border-brand-accent p-6 text-center"
            >
              <Clock className="w-8 sm:w-10 h-8 sm:h-10 text-brand-accent mx-auto mb-2" />
              <p className="text-xs sm:text-sm text-gray-500">Todavía no hay actividad</p>
            </motion.div>
          ) : (
            <div className="space-y-2">
              {recentActivity.slice(0, 5).map((item: any, i: number) => {
                const isNews = item.type === 'news';
                const iconInfo = isNews
                  ? item.typeLabel === 'reunited'
                    ? { Icon: RotateCcw, bg: 'bg-green-100 text-green-600', badge: 'Reencuentro' }
                    : item.typeLabel === 'adopted'
                    ? { Icon: Heart, bg: 'bg-red-100 text-red-500', badge: 'Adopción' }
                    : { Icon: Sparkles, bg: 'bg-brand-primary/10 text-brand-primary', badge: 'Novedad' }
                  : item.typeLabel === 'lost'
                  ? { Icon: PawPrint, bg: 'bg-red-100 text-red-500', badge: 'Perdido' }
                  : item.typeLabel === 'sighted'
                  ? { Icon: Eye, bg: 'bg-amber-100 text-amber-700', badge: 'Avistaje' }
                  : { Icon: Heart, bg: 'bg-red-100 text-red-500', badge: 'Adopción' };
                return (
                  <motion.button
                    key={`${item.type}-${item.id}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => navigate(isNews ? `/novedad/${item.id}` : `/pet/${item.id}`)}
                    className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-brand-accent hover:border-brand-primary/30 hover:shadow-sm transition-all text-left"
                  >
                    <div className={`w-9 h-9 rounded-xl ${iconInfo.bg} flex items-center justify-center shrink-0`}>
                      <iconInfo.Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-gray-800 truncate">{item.title}</p>
                      <p className="text-[10px] sm:text-xs text-gray-400">
                        {iconInfo.badge}
                        {' · '}{formatRelativeTime(item.created_at)}
                      </p>
                    </div>
                    <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-gray-300 shrink-0" />
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* MODALS */}
      <ReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        onLostPetClick={() => {}}
      />
    </div>
  );
}