import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import { createVolunteerRequest } from '@/src/lib/collaborationService';
import {
  Users,
  MapPin,
  Phone,
  User as UserIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  HeartHandshake
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AuthGate from '@/src/components/AuthGate';
import MemberCardPage from '@/src/pages/MemberCardPage';

export default function Join() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const CONTRIBUTION_AREAS = [
    { code: 'ayuda_traslados', label: 'Ayuda en traslados', icon: '🚗' },
    { code: 'hogares_transito', label: 'Hogares de tránsito', icon: '🏠' },
    { code: 'difusion_redes', label: 'Difusión en redes', icon: '📱' },
    { code: 'logistica', label: 'Logística y organización', icon: '📋' },
    { code: 'aporte_economico', label: 'Aporte económico', icon: '💰' },
    { code: 'fotografia_video', label: 'Fotografía y video', icon: '📸' },
    { code: 'recoleccion_insumos', label: 'Recolección de insumos', icon: '📦' },
    { code: 'apoyo_veterinario', label: 'Apoyo veterinario', icon: '🩺' },
    { code: 'asesoria_legal', label: 'Asesoría legal', icon: '⚖️' },
    { code: 'diseno_grafico', label: 'Diseño gráfico', icon: '🎨' },
  ];

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const prefilled = useRef(false);

  useEffect(() => {
    if (user && !prefilled.current) {
      setFormData({
        fullName: user.display_name || '',
        residenceZone: '',
        whatsapp: user.phone || ''
      });
      prefilled.current = true;
    }
  }, [user]);
  
  const [formData, setFormData] = useState({
    fullName: '',
    residenceZone: '',
    whatsapp: ''
  });
  const [contributionAreas, setContributionAreas] = useState<string[]>([]);

  const toggleArea = (code: string) => {
    setContributionAreas(prev => {
      if (prev.includes(code)) {
        return prev.filter(c => c !== code);
      }
      // Adding new area: enforce max 3
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, code];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Validate max 3 areas
    if (contributionAreas.length > 3) {
      setError('Puedes seleccionar un máximo de 3 áreas de contribución.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      await createVolunteerRequest({
        fullName: formData.fullName,
        residenceZone: formData.residenceZone,
        whatsapp: formData.whatsapp,
        contributionAreas,
      });
      setSuccess(true);
      setTimeout(() => navigate('/'), 4000);
    } catch (err: any) {
      console.error(err);
      setError('Hubo un error al procesar tu solicitud. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-brand-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (user && user.volunteer_status === 'active' && user.member_number) {
    return <MemberCardPage />;
  }

  if (user && user.volunteer_status === 'pending') {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 sm:p-8 md:p-12 rounded-[3rem] border border-brand-accent shadow-xl text-center"
          >
            <div className="w-20 h-20 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse animate-duration-1000">
            <Clock className="w-12 h-12" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-brand-primary mb-4">Solicitud en proceso</h1>
          <p className="text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">
            Ya enviaste una solicitud para sumarte a la red de vecinos. Tu postulación está a la espera de la autorización por parte del equipo de coordinación.
          </p>
          <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 text-sm text-brand-primary flex items-start gap-3 mb-8 text-left">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-brand-primary" />
            <div>
              <span className="font-bold block mb-0.5">Te notificaremos pronto</span>
              Una vez aprobada tu solicitud, este panel se convertirá en tu Carnet de Socio Digital donde verás tus insignias, logros e impacto vecinal.
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => navigate('/')}
              className="w-full sm:w-auto px-6 py-3 bg-brand-primary text-white rounded-2xl font-bold hover:shadow-lg transition-all"
            >
              Volver al inicio
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-4">
          <div className="grid md:grid-cols-2 gap-12 items-center mb-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-6">Sumate a la red de vecinos</h1>
              <p className="text-xl text-gray-600 leading-relaxed mb-8">
                Buscamos personas comprometidas que quieran ayudar en los barrios de Villa Garibaldi, Parque Sicardi e Ignacio Correas.
              </p>
              <div className="space-y-3">
                {CONTRIBUTION_AREAS.map(area => (
                  <div key={area.code} className="flex items-center gap-3 text-brand-dark font-medium">
                    <div className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs shrink-0">✓</div>
                    <span className="inline-block text-xl shrink-0" style={{ filter: 'sepia(0.4) hue-rotate(-10deg) saturate(0.7) brightness(0.9)' }}>{area.icon}</span>
                    <span>{area.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
        <AuthGate
          title="Empezá aquí"
          description="Debes iniciar sesión para solicitar unirte."
          icon={<Users className="w-16 h-16 text-brand-primary mx-auto mb-6" />}
        />
      </>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 md:py-20">
      <AnimatePresence>
        {success ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-6 sm:p-8 md:p-12 rounded-[3rem] border border-brand-accent shadow-xl text-center"
          >
            <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h1 className="text-4xl font-serif font-bold text-brand-primary mb-4">¡Solicitud enviada!</h1>
            <p className="text-gray-500 mb-8">Gracias por querer sumarte. El equipo de coordinación revisará tus datos y se pondrá en contacto pronto vía WhatsApp.</p>
            <button 
              onClick={() => navigate('/')}
              className="text-brand-primary font-bold hover:underline"
            >
              Volver al inicio
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 sm:p-8 md:p-12 rounded-[3rem] border border-brand-accent shadow-xl"
          >
            <div className="mb-10">
              <h1 className="text-4xl font-serif font-bold text-brand-primary mb-2 text-center">Sumate al movimiento</h1>
              <p className="text-gray-500 text-center">Completa tus datos para ser parte de la red de Sigo tu Huella.</p>
            </div>

            <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 text-sm text-brand-primary flex items-center gap-2 mb-6">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Cargamos tus datos de tu cuenta. Podés modificarlos si es necesario.
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <UserIcon className="w-3 h-3" />
                    Nombre y Apellido *
                  </label>
                  <div className="relative">
          <input
            id="volunteerFullName"
            name="full_name"
            required
            type="text"
            className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
            placeholder="Tu nombre completo"
            value={formData.fullName}
            onChange={e => setFormData({ ...formData, fullName: e.target.value })}
          />
                    {user?.display_name && (
                      <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <MapPin className="w-3 h-3" />
                    Zona de Residencia *
                  </label>
          <input
            id="volunteerResidence"
            name="residence_zone"
            required
            type="text"
            className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
            placeholder="Eje: Villa Garibaldi - Calle 10 y 610"
            value={formData.residenceZone}
            onChange={e => setFormData({ ...formData, residenceZone: e.target.value })}
          />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <Phone className="w-3 h-3" />
                    Número de WhatsApp *
                  </label>
                  <div className="relative">
          <input
            id="volunteerWhatsapp"
            name="whatsapp"
            required
            type="tel"
            className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
            placeholder="+54 9 221 ..."
            value={formData.whatsapp}
            onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
          />
                    {user?.phone && (
                      <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                    )}
                   </div>
                   </div>
                 </div>

{/* Contribution Areas */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HeartHandshake className="w-5 h-5 text-brand-primary" />
                      <label className="text-sm font-bold text-brand-primary">¿Cómo te gustaría ayudar?</label>
                    </div>
                    <span className="text-xs text-gray-500 font-medium">{contributionAreas.length}/3 áreas seleccionadas</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Elegí las áreas donde sentís que podés aportar. No hace falta que marques todo — cada granito suma.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CONTRIBUTION_AREAS.map(area => {
                      const checked = contributionAreas.includes(area.code);
                      const disabled = !checked && contributionAreas.length >= 3;
                      return (
                        <label
                          key={area.code}
                          className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                            checked
                              ? 'bg-brand-primary/10 border-brand-primary/30'
                              : disabled
                              ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
                              : 'bg-brand-bg border-brand-accent hover:border-brand-primary/20'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleArea(area.code)}
                            disabled={disabled}
                            className="w-4 h-4 rounded accent-brand-primary shrink-0"
                          />
                          <span className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
                            {area.icon} {area.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
  

              {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100 flex gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-brand-primary text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 font-serif text-xl"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Users className="w-6 h-6" />}
                Enviar Solicitud
              </button>
              
              <p className="text-xs text-center text-gray-400">
                Al enviar tus datos, el equipo de Sigo tu Huella podrá contactarte para coordinar acciones vecinales.
              </p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
