import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import {
  getAgrupaciones,
  getCategories,
  subscribe,
} from '@/src/lib/volunteerService';
import {
  Users,
  MapPin,
  Phone,
  User as UserIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Share2,
  Search,
  Home,
  Truck,
  Heart,
  Plus,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AuthGate from '@/src/components/AuthGate';
import MemberCardPage from '@/src/pages/MemberCardPage';
import { PhoneInput } from '@/src/components/PhoneInput';
import { toE164 } from '@/src/lib/phone';
import { Helmet } from 'react-helmet-async';

interface Agrupacion {
  id: string;
  name: string;
  description?: string;
  neighborhoods?: string[];
}

interface Category {
  id: string;
  code: string;
  name: string;
  icon?: string;
  description?: string;
}

export default function Join() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const prefilled = useRef(false);

  const [agrupaciones, setAgrupaciones] = useState<Agrupacion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAgrupaciones, setSelectedAgrupaciones] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string[]>>({});
  const [loadingData, setLoadingData] = useState(true);

  const [formData, setFormData] = useState({
    fullName: '',
    residenceZone: '',
    whatsapp: '',
  });
  const [phoneValid, setPhoneValid] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  const location = useLocation();
  const pendingCatFromNav = (location.state as any)?.pendingCategoryId as string | undefined;

  useEffect(() => {
    if (user && !prefilled.current) {
      const whatsapp = user.phone || '';
      setFormData({
        fullName: user.display_name || '',
        residenceZone: '',
        whatsapp,
      });
      setPhoneValid(!!toE164(whatsapp));
      prefilled.current = true;

      const catId = pendingCatFromNav;
      if (catId) {
        getAgrupaciones().then(ags => {
          if (ags && ags.length > 0) {
            setSelectedAgrupaciones([ags[0].id]);
            setSelectedCategories({ [ags[0].id]: [catId] });
            setStep(2);
          }
        });
      }
    }
  }, [user]);

  useEffect(() => {
    async function load() {
      try {
        const [agrupacionesData, categoriesData] = await Promise.all([
          getAgrupaciones(),
          getCategories(),
        ]);
        setAgrupaciones(agrupacionesData || []);
        setCategories(categoriesData || []);
      } catch {
        setError('No se pudieron cargar los datos. Intentá de nuevo.');
      } finally {
        setLoadingData(false);
      }
    }
    if (user) load();
  }, [user]);

  const handleWhatsappChange = (value: string, e164?: string) => {
    setFormData(prev => ({ ...prev, whatsapp: value }));
    setPhoneValid(!!e164);
  };

  const toggleAgrupacion = (id: string) => {
    setSelectedAgrupaciones(prev => {
      if (prev.includes(id)) {
        const next = prev.filter(a => a !== id);
        const newCategories = { ...selectedCategories };
        delete newCategories[id];
        setSelectedCategories(newCategories);
        return next;
      }
      return [...prev, id];
    });
  };

  const toggleCategoryForAgrupacion = (agrupacionId: string, categoryId: string) => {
    setSelectedCategories(prev => {
      const current = prev[agrupacionId] || [];
      const next = current.includes(categoryId)
        ? current.filter(c => c !== categoryId)
        : [...current, categoryId];
      return { ...prev, [agrupacionId]: next };
    });
  };

  const canAdvanceStep2 = selectedAgrupaciones.every(id => selectedCategories[id]?.length > 0);

  const handleSubmit = async () => {
    if (!user) return;
    if (!phoneValid) {
      setError('El teléfono no tiene el formato correcto');
      return;
    }
    setLoading(true);
    setError('');
    try {
      for (const agrupacionId of selectedAgrupaciones) {
        const categoryIds = selectedCategories[agrupacionId] || [];
        for (const categoryId of categoryIds) {
          await subscribe(agrupacionId, categoryId);
        }
      }
      setSuccess(true);
      setTimeout(() => navigate('/'), 4000);
    } catch (err: any) {
      console.error(err);
      setError('Hubo un error al procesar tu solicitud. Por favor intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (code: string) => {
    switch (code) {
      case 'difusion':
        return <Share2 className="w-8 h-8" />;
      case 'busqueda':
        return <Search className="w-8 h-8" />;
      case 'hogar_transito':
        return <Home className="w-8 h-8" />;
      case 'traslado':
        return <Truck className="w-8 h-8" />;
      case 'donante':
        return <Heart className="w-8 h-8" />;
      case 'otra':
        return <Plus className="w-8 h-8" />;
      default:
        return <Users className="w-8 h-8" />;
    }
  };

  const stepDots = [1, 2, 3];

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-brand-primary">
        <Helmet>
          <title>Sumate - Sigo Tu Huella</title>
          <meta name="description" content="Unite como voluntario a la red de rescate de mascotas." />
        </Helmet>
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
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-brand-primary mb-4">
            Solicitud en proceso
          </h1>
          <p className="text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">
            Ya enviaste una solicitud para sumarte a la red. Tu postulación está a la espera de la autorización del equipo de coordinación.
          </p>
          <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 text-sm text-brand-primary flex items-start gap-3 mb-8 text-left">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-brand-primary" />
            <div>
              <span className="font-bold block mb-0.5">Te notificaremos pronto</span>
              Una vez aprobada tu solicitud, este panel se convertirá en tu Carnet de Socio Digital.
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full sm:w-auto px-6 py-3 bg-brand-primary text-white rounded-2xl font-bold hover:shadow-lg transition-all"
          >
            Volver al inicio
          </button>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-4">
          <div className="grid md:grid-cols-2 gap-12 items-center mb-12">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-6">
                Sumate a la red de vecinos
              </h1>
              <p className="text-xl text-gray-600 leading-relaxed mb-8">
                Elegí cómo querés ayudar: difundiendo, buscando, albergando o colaborando de otras formas.
              </p>
              <div className="space-y-4">
                {[
                  { id: 'difusion', icon: Share2, title: 'Difusor en Redes', desc: 'Compartí publicaciones de mascotas perdidas en tus redes sociales y grupos de WhatsApp.' },
                  { id: 'busqueda', icon: Search, title: 'Buscador Activo', desc: 'Investiguá en grupos de Facebook y redes sociales para encontrar pistas de mascotas perdidas.' },
                  { id: 'hogar_transito', icon: Home, title: 'Hogar de Tránsito', desc: 'Ofrecé tu hogar temporalmente para albergar mascotas rescatadas.' },
                ].map(card => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      setPendingCategoryId(card.id);
                      setAuthModalOpen(true);
                    }}
                    className="w-full p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 flex items-start gap-4 text-left hover:border-brand-primary/40 hover:shadow-md hover:bg-brand-primary/10 transition-all cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-brand-primary text-white rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <card.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-brand-primary font-serif text-lg">{card.title}</h3>
                      <p className="text-sm text-gray-600">
                        {card.desc}
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-brand-primary/40 group-hover:text-brand-primary ml-auto shrink-0 mt-1 transition-colors" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
        <AuthGate
          variant="modal"
          open={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          title="Empezá aquí"
          description="Debés iniciar sesión para solicitar unirte."
          icon={<Users className="w-16 h-16 text-brand-primary mx-auto mb-6" />}
          onSuccess={() => {
            setAuthModalOpen(false);
            navigate('/sumate', { state: { pendingCategoryId }, replace: true });
          }}
        />
      </>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 md:py-20">
      <AnimatePresence mode="wait">
        {success ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-6 sm:p-8 md:p-12 rounded-[3rem] border border-brand-accent shadow-xl text-center"
          >
            <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h1 className="text-4xl font-serif font-bold text-brand-primary mb-4">¡Listo!</h1>
            <p className="text-gray-500 mb-8">
              Te suscribiste correctamente. Te notificaremos cuando haya novedades en tus agrupaciones.
            </p>
            <button
              onClick={() => navigate('/')}
              className="text-brand-primary font-bold hover:underline"
            >
              Volver al inicio
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="wizard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 sm:p-8 md:p-12 rounded-[3rem] border border-brand-accent shadow-xl"
          >
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-3 mb-8">
              {stepDots.map(s => (
                <React.Fragment key={s}>
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                      step === s
                        ? 'bg-brand-primary text-white scale-110'
                        : s < step
                        ? 'bg-green-500 text-white'
                        : 'bg-brand-accent text-gray-500'
                    }`}
                  >
                    {s < step ? <CheckCircle2 className="w-5 h-5" /> : s}
                  </div>
                  {s < 3 && (
                    <div
                      className={`w-8 h-0.5 ${
                        s < step ? 'bg-green-500' : 'bg-brand-accent'
                      }`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>

            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-brand-primary text-center mb-2">
              {step === 1 && 'Elegí tu agrupación'}
              {step === 2 && 'Definí tu rol'}
              {step === 3 && 'Tus datos de contacto'}
            </h2>
            <p className="text-gray-500 text-center text-sm mb-8">
              {step === 1 && 'Podés seleccionar más de una agrupación.'}
              {step === 2 && 'Elegí en qué querés ayudar. Podés seleccionar varias categorías.'}
              {step === 3 && 'Completá tus datos para que podamos coordinar con vos.'}
            </p>

            {/* Loading data */}
            {loadingData && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
              </div>
            )}

            {/* Step 1: Select agrupación(es) */}
            {!loadingData && step === 1 && (
              <div className="space-y-3">
                {agrupaciones.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    No hay agrupaciones disponibles en este momento.
                  </p>
                )}
                {agrupaciones.map(ag => {
                  const checked = selectedAgrupaciones.includes(ag.id);
                  return (
                    <label
                      key={ag.id}
                      className={`block p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all ${
                        checked
                          ? 'bg-brand-primary/10 border-brand-primary/30 shadow-sm'
                          : 'bg-brand-bg border-brand-accent hover:border-brand-primary/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAgrupacion(ag.id)}
                          className="w-5 h-5 mt-0.5 rounded accent-brand-primary shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-brand-primary text-base block">
                            {ag.name}
                          </span>
                          {ag.description && (
                            <span className="text-sm text-gray-500 block mt-1 leading-relaxed">
                              {ag.description}
                            </span>
                          )}
                          {ag.neighborhoods && ag.neighborhoods.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {ag.neighborhoods.map(n => (
                                <span
                                  key={n}
                                  className="text-[10px] sm:text-xs bg-brand-accent text-gray-600 px-2 py-0.5 rounded-full"
                                >
                                  {n}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Step 2: For EACH selected agrupación, select categories */}
            {!loadingData && step === 2 && (
              <div className="space-y-6">
                {selectedAgrupaciones.map(agId => {
                  const ag = agrupaciones.find(a => a.id === agId);
                  if (!ag) return null;
                  const selectedForAg = selectedCategories[agId] || [];
                  return (
                    <div key={agId}>
                      <h3 className="font-bold text-brand-primary font-serif mb-3 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {ag.name}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {categories.map(cat => {
                          const isSelected = selectedForAg.includes(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => toggleCategoryForAgrupacion(agId, cat.id)}
                              className={`p-4 sm:p-5 rounded-2xl border text-left transition-all flex items-center gap-4 ${
                                isSelected
                                  ? 'bg-brand-primary/10 border-brand-primary/30 shadow-sm'
                                  : 'bg-brand-bg border-brand-accent hover:border-brand-primary/20'
                              }`}
                            >
                              <div
                                className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? 'bg-brand-primary text-white'
                                    : 'bg-brand-accent text-brand-primary'
                                }`}
                              >
                                {getCategoryIcon(cat.id)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-brand-primary text-sm block">
                                  {cat.name}
                                </span>
                                {cat.description && (
                                  <span className="text-xs text-gray-500 block mt-0.5 leading-relaxed line-clamp-2">
                                    {cat.description}
                                  </span>
                                )}
                              </div>
                              {isSelected && (
                                <CheckCircle2 className="w-5 h-5 text-brand-primary shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 3: Contact info */}
            {step === 3 && (
              <div className="space-y-5">
                {user?.display_name && (
                  <div className="p-3 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 text-sm text-brand-primary flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Cargamos tus datos de tu cuenta. Podés modificarlos si es necesario.
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <UserIcon className="w-3 h-3" />
                    Nombre y Apellido *
                  </label>
                  <div className="relative">
                    <input
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
                    required
                    type="text"
                    className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                    placeholder="Ej: Villa Garibaldi - Calle 10 y 610"
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
                    <PhoneInput
                      value={formData.whatsapp}
                      onChange={handleWhatsappChange}
                      placeholder="549XXXXXXXXXX"
                      className="bg-brand-bg"
                    />
                    {user?.phone && (
                      <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100 flex gap-2 mt-6">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            {/* Navigation buttons */}
            {!loadingData && (
              <div className="flex items-center justify-between gap-4 mt-8">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setStep(s => s - 1);
                    }}
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-brand-primary bg-brand-bg border border-brand-accent hover:border-brand-primary/20 transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Atrás
                  </button>
                ) : (
                  <div />
                )}

                {step < 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      if (step === 1 && selectedAgrupaciones.length === 0) {
                        setError('Seleccioná al menos una agrupación.');
                        return;
                      }
                      if (step === 2 && !canAdvanceStep2) {
                        setError('Elegí al menos una categoría para cada agrupación.');
                        return;
                      }
                      setStep(s => s + 1);
                    }}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white bg-brand-primary hover:shadow-lg transition-all"
                  >
                    Siguiente
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || !phoneValid || !formData.fullName.trim() || !formData.residenceZone.trim()}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white bg-brand-primary hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Enviar
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}