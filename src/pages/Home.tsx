import { Link } from 'react-router-dom';
import { ArrowRight, Heart, Search, ShieldCheck, X, SearchCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';

export default function Home() {
  const [showLostModal, setShowLostModal] = useState(false);

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center overflow-hidden bg-brand-bg px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center relative z-10 py-20">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-secondary/10 text-brand-secondary rounded-full text-xs font-bold uppercase tracking-widest mb-6">
              <ShieldCheck className="w-4 h-4" />
              Barrios Villa Garibaldi • Sicardi • Correas
            </div>
            <h1 className="text-6xl md:text-8xl font-serif font-bold text-brand-primary leading-[0.9] mb-8">
              Sigo tu <br />
              <span className="text-brand-secondary">huella.</span>
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed mb-10 max-w-lg">
              Movimiento de vecinos autoconvocados dedicado a la atención y abordaje de mascotas en situación de vulnerabilidad. Juntos construimos una comunidad más empática.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => setShowLostModal(true)}
                className="px-8 py-4 bg-brand-primary text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-brand-primary/90 transition-all shadow-lg hover:shadow-brand-primary/20"
              >
                ¿Perdiste a tu mascota?
                <ArrowRight className="w-5 h-5" />
              </button>
              <Link
                to="/adopcion"
                className="px-8 py-4 bg-white text-brand-primary border border-brand-accent rounded-2xl font-bold hover:border-brand-primary transition-all"
              >
                Quiero adoptar
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative"
          >
             <div className="aspect-[4/5] bg-brand-accent rounded-[3rem] overflow-hidden rotate-3 shadow-2xl relative">
                <img 
                 src="/sigotuhuella.jpg" 
                 alt="Sigo tu huella" 
                 className="w-full h-full object-cover hover:scale-105 transition-all duration-700"
               />
            </div>
            {/* Floating Stats */}
            <div className="absolute -bottom-6 -left-6 bg-white p-6 rounded-3xl shadow-xl border border-brand-accent -rotate-2">
              <span className="block text-3xl font-serif font-bold text-brand-secondary">+150</span>
              <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Mascotas Ayudadas</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Lost Pet Modal */}
      <AnimatePresence>
        {showLostModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLostModal(false)}
              className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 md:p-12">
                <button 
                  onClick={() => setShowLostModal(false)}
                  className="absolute top-6 right-6 p-2 hover:bg-brand-bg rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>

                <div className="mb-8">
                  <div className="w-16 h-16 bg-brand-secondary/10 text-brand-secondary rounded-2xl flex items-center justify-center mb-6">
                    <SearchCheck className="w-8 h-8" />
                  </div>
                  <h2 className="text-4xl font-serif font-bold text-brand-primary mb-4 tracking-tight">¡Estamos acá para ayudarte a que vuelva a casa!</h2>
                  <p className="text-lg text-gray-600 leading-relaxed">
                    Entendemos lo estresante que es perder a tu mascota, pero mantener la calma y actuar rápido hace la diferencia.
                  </p>
                </div>

                <div className="space-y-8">
                  <div className="relative pl-12">
                    <div className="absolute left-0 top-0 w-8 h-8 bg-brand-primary/10 text-brand-primary rounded-full flex items-center justify-center font-bold">1</div>
                    <h3 className="text-xl font-bold text-brand-primary mb-2">Primero</h3>
                    <p className="text-gray-600 mb-4">Entrá a la sección Perros Encontrados para confirmar si alguien ya lo resguardó.</p>
                    <Link 
                      to="/perdidos" 
                      className="inline-flex items-center gap-2 px-6 py-3 bg-brand-bg text-brand-primary border border-brand-accent rounded-xl font-bold hover:border-brand-primary transition-all text-sm"
                    >
                      <Search className="w-4 h-4" />
                      Ver Perros Encontrados
                    </Link>
                  </div>

                  <div className="relative pl-12">
                    <div className="absolute left-0 top-0 w-8 h-8 bg-brand-primary/10 text-brand-primary rounded-full flex items-center justify-center font-bold">2</div>
                    <h3 className="text-xl font-bold text-brand-primary mb-2">Segundo</h3>
                    <p className="text-gray-600 mb-4">Si aún no está en la lista, ve a Publicar. Subir su información y foto nos ayudará a difundir su extravío rápidamente para multiplicar las chances de encontrarlo.</p>
                    <Link 
                      to="/reportar" 
                      className="inline-flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all text-sm"
                    >
                      <ArrowRight className="w-4 h-4 text-white" />
                      Publicar Mascota Perdida
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-12">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-gray-800">Reporte Inmediato</h3>
              <p className="text-gray-600 leading-relaxed">
                Difundimos rápidamente las alertas de mascotas perdidas entre toda la red de vecinos para aumentar las posibilidades de encuentro.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-pink-100 rounded-2xl flex items-center justify-center text-pink-600">
                <Heart className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-gray-800">Adopción Responsable</h3>
              <p className="text-gray-600 leading-relaxed">
                Fomentamos el vínculo entre familias y mascotas rescatadas, asegurando que cada animal tenga una segunda oportunidad real.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center text-brand-primary">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-gray-800">Acción Vecinal</h3>
              <p className="text-gray-600 leading-relaxed">
                Somos vecinos de Parque Sicardi, Villa Garibaldi e Ignacio Correas trabajando para mejorar la vida de los que no tienen voz.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
