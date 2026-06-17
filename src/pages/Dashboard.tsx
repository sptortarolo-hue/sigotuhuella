import { useState, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { api } from '@/src/lib/api';
import {
  PawPrint, Plus, Eye, Heart, Trophy, Users,
  Loader2, Clock, ChevronRight, Search, Camera,
  FileText, RotateCcw, Star,
} from 'lucide-react';
import { motion } from 'motion/react';

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [myPets, setMyPets] = useState<any[]>([]);
  const [myPetsLoading, setMyPetsLoading] = useState(true);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [gamification, setGamification] = useState<any>(null);

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

    const fetchRecentReports = async () => {
      try {
        const data = await api.users.myPets(user.id);
        const reports = (data.pets || [])
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);
        setRecentReports(reports);
      } catch (e) {
        console.error('Error fetching recent reports:', e);
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
    fetchRecentReports();
    fetchStats();
    fetchGamification();
  }, [user, navigate]);

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
          {recentReports.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-dashed border-brand-accent p-6 text-center"
            >
              <Clock className="w-8 h-8 text-brand-accent mx-auto mb-2" />
              <p className="text-xs text-gray-500">Todavía no hay actividad</p>
              <button
                onClick={() => navigate('/reportar')}
                className="mt-3 px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all"
              >
                Hacer mi primer reporte
              </button>
            </motion.div>
          ) : (
            <div className="space-y-2">
              {recentReports.slice(0, 3).map((report, i) => (
                <motion.button
                  key={report.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => {
                    if (report.my_pet_id) navigate(`/mi-mascota/${report.my_pet_id}`);
                    else navigate(`/pet/${report.id}`);
                  }}
                  className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-brand-accent hover:border-brand-primary/30 hover:shadow-sm transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-xl overflow-hidden bg-brand-bg shrink-0">
                    {report.images?.[0]?.image_data ? (
                      <img src={`data:image/jpeg;base64,${report.images[0].image_data}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PawPrint className="w-4 h-4 text-brand-accent" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{report.name || 'Mascota sin nombre'}</p>
                    <p className="text-[10px] text-gray-400">
                      {report.status === 'lost' ? 'Perdido' : report.status === 'retained' ? 'Retenido' : report.status === 'sighted' ? 'Avistado' : report.status === 'adoption' ? 'En adopción' : 'Reportado'}
                      {' · '}{formatRelativeTime(report.created_at)}
                    </p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                </motion.button>
              ))}
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
      </div>

      {/* ─── DESKTOP LAYOUT ─── */}
      <div className="hidden lg:block">
        {/* Greeting */}
        <div className="flex items-center justify-between mb-6">
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

        {/* Mis mascotas strip */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
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
              className="bg-white rounded-2xl border border-dashed border-brand-accent p-6 text-center">
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
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-brand-bg border border-brand-accent group-hover:border-brand-primary/50 transition-all shadow-sm group-hover:shadow-md">
                    {pet.avatar_image ? (
                      <img src={`/my-pet-avatar/${pet.id}`} alt={pet.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PawPrint className="w-8 h-8 sm:w-10 sm:h-10 text-brand-accent" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-gray-700 text-center mt-1.5 truncate max-w-20 sm:max-w-24">{pet.name}</p>
                </motion.button>
              ))}
              <button onClick={() => navigate('/mi-mascota')}
                className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-dashed border-brand-accent flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-brand-primary hover:border-brand-primary transition-all">
                <Plus className="w-6 h-6" /><span className="text-[10px] font-medium">Agregar</span>
              </button>
            </div>
          )}
        </section>

        {/* Quick Actions Desktop */}
        <section className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">Acciones rápidas</h2>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action, i) => (
              <motion.button key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }} onClick={() => navigate(action.path)}
                className={`p-4 rounded-2xl border text-left transition-all ${action.color}`}>
                <div className="mb-2">{action.icon}</div>
                <p className="text-sm font-bold">{action.label}</p>
                <p className="text-xs opacity-75 mt-0.5">{action.desc}</p>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Recent Activity Desktop */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">Actividad reciente</h2>
          {recentReports.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-dashed border-brand-accent p-8 text-center">
              <Clock className="w-10 h-10 text-brand-accent mx-auto mb-2" />
              <p className="text-sm text-gray-500">Todavía no hay actividad</p>
              <button onClick={() => navigate('/reportar')}
                className="mt-3 px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all">
                Hacer mi primer reporte
              </button>
            </motion.div>
          ) : (
            <div className="space-y-2">
              {recentReports.map((report, i) => (
                <motion.button key={report.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => { if (report.my_pet_id) navigate(`/mi-mascota/${report.my_pet_id}`); else navigate(`/pet/${report.id}`); }}
                  className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-brand-accent hover:border-brand-primary/30 hover:shadow-sm transition-all text-left">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-brand-bg shrink-0">
                    {report.images?.[0]?.image_data ? (
                      <img src={`data:image/jpeg;base64,${report.images[0].image_data}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><PawPrint className="w-5 h-5 text-brand-accent" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{report.name || 'Mascota sin nombre'}</p>
                    <p className="text-xs text-gray-400">
                      {report.status === 'lost' ? 'Perdido' : report.status === 'retained' ? 'Retenido' : report.status === 'sighted' ? 'Avistado' : report.status === 'adoption' ? 'En adopción' : 'Reportado'}
                      {' · '}{formatRelativeTime(report.created_at)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </motion.button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
