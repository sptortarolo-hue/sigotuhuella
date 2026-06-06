import { Link, useNavigate } from 'react-router-dom';
import { Heart, Search, ShieldCheck, Share2, PawPrint, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import NewsCarousel from '@/src/components/NewsCarousel';
import { getNews } from '@/src/lib/newsService';
import { api } from '@/src/lib/api';
import { formatTag } from '@/src/lib/personalityTags';
import { useAuth } from '@/src/hooks/useAuth';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [news, setNews] = useState<any[]>([]);
  const [featuredPet, setFeaturedPet] = useState<any>(null);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [bannerPrice, setBannerPrice] = useState('500');
  const [bannerIsFree, setBannerIsFree] = useState(true);
  const [showChapitaModal, setShowChapitaModal] = useState(false);

  useEffect(() => {
    getNews().then(setNews).catch(() => {});
    api.myPets.featured().then((data: any) => { if (data.pet) setFeaturedPet(data.pet); }).catch(() => {});
    api.settings.getPublic().then((data: any) => {
      if (data.banner_chapita_visible !== undefined) setBannerVisible(data.banner_chapita_visible !== 'false');
      if (data.banner_chapita_price !== undefined) setBannerPrice(data.banner_chapita_price);
      if (data.banner_chapita_is_free !== undefined) setBannerIsFree(data.banner_chapita_is_free === 'true');
    }).catch(() => {});
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Link to="/perdi-mi-mascota"
                className="group bg-brand-primary/10 border border-brand-primary/30 rounded-2xl p-6 text-center hover:shadow-lg hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 bg-brand-primary rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <PawPrint className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-brand-primary text-sm mb-1">Perdí mi mascota</h3>
                <span className="text-brand-primary text-xs">→</span>
              </Link>

              <Link to="/reportar-rapido"
                className="group bg-brand-secondary/10 border border-brand-secondary/30 rounded-2xl p-6 text-center hover:shadow-lg hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 bg-brand-secondary rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Search className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-brand-primary text-sm mb-1">Encontré una mascota</h3>
                <span className="text-brand-primary text-xs">→</span>
              </Link>

              <Link to="/adopcion"
                className="group bg-red-50 border-2 border-red-200 rounded-2xl p-6 text-center hover:shadow-lg hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Heart className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="font-bold text-brand-primary text-sm mb-1">Quiero adoptar</h3>
                <span className="text-red-400 text-xs">→</span>
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

      {/* Chappita identificadora banner */}
      {bannerVisible && (
        <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
          <div className="bg-gradient-to-r from-brand-primary/[0.03] to-brand-secondary/[0.03] rounded-[2.5rem] border border-brand-accent p-5 sm:p-8 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <img src="/chapita.png" alt="Chappita" className="w-20 h-20 sm:w-24 sm:h-24 object-contain shrink-0" />
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h3 className="text-xl sm:text-2xl font-bold text-brand-primary">
                Chappita identificadora {bannerIsFree && <span className="text-brand-secondary">gratis</span>}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Protegé a tu mascota con una chappita QR{bannerIsFree ? ' gratuita' : ''}. Cualquier persona que la encuentre podrá escanear el código y acceder a tus datos de contacto.
              </p>
              {bannerIsFree && parseInt(bannerPrice) > 0 && (
                <p className="text-xs text-gray-400 mt-1"><s>${bannerPrice}</s> <span className="text-brand-secondary font-bold">Gratis</span></p>
              )}
              {bannerIsFree && parseInt(bannerPrice) === 0 && (
                <p className="text-xs text-brand-secondary font-bold mt-1">Gratis</p>
              )}
              {!bannerIsFree && (
                <p className="text-xs text-gray-500 mt-1">${bannerPrice} — El dinero recaudado se destina a asistir a las mascotas del barrio.</p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
              <button onClick={() => setShowChapitaModal(true)}
                className="w-full sm:w-auto px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all">
                Solicitar
              </button>
              <button onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: `Chappita identificadora${bannerIsFree ? ' gratis' : ''} - Sigo Tu Huella`,
                    text: `Protegé a tu mascota con una chappita QR${bannerIsFree ? ' gratuita' : ''} de Sigo Tu Huella. ${bannerIsFree ? '¡Solicitala ahora!' : `$${bannerPrice} — El dinero recaudado se destina a asistir a las mascotas del barrio. Solicitala ahora!`}`,
                    url: window.location.href,
                  }).catch(() => {});
                }
              }}
                className="w-full sm:w-auto px-6 py-3 bg-white border border-brand-accent text-brand-primary rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4" /> Compartir
              </button>
            </div>
          </div>
        </section>
      )}

      {/* News Carousel */}
      <NewsCarousel news={news} />

      {/* Mascota del mes */}
      {featuredPet && (
        <section className="py-12 sm:py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 mb-6">
              <span className="px-3 py-1 bg-brand-secondary/10 text-brand-secondary rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-widest">
                Mascota del mes
              </span>
            </div>
            <div className="bg-brand-bg rounded-[2.5rem] p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-brand-accent shrink-0">
                <img
                  src={`/my-pet-avatar/${featuredPet.id}`}
                  alt={featuredPet.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-center sm:text-left">
                <h3 className="text-xl sm:text-2xl font-bold text-brand-primary">{featuredPet.name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {featuredPet.species === 'dog' ? 'Perro' : featuredPet.species === 'cat' ? 'Gato' : 'Otro'}
                  {featuredPet.breed ? ` · ${featuredPet.breed}` : ''}
                </p>
                {featuredPet.bio && <p className="text-sm text-gray-600 mt-2 italic">"{featuredPet.bio}"</p>}
                {featuredPet.personality_tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3 justify-center sm:justify-start">
                    {featuredPet.personality_tags.slice(0, 5).map((tag: string) => (
                      <span key={tag} className="text-[10px] sm:text-xs px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-full">
                        {formatTag(tag)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Diffusion callout */}
      <section className="py-12 bg-brand-bg/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link to="/difusion" className="group block bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 hover:shadow-lg transition-all">
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="w-14 h-14 bg-brand-primary/10 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Share2 className="w-7 h-7 text-brand-primary" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-lg font-bold text-brand-primary">Ayudanos a difundir</h3>
                <p className="text-sm text-gray-500 mt-1">Descargá el código QR o imprimí un cartel para tu barrio y sumá más vecinos a la red.</p>
              </div>
              <span className="shrink-0 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm group-hover:shadow-lg transition-all whitespace-nowrap">
                Ver materiales →
              </span>
            </div>
          </Link>
        </div>
      </section>

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

      {/* Chapita info modal */}
      <AnimatePresence>
        {showChapitaModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChapitaModal(false)}
              className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 sm:p-8 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
                <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-2">
                  <img src="/chapita.png" alt="" className="w-8 h-8" />
                  Chappita identificadora
                </h2>
                <button onClick={() => setShowChapitaModal(false)} className="p-2 hover:bg-brand-accent rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 sm:p-8 overflow-y-auto space-y-4">
                <p className="text-sm text-gray-600 leading-relaxed">
                  La identificación de tu mascota es fundamental para protegerla. Con una chappita QR, cualquier persona que la encuentre podrá escanear el código y acceder a tus datos de contacto al instante.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="text-brand-secondary mt-0.5">•</span>
                    <span><strong>Localización rápida:</strong> Si se pierde, quien la encuentre sabe cómo contactarte.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-secondary mt-0.5">•</span>
                    <span><strong>Seguridad:</strong> No necesita collar ni chapita metálica, el QR va en una chappita liviana y resistente.</span>
                  </li>
                  {bannerIsFree ? (
                    <li className="flex items-start gap-2">
                      <span className="text-brand-secondary mt-0.5">•</span>
                      <span><strong>Gratuita:</strong> Las chappitas son sin cargo para los vecinos de la zona.</span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2">
                      <span className="text-brand-secondary mt-0.5">•</span>
                      <span><strong>Solidaria:</strong> El costo de la chappita se destina a asistir a las mascotas del barrio.</span>
                    </li>
                  )}
                </ul>
                <button
                  onClick={() => {
                    setShowChapitaModal(false);
                    navigate(user ? '/mis-mascotas' : '/solicitar-chapita');
                  }}
                  className="w-full py-3.5 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all mt-2"
                >
                  Pedir chappita identificatoria
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}