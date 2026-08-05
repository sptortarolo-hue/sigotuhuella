import { Link } from 'react-router-dom';
import { Heart, Search, QrCode, PawPrint, Ticket, HandCoins, Users, ArrowRight, BookOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { Helmet } from 'react-helmet-async';

const chapters = [
  {
    title: 'Adopción',
    description: 'Dá en adopción una mascota registrada o sin registrar, y adoptá explorando la galería o por invitación.',
    icon: Heart,
    path: '/manual/adopcion',
    accent: 'bg-rose-50 text-rose-500',
    available: true,
  },
  {
    title: 'Mascotas perdidas',
    description: 'Cómo reportar, difundir y buscar tu mascota con la red vecinal.',
    icon: Search,
    path: '',
    accent: 'bg-brand-primary/10 text-brand-primary',
    available: false,
  },
  {
    title: 'Chapita QR',
    description: 'Solicitá tu chapita, asociá el QR y enterate qué pasa cuando lo escanean.',
    icon: QrCode,
    path: '/manual/chapita',
    accent: 'bg-emerald-50 text-emerald-600',
    available: true,
  },
  {
    title: 'Mis mascotas',
    description: 'Registrá a tus compañeros, llevá su salud y compartí su perfil.',
    icon: PawPrint,
    path: '',
    accent: 'bg-sky-50 text-sky-600',
    available: false,
  },
  {
    title: 'Rifas y sorteos',
    description: 'Comprá números, reservá y seguí tu compra paso a paso.',
    icon: Ticket,
    path: '',
    accent: 'bg-amber-50 text-amber-600',
    available: false,
  },
  {
    title: 'Sumate y colaborá',
    description: 'Voluntariado, donaciones y cómo participar de la comunidad.',
    icon: HandCoins,
    path: '',
    accent: 'bg-purple-50 text-purple-500',
    available: false,
  },
];

export default function ManualHub() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-bg to-white">
      <Helmet>
        <title>Manual de uso - Sigo Tu Huella</title>
        <meta name="description" content="Guía de uso de la plataforma Sigo Tu Huella." />
      </Helmet>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 sm:mb-16"
        >
          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8">
            <BookOpen className="w-10 h-10 sm:w-12 sm:h-12 text-brand-primary" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-4 sm:mb-6 leading-tight">
            Manual de Sigo Tu Huella
          </h1>
          <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-xl mx-auto">
            Guías paso a paso con imágenes para aprovechar cada función de la app,
            tanto en la web como en el celular.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {chapters.map((ch, i) => (
            <motion.div
              key={ch.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
            >
              {ch.available ? (
                <Link
                  to={ch.path}
                  className="group bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-brand-accent shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col h-full"
                >
                  <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center mb-4', ch.accent)}>
                    <ch.icon className="w-7 h-7" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-brand-primary mb-2">{ch.title}</h2>
                  <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">{ch.description}</p>
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-brand-primary group-hover:translate-x-1 transition-transform">
                    Abrir guía <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              ) : (
                <div className="bg-white/60 p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-brand-accent flex flex-col h-full">
                  <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center mb-4', ch.accent)}>
                    <ch.icon className="w-7 h-7" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-brand-primary/60 mb-2">{ch.title}</h2>
                  <p className="text-sm text-gray-400 leading-relaxed mb-6 flex-1">{ch.description}</p>
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-gray-300">
                    Próximamente
                  </span>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <div className="mt-12 sm:mt-16 text-center">
          <Link to="/colaborar" className="inline-flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all">
            <Users className="w-4 h-4" /> ¿Tenés dudas? Escribinos
          </Link>
        </div>
      </div>
    </div>
  );
}
