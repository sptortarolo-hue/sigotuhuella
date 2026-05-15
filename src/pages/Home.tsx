import { Link } from 'react-router-dom';
import { ArrowRight, Heart, Search, ShieldCheck, X, Map, MessageCircle, Image, Compass } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import NewsCarousel from '@/src/components/NewsCarousel';
import { getNews } from '@/src/lib/newsService';

export default function Home() {
  const [showLostModal, setShowLostModal] = useState(false);
  const [news, setNews] = useState<any[]>([]);

  useEffect(() => {
    getNews().then(setNews).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative min-h-[70vh] sm:min-h-[80vh] flex items-center overflow-hidden bg-brand-bg px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center relative z-10 py-12 sm:py-20">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-secondary/10 text-brand-secondary rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-4 sm:mb-6">
              <ShieldCheck className="w-3 h-3 sm:w-4 sm:h-4" />
              Barrios Villa Garibaldi • Sicardi • Correas
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif font-bold text-brand-primary leading-[0.95] mb-6">
              Sigo tu <br />
              <span className="text-brand-secondary">huella.</span>
            </h1>
            <p className="text-base sm:text-lg text-gray-600 leading-relaxed mb-8 max-w-lg">
              Movimiento de vecinos autoconvocados dedicado a la atención y abordaje de mascotas en situación de vulnerabilidad. Juntos construimos una comunidad más empática.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowLostModal(true)}
                className="w-full sm:w-auto px-6 py-3.5 sm:px-8 sm:py-4 bg-brand-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-brand-primary/90 transition-all shadow-lg hover:shadow-brand-primary/20 text-sm sm:text-base"
              >
                ¿Perdiste a tu mascota?
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <Link
                to="/adopcion"
                className="w-full sm:w-auto px-6 py-3.5 sm:px-8 sm:py-4 bg-white text-brand-primary border border-brand-accent rounded-2xl font-bold hover:border-brand-primary transition-all text-center text-sm sm:text-base"
              >
                Quiero adoptar
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative flex justify-center md:justify-end"
          >
            <div className="w-60 sm:w-72 md:w-80 aspect-[4/5] bg-brand-accent rounded-[2rem] sm:rounded-[3rem] overflow-hidden rotate-3 shadow-2xl relative">
              <img
                src="/sigotuhuella.jpg"
                alt="Sigo tu huella"
                className="w-full h-full object-cover hover:scale-105 transition-all duration-700"
              />
            </div>
            <div className="absolute -bottom-4 -left-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl border border-brand-accent -rotate-2">
              <span className="block text-2xl sm:text-3xl font-serif font-bold text-brand-secondary">+150</span>
              <span className="text-[10px] sm:text-xs uppercase tracking-widest text-gray-500 font-bold">Mascotas Ayudadas</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Lost Pet Modal - Enhanced */}
      <AnimatePresence>
        {showLostModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLostModal(false)}
              className="absolute inset-0 bg-brand-primary/30 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="p-6 sm:p-10 lg:p-12">
                <button
                  onClick={() => setShowLostModal(false)}
                  className="absolute top-4 right-4 p-2 hover:bg-brand-bg rounded-full transition-colors z-10"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                </button>

                {/* Encabezado empático */}
                <div className="mb-8 sm:mb-10 text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                    <Heart className="w-8 h-8 sm:w-10 sm:h-10 text-red-500 fill-red-500" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-brand-primary mb-3 sm:mb-4 leading-tight">
                    No pierdas la calma, estamos acá para ayudarte
                  </h2>
                  <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-lg mx-auto">
                    Entendemos lo angustiante que es perder a un miembro de la familia. 
                    Respirá hondo, no estás solo. Toda la comunidad de Sicardi, Garibaldi y Correas está lista para ayudar.
                  </p>
                </div>

                <div className="space-y-6 sm:space-y-8">
                  {/* Paso 1: Buscar */}
                  <div className="relative pl-12 sm:pl-16">
                    <div className="absolute left-0 top-0 w-9 h-9 sm:w-11 sm:h-11 bg-brand-primary text-white rounded-full flex items-center justify-center font-bold text-sm sm:text-base shadow-md">
                      1
                    </div>
                    <div className="bg-brand-bg/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-brand-accent">
                      <h3 className="text-lg sm:text-xl font-bold text-brand-primary mb-2 flex items-center gap-2">
                        <Search className="w-5 h-5 text-brand-secondary" />
                        Buscá en Mascotas Reportadas
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed mb-4">
                        Antes de publicar, revisá si alguien ya encontró a tu mascota. 
                        Usá el buscador por <strong>nombre, ubicación, especie, raza, color o cualquier palabra clave</strong> 
                        para filtrar los reportes. También podés cambiar a <strong>vista de mapa</strong> para buscar en una zona en particular.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Link
                          to="/perdidos"
                          onClick={() => setShowLostModal(false)}
                          className="flex-1 px-5 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg transition-all"
                        >
                          <Search className="w-4 h-4" />
                          Buscar en Reportes
                        </Link>
                        <Link
                          to="/perdidos"
                          onClick={() => setShowLostModal(false)}
                          className="flex-1 px-5 py-3 bg-white border border-brand-accent text-brand-primary rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:border-brand-primary transition-all"
                        >
                          <Map className="w-4 h-4" />
                          Ver en Mapa
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Paso 2: Publicar */}
                  <div className="relative pl-12 sm:pl-16">
                    <div className="absolute left-0 top-0 w-9 h-9 sm:w-11 sm:h-11 bg-brand-secondary text-white rounded-full flex items-center justify-center font-bold text-sm sm:text-base shadow-md">
                      2
                    </div>
                    <div className="bg-brand-bg/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-brand-accent">
                      <h3 className="text-lg sm:text-xl font-bold text-brand-primary mb-2 flex items-center gap-2">
                        <Compass className="w-5 h-5 text-brand-secondary" />
                        Publicá un reporte
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed mb-4">
                        Si no encontraste a tu mascota en los reportes, creá una publicación con sus fotos, 
                        la última ubicación donde fue vista y tus datos de contacto. 
                        Así toda la red vecinal va a estar atenta para ayudarte.
                      </p>
                      <Link
                        to="/reportar"
                        onClick={() => setShowLostModal(false)}
                        className="inline-flex items-center gap-2 px-5 py-3 bg-brand-secondary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all"
                      >
                        <ArrowRight className="w-4 h-4" />
                        Publicar Mascota Perdida
                      </Link>
                    </div>
                  </div>

                  {/* Paso 3: Compartir */}
                  <div className="relative pl-12 sm:pl-16">
                    <div className="absolute left-0 top-0 w-9 h-9 sm:w-11 sm:h-11 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold text-sm sm:text-base shadow-md">
                      3
                    </div>
                    <div className="bg-brand-bg/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-brand-accent">
                      <h3 className="text-lg sm:text-xl font-bold text-brand-primary mb-2 flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-emerald-500" />
                        Generá un flyer y compartilo
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed mb-4">
                        Después de publicar, podés generar un <strong>flyer digital optimizado</strong> con los datos de tu mascota 
                        para compartir en grupos de WhatsApp y redes sociales. 
                        Entre más personas lo vean, más chances de reencontrarte con tu mascota.
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 bg-white p-3 sm:p-4 rounded-xl border border-brand-accent">
                        <Image className="w-5 h-5 text-brand-secondary shrink-0" />
                        <span>El flyer incluye la foto, el nombre, la ubicación y un contacto directo listo para difundir.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pie empático */}
                <div className="mt-8 sm:mt-10 p-4 sm:p-6 bg-gradient-to-r from-brand-primary/5 to-brand-secondary/5 rounded-2xl sm:rounded-3xl border border-brand-accent text-center">
                  <p className="text-sm sm:text-base text-gray-600 font-medium italic leading-relaxed">
                    "La comunidad de Sigo Tu Huella está contigo. No aflojes, juntos vamos a encontrar a tu mascota. 🐾💚"
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* News Carousel */}
      <NewsCarousel news={news} />

      {/* Features */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            <div className="space-y-3 sm:space-y-4 p-4 sm:p-6 bg-brand-bg/50 rounded-2xl sm:rounded-3xl">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-100 rounded-xl sm:rounded-2xl flex items-center justify-center text-red-600">
                <Search className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-lg sm:text-2xl font-serif font-bold text-gray-800">Reporte Inmediato</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Difundimos rápidamente las alertas de mascotas perdidas entre toda la red de vecinos para aumentar las posibilidades de encuentro.
              </p>
            </div>
            <div className="space-y-3 sm:space-y-4 p-4 sm:p-6 bg-brand-bg/50 rounded-2xl sm:rounded-3xl">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-pink-100 rounded-xl sm:rounded-2xl flex items-center justify-center text-pink-600">
                <Heart className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-lg sm:text-2xl font-serif font-bold text-gray-800">Adopción Responsable</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Fomentamos el vínculo entre familias y mascotas rescatadas, asegurando que cada animal tenga una segunda oportunidad real.
              </p>
            </div>
            <div className="space-y-3 sm:space-y-4 p-4 sm:p-6 bg-brand-bg/50 rounded-2xl sm:rounded-3xl">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-brand-primary">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-lg sm:text-2xl font-serif font-bold text-gray-800">Acción Vecinal</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Somos vecinos de Parque Sicardi, Villa Garibaldi e Ignacio Correas trabajando para mejorar la vida de los que no tienen voz.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}