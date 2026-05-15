import React from 'react';
import { Pet, PetStatus, getPetImageUrls } from '@/src/lib/petService';
import { ImageIcon, PawPrint } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface PetFlyerProps {
  pet: Pet;
  className?: string;
}

const statusConfig: Record<string, { label: string; bg: string }> = {
  [PetStatus.LOST]: { label: 'PERDIDO', bg: 'bg-red-600' },
  [PetStatus.RETAINED]: { label: 'RETENIDO', bg: 'bg-blue-600' },
  [PetStatus.SIGHTED]: { label: 'AVISTADO', bg: 'bg-amber-600' },
  [PetStatus.ACCIDENTED]: { label: 'ACCIDENTADO', bg: 'bg-purple-600' },
  [PetStatus.FOR_ADOPTION]: { label: 'EN ADOPCIÓN', bg: 'bg-brand-secondary' },
  [PetStatus.ADOPTED]: { label: 'ADOPTADO', bg: 'bg-emerald-600' },
  [PetStatus.REUNITED]: { label: 'REENCUENTRO', bg: 'bg-emerald-600' },
};

const defaultConfig = { label: 'REPORTE', bg: 'bg-gray-600' };

export default function PetFlyer({ pet, className }: PetFlyerProps) {
  const images = getPetImageUrls(pet);
  const mainImage = images[0] || null;
  const config = statusConfig[pet.status] || defaultConfig;

  return (
    <div className={cn("w-full max-w-sm mx-auto rounded-3xl overflow-hidden border-4 border-brand-accent shadow-xl bg-white", className)}>
      {/* Header with logo and brand */}
      <div className="bg-brand-primary/10 p-3 flex items-center justify-center gap-2 border-b border-brand-accent/50">
        <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center text-white shadow-sm">
          <PawPrint className="w-4 h-4" />
        </div>
        <span className="text-xs font-black tracking-[0.2em] text-brand-primary uppercase">Sigo tu huella</span>
      </div>

      {/* Status banner */}
      <div className={cn("p-3 text-white font-serif font-black text-2xl text-center uppercase tracking-tighter", config.bg)}>
        {config.label}
      </div>

      {/* Pet image */}
      <div className="relative aspect-square bg-gray-100">
        {mainImage ? (
          <img src={mainImage} alt={pet.name || ''} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <ImageIcon className="w-16 h-16" />
          </div>
        )}
        {/* Name tag overlay */}
        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm rounded-xl p-2.5 shadow-lg text-left border border-brand-accent/50">
          <p className="text-[9px] font-bold text-gray-400 uppercase leading-none mb-0.5 tracking-wider">Nombre</p>
          <p className="font-serif font-bold text-brand-primary text-lg tracking-tight leading-none">
            {pet.name || 'Sin nombre'}
          </p>
        </div>
      </div>

      {/* Info cards */}
      <div className="p-4 bg-white space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-brand-bg p-2.5 rounded-xl border border-brand-accent/50">
            <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5 tracking-wider">Ubicación</p>
            <p className="text-xs font-bold text-brand-primary leading-tight">{pet.location}</p>
          </div>
          {pet.contact_info ? (
            <div className="bg-brand-bg p-2.5 rounded-xl border border-brand-accent/50">
              <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5 tracking-wider">Contacto</p>
              <p className="text-xs font-bold text-brand-primary leading-tight">{pet.contact_info}</p>
            </div>
          ) : (
            <div className="bg-brand-bg p-2.5 rounded-xl border border-brand-accent/50">
              <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5 tracking-wider">Especie</p>
              <p className="text-xs font-bold text-brand-primary leading-tight capitalize">{pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otra'}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
          <span><strong className="text-gray-700">Especie:</strong> {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otra'}</span>
          <span><strong className="text-gray-700">Sexo:</strong> {pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : 'No especificado'}</span>
          {pet.breed && <span><strong className="text-gray-700">Raza:</strong> {pet.breed}</span>}
          {pet.color && <span><strong className="text-gray-700">Color:</strong> {pet.color}</span>}
          {pet.age && <span><strong className="text-gray-700">Edad:</strong> {pet.age}</span>}
          {pet.size && <span><strong className="text-gray-700">Tamaño:</strong> {pet.size === 'small' ? 'Pequeño' : pet.size === 'medium' ? 'Mediano' : 'Grande'}</span>}
        </div>

        {pet.description && (
          <p className="text-[11px] text-gray-600 leading-relaxed italic border-l-4 border-brand-secondary pl-3 line-clamp-2">
            "{pet.description}"
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="bg-brand-bg p-2.5 border-t border-brand-accent/50 flex items-center justify-center gap-2">
        <PawPrint className="w-3 h-3 text-brand-primary" />
        <span className="text-[8px] font-black tracking-[0.2em] text-brand-primary uppercase">Sigo Tu Huella — Red Vecinal</span>
      </div>
    </div>
  );
}
