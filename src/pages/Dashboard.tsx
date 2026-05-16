import React, { useState, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { api } from '@/src/lib/api';
import {
  User, Lock, PawPrint, Mail, Phone, ArrowRight,
  Loader2, Settings, PlusCircle, Edit3, ShieldAlert
} from 'lucide-react';
import { motion } from 'motion/react';

export default function Dashboard() {
  const { user, loading, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [pets, setPets] = useState<any[]>([]);
  const [petsLoading, setPetsLoading] = useState(true);
  const [profileData, setProfileData] = useState<{
    display_name: string;
    email: string;
    phone: string | null;
    role: string;
    created_at: string;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchData = async () => {
      try {
        // Datos del usuario desde el endpoint /me (siempre actualizados)
        // pero ya tenemos `user` desde el contexto
        setProfileData({
          display_name: user.display_name || '',
          email: user.email,
          phone: user.phone || null,
          role: user.role,
          created_at: ''
        });
      } catch (e) {
        console.error(e);
      }
    };

    const fetchPets = async () => {
      try {
        setPetsLoading(true);
        const data = await api.users.myPets(user.id);
        setPets(data.pets || []);
      } catch (e) {
        console.error(e);
      } finally {
        setPetsLoading(false);
      }
    };

    fetchData();
    fetchPets();
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-brand-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const formatDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  // Última publicación
  const latestPet = pets.reduce((latest, p) => {
    return !latest || new Date(p.created_at) > new Date(latest.created_at) ? p : latest;
  }, null as any);

  const quickActions = [
    {
      icon: <PawPrint className="w-6 h-6" />,
      title: 'Mis Reportes',
      description: `${pets.length} publicacion${pets.length !== 1 ? 'es' : ''}`,
      color: 'bg-brand-primary/10 text-brand-primary',
      onClick: () => navigate('/mis-publicaciones')
    },
    {
      icon: <Edit3 className="w-6 h-6" />,
      title: 'Editar Perfil',
      description: 'Tu nombre y datos de contacto',
      color: 'bg-emerald-500/10 text-emerald-600',
      onClick: () => navigate('/perfil')
    },
    {
      icon: <Lock className="w-6 h-6" />,
      title: 'Contraseña',
      description: 'Cambiar tu contraseña',
      color: 'bg-amber-500/10 text-amber-600',
      onClick: () => navigate('/perfil')
    },
    {
      icon: <PlusCircle className="w-6 h-6" />,
      title: 'Publicar',
      description: 'Nuevo reporte de mascota',
      color: 'bg-red-500/10 text-red-600',
      onClick: () => navigate('/reportar')
    }
  ];

  if (isAdmin) {
    quickActions.push({
      icon: <ShieldAlert className="w-6 h-6" />,
      title: 'Panel Admin',
      description: 'Gestionar usuarios y reportes',
      color: 'bg-purple-500/10 text-purple-600',
      onClick: () => navigate('/admin')
    });
  }

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="max-w-4xl mx-auto px-4 pb-20">
      {/* Header */}
      <div className="relative -mx-4 -mt-4 mb-8 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-b-[3rem] px-6 py-10 shadow-xl overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {user.display_name || 'Usuario'}
            </h1>
            <p className="text-white/80 text-sm flex items-center gap-1">
              <Mail className="w-3 h-3" /> {user.email}
            </p>
            {user.phone && (
              <p className="text-white/70 text-xs flex items-center gap-1">
                <Phone className="w-3 h-3" /> {user.phone}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Estado de cuenta */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[2rem] border border-brand-accent p-6 mb-8 shadow-sm"
      >
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Estado de mi cuenta</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-brand-bg rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-brand-primary">{pets.length}</div>
            <div className="text-xs text-gray-500">Reportes publicados</div>
          </div>
          <div className="bg-brand-bg rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-brand-primary">
              {pets.filter(p => p.status === 'lost').length}
            </div>
            <div className="text-xs text-gray-500">Perdidos</div>
          </div>
          <div className="bg-brand-bg rounded-xl p-4 text-center">
<div className="text-2xl font-bold text-emerald-600">
               {pets.filter(p => p.status === 'retained').length}
             </div>
             <div className="text-xs text-gray-500">Retenidos</div>
          </div>
          <div className="bg-brand-bg rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">
              {pets.filter(p => p.is_admin_verified).length}
            </div>
            <div className="text-xs text-gray-500">Verificados</div>
          </div>
        </div>
      </motion.div>

      {/* Acciones rápidas */}
      <h3 className="text-lg font-bold text-brand-primary mb-4">Accesos rápidos</h3>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8"
      >
        {quickActions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className={`group p-5 rounded-[2rem] border border-brand-accent hover:border-brand-primary hover:shadow-lg transition-all text-left ${action.color}`}
          >
            <div className="flex items-center gap-3 mb-2">
              {action.icon}
              <span className="text-sm font-bold text-gray-800">{action.title}</span>
            </div>
            <p className="text-xs text-gray-500 ml-6">{action.description}</p>
            <ArrowRight className="w-4 h-4 text-gray-300 ml-4 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </motion.div>

      {/* Última publicación */}
      {latestPet ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] border border-brand-accent p-6 mb-8 shadow-sm"
        >
          <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Última publicación</h3>
          <div className="flex items-center gap-4 p-4 bg-brand-bg rounded-2xl">
            <img
              src={latestPet.images?.[0]?.image_data || '/sigotuhuella.jpg'}
              alt={latestPet.name}
              className="w-20 h-20 object-cover rounded-2xl"
            />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-brand-primary">{latestPet.name || 'Sin nombre'}</h4>
              <p className="text-xs text-gray-500">{latestPet.location}</p>
              <p className="text-xs text-gray-400">
                {latestPet.status === 'lost' ? '🟢 Buscando' : latestPet.status === 'retained' ? '🔵 Retenido' : latestPet.status === 'sighted' ? '🟡 Avistado' : latestPet.status === 'accidented' ? '🟣 Accidentado' : latestPet.status === 'needs_attention' ? '🟠 Necesita Atención' : '🟢 En Adopción'} · {formatDate(latestPet.created_at)}
              </p>
            </div>
          </div>
        </motion.div>
      ) : (
        !petsLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2rem] border border-dashed border-brand-accent p-6 mb-8 text-center"
          >
            <p className="text-gray-400 font-medium">
              No publicaste ningún reporte todavía.
            </p>
            <button
              onClick={() => navigate('/reportar')}
              className="mt-4 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all"
            >
              <PlusCircle className="w-4 h-4 inline mr-2" />
              Hacer mi primer reporte
            </button>
          </motion.div>
        )
      )}

      {/* Datos personales */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[2rem] border border-brand-accent p-6 mb-8 shadow-sm"
      >
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Datos personales</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-2">
            <User className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Nombre</p>
              <p className="text-sm font-medium text-gray-800">{user.display_name || 'Sin nombre'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-2">
            <Mail className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Correo</p>
              <p className="text-sm font-medium text-gray-800">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-2">
            <Phone className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">WhatsApp / Teléfono</p>
              <p className="text-sm font-medium text-gray-800">{user.phone || 'Sin teléfono'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-2">
            {user.role === 'admin' ? (
              <ShieldAlert className="w-4 h-4 text-purple-500" />
            ) : (
              <User className="w-4 h-4 text-gray-400" />
            )}
            <div>
              <p className="text-xs text-gray-400">Rol</p>
              <p className="text-sm font-medium text-gray-800">
                {user.role === 'admin' ? 'Administrador' : 'Vecino'}
              </p>
            </div>
          </div>
<div className="flex items-center gap-3 p-2">
             <PawPrint className="w-4 h-4 text-gray-400" />
             <div>
               <p className="text-xs text-gray-400">Miembro desde</p>
               <p className="text-sm font-medium text-gray-800">{memberSince}</p>
             </div>
           </div>
        </div>
      </motion.div>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          onClick={() => { logout(); navigate('/'); }}
          className="w-full py-4 bg-white text-red-600 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-red-50 border border-red-100 transition-all"
        >
          <Lock className="w-5 h-5" />
          Cerrar Sesión
        </button>
      </motion.div>
    </div>
  );
}