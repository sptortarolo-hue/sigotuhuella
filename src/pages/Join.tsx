import React, { useState } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AuthGate from '@/src/components/AuthGate';

export default function Join() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    fullName: '',
    residenceZone: '',
    whatsapp: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError('');
    
    try {
      await createVolunteerRequest({
        fullName: formData.fullName,
        residenceZone: formData.residenceZone,
        whatsapp: formData.whatsapp,
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

  if (!user) {
    return (
      <>
        <div className="max-w-4xl mx-auto px-4 pt-20 pb-4">
          <div className="grid md:grid-cols-2 gap-12 items-center mb-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-6">Sumate a la red de vecinos</h1>
              <p className="text-xl text-gray-600 leading-relaxed mb-8">
                Buscamos personas comprometidas que quieran ayudar en los barrios de Villa Garibaldi, Parque Sicardi e Ignacio Correas.
              </p>
              <div className="space-y-4">
                {[
                  'Ayuda en traslados',
                  'Hogares de tránsito',
                  'Difusión en redes',
                  'Logística y organización'
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-brand-dark font-medium">
                    <div className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">✓</div>
                    {item}
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
    <div className="max-w-2xl mx-auto px-4 py-12 md:py-20">
      <AnimatePresence>
        {success ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-8 md:p-12 rounded-[3rem] border border-brand-accent shadow-xl text-center"
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
            className="bg-white p-8 md:p-12 rounded-[3rem] border border-brand-accent shadow-xl"
          >
            <div className="mb-10">
              <h1 className="text-4xl font-serif font-bold text-brand-primary mb-2 text-center">Sumate al movimiento</h1>
              <p className="text-gray-500 text-center">Completa tus datos para ser parte de la red de Sigo tu Huella.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <UserIcon className="w-3 h-3" />
                    Nombre y Apellido *
                  </label>
                  <input
                    required
                    type="text"
                    className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                    placeholder="Tu nombre completo"
                    value={formData.fullName}
                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <MapPin className="w-3 h-3" />
                    Zona de Residencia *
                  </label>
                  <input
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
                  <input
                    required
                    type="tel"
                    className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                    placeholder="+54 9 221 ..."
                    value={formData.whatsapp}
                    onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                  />
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
