import { useState, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { api } from '@/src/lib/api';
import {
  PawPrint, Plus, Eye, Heart, Trophy, Users,
  Loader2, Clock, ChevronRight, Search, Camera,
  FileText, RotateCcw, Star, HandCoins, Sparkles,
  Share2, Mail, Phone, Check, X as XIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import FamilySection from '@/src/components/FamilySection';

export default function Dashboard() {
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

  useEffect(() => {
    if (!user) { navigate('/login'); return; }

    const fetchMyPets = async () => {
      try {
        setMyPetsLoading(true);
        const data = await api.myPets.list();
        setMyPets(data.myPets || []);
      } catch (e) {
        console.error('Error fetching my pets:', e);
      } finally {
        setMyPetsLoading(false);
      }
    };

    const fetchRecentActivity = async () => {
      try {
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
          image: item.image_data || null,
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
            image: item.images?.[0]?.image_data || null,
            created_at: item.created_at,
          };
        });
        const merged = [...newsItems, ...petItems]
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10);
        setRecentActivity(merged);
      } catch (e) {
        console.error('Error fetching recent activity:', e);
      } finally {
        setRecentActivityLoading(false);
      }
    };

    const fetchStats = async () => {
      try {
        const data = await api.users.stats(user.id);
        setStats(data);
      } catch (e) {
        console.error('Error fetching stats:', e);
      }
    };

    const fetchGamification = async () => {
      try {
        const data = await api.gamification.myStats();
        setGamification(data);
      } catch (e) {
        console.error('Error fetching gamification:', e);
      }
    };

    fetchMyPets();
    fetchRecentActivity();
    fetchStats();
    fetchGamification();

    const fetchInvites = async () => {
      try {
        const res = await fetch('/api/invites/pending', { credentials: 'include' });
        if (res.ok) { const data = await res.json(); setPendingInvites(data); }
      } catch (e) { console.error(e); }
      finally { setInvitesLoading(false); }
    };
    const fetchShared = async () => {
      try {
        const res = await fetch('/api/my-pets/shared/with-me', { credentials: 'include' });
        if (res.ok) { const data = await res.json(); setSharedPets(data); }
      } catch (e) { console.error(e); }
      finally { setSharedPetsLoading(false); }
    };
    fetchInvites();
    fetchShared();
  }, [user, navigate]);

  const handleAcceptInvite = async (token: string) => {
    try {
      const res = await fetch(`/api/invites/${token}/accept`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setPendingInvites(prev => prev.filter(i => i.token !== token));
      }
    } catch (e) { console.error(e); }
  };

  const handleRejectInvite = async (token: string) => {
    try {
      await fetch(`/api/invites/${token}/reject`, { method: 'POST', credentials: 'include' });
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

  const formatRelativeTime = (iso: string) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 30) return `hace ${days} días`;
    return `hace ${Math.floor(days / 30)} meses`;
  };

  const mobileQuickActions = [
    { icon: PawPrint, label: 'Perdí mi mascota', path: '/perdi-mi-mascota', color: 'bg-brand-primary/10' },
    { icon: Search, label: 'Avistaje', path: '/reportar-rapido', color: 'bg-amber-50' },
    { icon: Heart, label: 'Quiero adoptar', path: '/adopcion', color: 'bg-red-50' },
    { icon: Camera, label: 'Hacer Flyer', path: '/flyer', color: 'bg-brand-secondary/10' },
  ];

  const statCards = [
    { icon: FileText, label: 'Reportes', value: stats?.stats?.total_reports ?? 0, color: 'text-blue-600 bg-blue-50' },
    { icon: RotateCcw, label: 'Reencuentros', value: stats?.stats?.reunited_count ?? 0, color: 'text-green-600 bg-green-50' },
    { icon: PawPrint, label: 'Mascotas', value: myPets.length, color: 'text-brand-primary bg-brand-primary/10' },
    { icon: Star, label: 'Puntos', value: gamification?.points ?? 0, color: 'text-amber-600 bg-amber-50' },
  ];

  const quickActions = [
    {
      icon: <PawPrint className="w-6 h-6" />,
      label: 'Perdida',
      desc: 'Reportar mascota perdida',
      path: '/reportar',
      color: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100',
    },
    {
      icon: <Eye className="w-6 h-6" />,
      label: 'Avistaje',
      desc: 'Vi una mascota',
      path: '/reportar-rapido',
      color: 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100',
    },
    {
      icon: <Trophy className="w-6 h-6" />,
      label: 'Concursos',
      desc: 'Participá y sumá puntos',
      path: '/concursos',
      color: 'bg-brand-primary/10 text-brand-primary border-brand-primary/20 hover:bg-brand-primary/20 hidden md:block',
    },
    {
      icon: <Users className="w-6 h-6" />,
      label: 'Comunidad',
      desc: 'Mirá el feed de novedades',
      path: '/feed',
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 hidden md:block',
    },
  ];

  const s = stats?.stats || {};

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* ─── MOBILE LAYOUT ─── */}
      <div className="lg:hidden space-y-6">
        {/* 1. Greeting */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-brand-primary">
              ¡Hola, {user.display_name || 'Usuario'}!
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">¿Qué vas a hacer hoy?</p>
          </div>
          {isMember && (
            <span className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold shrink-0">
              ★ Socio
            </span>
          )}
        </div>

        {/* 2. Quick Actions (4 buttons like public home) */}
        <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3">
            {mobileQuickActions.map((action, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => navigate(action.path)}
                className={`${action.color} border border-brand-accent rounded-2xl p-4 flex flex-col items-center gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all`}
              >
                <div className={`p-2.5 rounded-xl ${action.label === 'Perdí mi mascota' ? 'bg-brand-primary text-white' : action.label === 'Avistaje' ? 'bg-amber-100 text-amber-700' : action.label === 'Quiero adoptar' ? 'bg-red-100 text-red-500' : 'bg-brand-secondary/20 text-brand-secondary'}`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-gray-700">{action.label}</span>
              </motion.button>
            ))}
          </div>
        </section>

        {/* 2b. Colaborar — full width */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => navigate('/colaborar')}
          className="w-full bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600">
            <HandCoins className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-700">Colaborar con el rescate</p>
            <p className="text-xs text-gray-500">Tu ayuda transforma vidas</p>
          </div>
        </motion.button>

        {/* 3. Mis mascotas strip */}
        <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Mis mascotas</h2>
            <button
              onClick={() => navigate('/mi-mascota')}
              className="text-[10px] font-bold text-brand-primary flex items-center gap-1"
            >
              Ver todas <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {myPetsLoading ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="shrink-0 w-20 h-20 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : myPets.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-dashed border-brand-accent p-5 text-center"
            >
              <PawPrint className="w-8 h-8 text-brand-accent mx-auto mb-2" />
              <p className="text-xs text-gray-500 mb-3">Todavía no registraste mascotas</p>
              <button
                onClick={() => navigate('/mi-mascota')}
                className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all"
              >
                <Plus className="w-3 h-3 inline mr-1" /> Registrar
              </button>
            </motion.div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
              {myPets.map((pet) => (
                <motion.button
                  key={pet.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => navigate(`/mi-mascota/${pet.id}`)}
                  className="shrink-0 snap-start group"
                >
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-brand-bg border border-brand-accent group-hover:border-brand-primary/50 transition-all shadow-sm group-hover:shadow-md">
                    {pet.avatar_image ? (
                      <img
                        src={`/my-pet-avatar/${pet.id}`}
                        alt={pet.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PawPrint className="w-8 h-8 text-brand-accent" />
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] font-medium text-gray-700 text-center mt-1.5 truncate max-w-20">
                    {pet.name}
                  </p>
                </motion.button>
              ))}
              <button
                onClick={() => navigate('/mi-mascota')}
                className="shrink-0 w-20 h-20 rounded-2xl border-2 border-dashed border-brand-accent flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-brand-primary hover:border-brand-primary transition-all"
              >
                <Plus className="w-5 h-5" />
                <span className="text-[10px] font-medium">Agregar</span>
              </button>
            </div>
          )}
        </section>

        {/* 4. Recent Activity */}
        <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Última actividad</h2>
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
              <Clock className="w-8 h-8 text-brand-accent mx-auto mb-2" />
              <p className="text-xs text-gray-500">Todavía no hay actividad</p>
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
                      <p className="text-xs font-medium text-gray-800 truncate">{item.title}</p>
                      <p className="text-[10px] text-gray-400">
                        {iconInfo.badge}
                        {' · '}{formatRelativeTime(item.created_at)}
                      </p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

        {/* 5. Stats */}
        <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Tu impacto</h2>
          <div className="grid grid-cols-2 gap-3">
            {statCards.map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={`${card.color} rounded-2xl p-4 flex items-center gap-3`}
              >
                <card.icon className="w-6 h-6 shrink-0" />
                <div>
                  <p className="text-lg font-bold">{card.value}</p>
                  <p className="text-[10px] font-medium opacity-75">{card.label}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 6. Family */}
        <FamilySection />
      </div>

      {/* ─── DESKTOP LAYOUT ─── */}
        {/* Greeting */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">
              ¡Hola, {user.display_name || 'Usuario'}!
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">¿Qué vas a hacer hoy?</p>
          </div>
          {isMember && (
            <span className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold shrink-0">
              ★ Socio
            </span>
          )}
        </div>

        {/* Quick Actions 2x2 */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="grid grid-cols-2 gap-4">
            {mobileQuickActions.map((action, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => navigate(action.path)}
                className={`${action.color} border border-brand-accent rounded-2xl p-6 flex flex-col items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all`}
              >
                <div className={`p-3 rounded-xl ${action.label === 'Perdí mi mascota' ? 'bg-brand-primary text-white' : action.label === 'Avistaje' ? 'bg-amber-100 text-amber-700' : action.label === 'Quiero adoptar' ? 'bg-red-100 text-red-500' : 'bg-brand-secondary/20 text-brand-secondary'}`}>
                  <action.icon className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-gray-700">{action.label}</span>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Colaborar full-width */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => navigate('/colaborar')}
          className="w-full bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600">
            <HandCoins className="w-6 h-6" />
          </div>
          <div className="text-left">
            <p className="text-base font-bold text-gray-700">Colaborar con el rescate</p>
            <p className="text-sm text-gray-500">Tu ayuda transforma vidas</p>
          </div>
        </motion.button>

        {/* Mis mascotas strip */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Mis mascotas</h2>
            <button onClick={() => navigate('/mi-mascota')} className="text-xs font-bold text-brand-primary flex items-center gap-1">
              Ver todas <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {myPetsLoading ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="shrink-0 w-24 h-24 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : myPets.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-dashed border-brand-accent p-6 text-center">
              <PawPrint className="w-10 h-10 text-brand-accent mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-3">Todavía no registraste mascotas</p>
              <button onClick={() => navigate('/mi-mascota')}
                className="px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all">
                <Plus className="w-4 h-4 inline mr-1" /> Registrar
              </button>
            </motion.div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
              {myPets.map((pet) => (
                <motion.button key={pet.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  onClick={() => navigate(`/mi-mascota/${pet.id}`)} className="shrink-0 snap-start group">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-brand-bg border border-brand-accent group-hover:border-brand-primary/50 transition-all shadow-sm group-hover:shadow-md">
                    {pet.avatar_image ? (
                      <img src={`/my-pet-avatar/${pet.id}`} alt={pet.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PawPrint className="w-10 h-10 text-brand-accent" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-gray-700 text-center mt-1.5 truncate max-w-24">{pet.name}</p>
                </motion.button>
              ))}
              <button onClick={() => navigate('/mi-mascota')}
                className="shrink-0 w-24 h-24 rounded-2xl border-2 border-dashed border-brand-accent flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-brand-primary hover:border-brand-primary transition-all">
                <Plus className="w-6 h-6" /><span className="text-[10px] font-medium">Agregar</span>
              </button>
            </div>
          )}
        </section>

        {/* Última actividad */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Última actividad</h2>
          {recentActivityLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-dashed border-brand-accent p-8 text-center">
              <Clock className="w-10 h-10 text-brand-accent mx-auto mb-2" />
              <p className="text-sm text-gray-500">Todavía no hay actividad</p>
            </motion.div>
          ) : (
            <div className="space-y-2">
              {recentActivity.slice(0, 8).map((item: any, i: number) => {
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
                  <motion.button key={`${item.type}-${item.id}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => navigate(isNews ? `/novedad/${item.id}` : `/pet/${item.id}`)}
                    className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-brand-accent hover:border-brand-primary/30 hover:shadow-sm transition-all text-left">
                    <div className={`w-10 h-10 rounded-xl ${iconInfo.bg} flex items-center justify-center shrink-0`}>
                      <iconInfo.Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                      <p className="text-xs text-gray-400">
                        {iconInfo.badge}
                        {' · '}{formatRelativeTime(item.created_at)}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

        {/* Tu impacto */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Tu impacto</h2>
          <div className="grid grid-cols-4 gap-4">
            {statCards.map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={`${card.color} rounded-2xl p-5 flex items-center gap-4`}
              >
                <card.icon className="w-8 h-8 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-xs font-medium opacity-75">{card.label}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Mi Familia */}
        <FamilySection />

        {/* Invitaciones pendientes */}
        {!invitesLoading && pendingInvites.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-500 mb-4 flex items-center gap-2">
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
                      className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-200 transition-colors flex items-center gap-1">
                      <Check className="w-4 h-4" /> Aceptar
                    </button>
                    <button onClick={() => handleRejectInvite(inv.token)}
                      className="px-4 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors">
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Compartidas conmigo */}
        {!sharedPetsLoading && sharedPets.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Share2 className="w-4 h-4" /> Compartidas conmigo
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {sharedPets.map((pet: any) => (
                <button key={pet.id} onClick={() => navigate(`/mi-mascota/${pet.id}`)}
                  className="shrink-0 snap-start group">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-brand-bg border border-brand-accent group-hover:border-brand-primary/50 transition-all shadow-sm">
                    {pet.avatar_image ? (
                      <img src={`/my-pet-avatar/${pet.id}`} alt={pet.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PawPrint className="w-8 h-8 text-brand-accent" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-gray-700 text-center mt-1.5 truncate max-w-20">{pet.name}</p>
                  <p className="text-[10px] text-gray-400 text-center">{pet.owner_name}</p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
