import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Loader2, Share2, Search, MapPin, Bell, Heart, ArrowRight } from 'lucide-react';
import { getVolunteerDashboard } from '@/src/lib/volunteerService';

interface Subscription {
  agrupacion_name: string;
  category_name: string;
  category_icon: string;
  agrupacion_neighborhoods: string[];
}

interface PetInZone {
  id: string;
  name: string;
  species: string;
  status: string;
  location: string;
  neighborhoods: string[];
  created_at: string;
}

interface ShareStat {
  platform: string;
  count: number;
}

interface DashboardData {
  subscriptions: Subscription[];
  pets_in_zone: PetInZone[];
  share_stats: ShareStat[];
  total_shares: number;
  unread_notifications: number;
  neighborhoods_count: number;
}

const speciesLabel = (s: string) => s === 'dog' ? 'Perro' : s === 'cat' ? 'Gato' : 'Otro';
const speciesEmoji = (s: string) => s === 'dog' ? '🐶' : s === 'cat' ? '🐱' : '🐾';

const statusColors: Record<string, string> = {
  lost: 'bg-red-100 text-red-700',
  sighted: 'bg-amber-100 text-amber-700',
  retained: 'bg-blue-100 text-blue-700',
  accided: 'bg-orange-100 text-orange-700',
  needs_attention: 'bg-purple-100 text-purple-700',
  for_adoption: 'bg-emerald-100 text-emerald-700',
  for_adoption_simple: 'bg-teal-100 text-teal-700',
  reunited: 'bg-green-100 text-green-700',
};

const statusLabel: Record<string, string> = {
  lost: 'Perdido',
  sighted: 'Avistado',
  retained: 'Retenido',
  accided: 'Accidentado',
  needs_attention: 'Necesita Atención',
  for_adoption: 'En Adopción',
  for_adoption_simple: 'Adopción Simple',
  reunited: 'Reunido',
};

const platformIcons: Record<string, string> = {
  facebook: '📘',
  whatsapp: '💬',
  instagram: '📷',
  twitter: '🐦',
  telegram: '✈️',
  other: '🔗',
};

export default function VolunteerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const result = await getVolunteerDashboard();
        setData(result);
      } catch (e: any) {
        setError(e.message || 'Error al cargar el dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error || 'No se pudo cargar el dashboard'}</p>
          <Link to="/" className="text-brand-primary text-sm font-bold hover:underline">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const stats = [
    { label: 'Compartidos', value: data.total_shares, icon: Share2, color: 'bg-brand-primary/10 text-brand-primary' },
    { label: 'Mascotas en zona', value: data.pets_in_zone.length, icon: Search, color: 'bg-amber-100 text-amber-600' },
    { label: 'Barrios', value: data.neighborhoods_count, icon: MapPin, color: 'bg-emerald-100 text-emerald-600' },
    { label: 'Notificaciones', value: data.unread_notifications, icon: Bell, color: 'bg-red-100 text-red-600' },
  ];

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 sm:mb-12 text-center max-w-2xl mx-auto"
        >
          <div className="inline-flex p-3 bg-brand-primary/10 text-brand-primary rounded-2xl mb-4">
            <Heart className="w-8 h-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-brand-primary mb-2">
            Mi Dashboard
          </h1>
          <p className="text-gray-500 text-sm sm:text-base">
            Resumen de tu actividad como voluntario
          </p>
        </motion.header>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 sm:mb-12">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white rounded-[2rem] p-5 sm:p-6 border border-brand-accent shadow-sm"
            >
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-3 ${stat.color}`}>
                <stat.icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-gray-800">{stat.value}</p>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Share Stats by Platform */}
        {data.share_stats.length > 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-8 sm:mb-12"
          >
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary mb-4">
              Compartidos por plataforma
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.share_stats.map((stat) => (
                <div
                  key={stat.platform}
                  className="bg-white rounded-2xl p-4 border border-brand-accent shadow-sm flex items-center gap-3"
                >
                  <span className="text-2xl">{platformIcons[stat.platform] || '🔗'}</span>
                  <div>
                    <p className="text-lg font-bold text-gray-800">{stat.count}</p>
                    <p className="text-xs text-gray-500 capitalize">{stat.platform}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Subscriptions */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mb-8 sm:mb-12"
        >
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary mb-4">
            Mis Suscripciones
          </h2>
          {data.subscriptions.length > 0 ? (
            <div className="space-y-3">
              {data.subscriptions.map((sub, i) => (
                <motion.div
                  key={`${sub.agrupacion_name}-${sub.category_name}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  className="bg-white rounded-2xl p-4 sm:p-5 border border-brand-accent shadow-sm flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 truncate">{sub.agrupacion_name}</p>
                    {sub.agrupacion_neighborhoods?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {sub.agrupacion_neighborhoods.slice(0, 3).join(', ')}
                        {sub.agrupacion_neighborhoods.length > 3 && ` +${sub.agrupacion_neighborhoods.length - 3}`}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary/10 text-brand-primary text-xs font-bold rounded-full shrink-0">
                    <span>{sub.category_icon}</span>
                    {sub.category_name}
                  </span>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] p-8 border border-dashed border-brand-accent text-center">
              <p className="text-gray-500 mb-4">Todavía no te suscribiste a ninguna agrupación</p>
              <Link
                to="/sumate"
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-xl text-sm font-bold hover:bg-brand-primary/90 transition-colors"
              >
                Suscribirme <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </motion.section>

        {/* Pets in Zone */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary">
              Mascotas en mi zona
            </h2>
            {data.pets_in_zone.length > 0 && (
              <Link to="/feed" className="text-xs sm:text-sm text-brand-primary font-bold hover:underline flex items-center gap-1">
                Ver todas <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
              </Link>
            )}
          </div>
          {data.pets_in_zone.length > 0 ? (
            <div className="space-y-3">
              {data.pets_in_zone.map((pet, i) => (
                <motion.div
                  key={pet.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                  className="bg-white rounded-2xl p-4 sm:p-5 border border-brand-accent shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{speciesEmoji(pet.species)}</span>
                        <p className="font-bold text-gray-800 truncate">{pet.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${statusColors[pet.status] || 'bg-gray-100 text-gray-600'}`}>
                          {statusLabel[pet.status] || pet.status}
                        </span>
                      </div>
                      {pet.location && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{pet.location}</span>
                        </p>
                      )}
                    </div>
                    <Link
                      to={`/pet/${pet.id}`}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-primary text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-brand-primary/90 transition-colors shrink-0"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Compartir
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] p-8 border border-dashed border-brand-accent text-center">
              <p className="text-gray-500">No hay mascotas reportadas en tu zona</p>
            </div>
          )}
        </motion.section>

      </div>
    </div>
  );
}
