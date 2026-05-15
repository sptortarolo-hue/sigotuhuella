import { Link } from 'react-router-dom';
import { ArrowRight, Heart, Search, Map, MessageCircle, Image, Compass, ShieldCheck, PawPrint } from 'lucide-react';
import { motion } from 'motion/react';

export default function LostPetGuide() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-bg to-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
        {/* Encabezado empático */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 sm:mb-16"
        >
          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8">
            <Heart className="w-10 h-10 sm:w-12 sm:h-12 text-red-500 fill-red-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-4 sm:mb-6 leading-tight">
            No pierdas la calma, <br className="hidden sm:block" />
            <span className="text-brand-secondary">estamos acá para ayudarte</span>
          </h1>
          <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-xl mx-auto">
            Entendemos lo angustiante que es perder a un miembro de la familia. 
            Respirá hondo, no estás solx. Toda la comunidad de Sicardi, Garibaldi y Correas 
            está lista para ayudar a que vuelva a casa.
          </p>
        </motion.div>

        {/* Timeline de pasos */}
        <div className="space-y-8 sm:space-y-10">
          {/* Paso 1 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="relative pl-14 sm:pl-20"
          >
            <div className="absolute left-0 top-0 w-10 h-10 sm:w-14 sm:h-14 bg-brand-primary text-white rounded-2xl flex items-center justify-center font-bold text-lg sm:text-xl shadow-lg shadow-brand-primary/20">
              1
            </div>
            <div className="bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-brand-accent shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <Search className="w-6 h-6 text-brand-secondary" />
                <h2 className="text-xl sm:text-2xl font-bold text-brand-primary">Buscá en Mascotas Reportadas</h2>
              </div>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed mb-5">
                Antes de publicar, revisá si alguien ya encontró o vio a tu mascota. 
                Ingresá a la sección de reportes y usá el buscador por <strong>cualquier palabra clave</strong>: 
                nombre, ubicación, especie, raza, color o descripción. También podés cambiar a 
                <strong> vista de mapa</strong> para buscar mascotas reportadas en una zona en particular.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/perdidos"
                  className="flex-1 px-6 py-3.5 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  <Search className="w-4 h-4" />
                  Ir a Mascotas Reportadas
                </Link>
                <Link
                  to="/perdidos"
                  className="flex-1 px-6 py-3.5 bg-white border border-brand-accent text-brand-primary rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:border-brand-primary hover:shadow transition-all"
                >
                  <Map className="w-4 h-4" />
                  Buscar por Mapa
                </Link>
              </div>
            </div>
          </motion.div>

          {/* Paso 2 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="relative pl-14 sm:pl-20"
          >
            <div className="absolute left-0 top-0 w-10 h-10 sm:w-14 sm:h-14 bg-brand-secondary text-white rounded-2xl flex items-center justify-center font-bold text-lg sm:text-xl shadow-lg shadow-brand-secondary/20">
              2
            </div>
            <div className="bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-brand-accent shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <Compass className="w-6 h-6 text-brand-secondary" />
                <h2 className="text-xl sm:text-2xl font-bold text-brand-primary">Publicá un reporte</h2>
              </div>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed mb-5">
                Si no encontraste a tu mascota en los reportes, creá una publicación para que 
                <strong> toda la red vecinal esté atenta</strong>. Incluí fotos claras, la última ubicación 
                donde fue vista y un número de contacto. Entre más detalles, más fácil será identificarla.
              </p>
              <Link
                to="/reportar"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-brand-secondary text-white rounded-xl font-bold text-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <ArrowRight className="w-4 h-4" />
                Publicar Mascota Perdida
              </Link>
            </div>
          </motion.div>

          {/* Paso 3 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45 }}
            className="relative pl-14 sm:pl-20"
          >
            <div className="absolute left-0 top-0 w-10 h-10 sm:w-14 sm:h-14 bg-emerald-500 text-white rounded-2xl flex items-center justify-center font-bold text-lg sm:text-xl shadow-lg shadow-emerald-500/20">
              3
            </div>
            <div className="bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-brand-accent shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <MessageCircle className="w-6 h-6 text-emerald-500" />
                <h2 className="text-xl sm:text-2xl font-bold text-brand-primary">Compartí con tu comunidad</h2>
              </div>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed mb-5">
                Después de publicar, podés generar un <strong>flyer digital optimizado</strong> con los datos 
                de tu mascota. Compartilo en grupos de WhatsApp, redes sociales y con tus vecinos. 
                <strong> Cuantas más personas lo vean, más chances hay de reencontrarte con tu mascota.</strong>
              </p>
              <div className="flex items-center gap-3 text-sm text-gray-500 bg-brand-bg p-4 sm:p-5 rounded-xl border border-brand-accent">
                <Image className="w-6 h-6 text-brand-secondary shrink-0" />
                <span>El flyer incluye la foto, el nombre, la ubicación y tu contacto. Listo para descargar y compartir al instante.</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Cierre empático */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-12 sm:mt-16 p-6 sm:p-8 bg-gradient-to-r from-brand-primary/5 via-brand-secondary/5 to-brand-primary/5 rounded-[2.5rem] border border-brand-accent text-center"
        >
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <PawPrint className="w-7 h-7 sm:w-8 sm:h-8 text-brand-primary" />
          </div>
          <p className="text-base sm:text-lg text-gray-600 font-medium italic leading-relaxed max-w-lg mx-auto">
            "La comunidad de Sigo Tu Huella está con vos. No aflojes, 
            <strong> juntos vamos a encontrar a tu mascota</strong>. 🐾💚"
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
            <ShieldCheck className="w-3 h-3" />
            Villa Garibaldi • Parque Sicardi • Ignacio Correas
          </div>
        </motion.div>

        {/* Volver al inicio */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-brand-primary font-bold transition-colors"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
