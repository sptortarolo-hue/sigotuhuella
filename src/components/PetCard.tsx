import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pet, PetStatus, getPetImageUrl, getPetImageUrls, formatPetDate } from '@/src/lib/petService';
import { MapPin, Calendar, Phone, MessageCircle, Share2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/src/lib/utils';
import SocialShareModal from '@/src/components/SocialShareModal';
import { shareOnWhatsApp } from '@/src/lib/whatsappShare';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';
import { AnimatePresence } from 'motion/react';

interface PetCardProps {
  key?: React.Key;
  pet: Pet;
  showAdminActions?: boolean;
  onEdit?: (pet: Pet) => void;
  onDelete?: (id: string) => void | Promise<void>;
}

export default function PetCard({ pet, showAdminActions, onEdit, onDelete }: PetCardProps) {
    const navigate = useNavigate();
    const [showShareModal, setShowShareModal] = useState(false);
    const [currentIdx, setCurrentIdx] = useState(0);
    const touchStartX = useRef(0);
    const petNeighborhoods: string[] = (() => {
      if (Array.isArray(pet.neighborhoods)) return pet.neighborhoods;
      if (typeof pet.neighborhoods === 'string') try { return JSON.parse(pet.neighborhoods); } catch { return []; }
      return [];
    })();
    const statusColors = {

     [PetStatus.LOST]: 'bg-red-100 text-red-700',
     [PetStatus.RETAINED]: 'bg-blue-100 text-blue-700',
     [PetStatus.SIGHTED]: 'bg-amber-100 text-amber-700',
     [PetStatus.ACCIDENTED]: 'bg-purple-100 text-purple-700',
     [PetStatus.NEEDS_ATTENTION]: 'bg-amber-100 text-amber-700',
     [PetStatus.FOR_ADOPTION]: 'bg-pink-100 text-pink-800 border border-pink-200',
     [PetStatus.ADOPTED]: 'bg-green-100 text-green-700',
     [PetStatus.REUNITED]: 'bg-amber-100 text-amber-700',
   };

   const statusLabels = {
     [PetStatus.LOST]: 'Perdido',
     [PetStatus.RETAINED]: 'Retenido',
     [PetStatus.SIGHTED]: 'Avistado',
     [PetStatus.ACCIDENTED]: 'Accidentado',
     [PetStatus.NEEDS_ATTENTION]: 'Necesita Atención',
     [PetStatus.FOR_ADOPTION]: 'En Adopción',
     [PetStatus.ADOPTED]: 'Adoptado',
     [PetStatus.REUNITED]: 'Reencuentro',
   };

   const dateLabel = pet.status === PetStatus.LOST ? 'Perdido el' : 'Reportado el';
  const imageUrl = getPetImageUrl(pet);
  const imageUrls = getPetImageUrls(pet);

    return (
      <div 
        onClick={() => !showAdminActions && navigate(`/pet/${pet.id}`)}
        className={cn(
          "group bg-white rounded-3xl overflow-hidden border border-brand-accent hover:border-brand-secondary transition-all hover:shadow-xl hover:-translate-y-1",
          !showAdminActions && "cursor-pointer"
        )}
      >
       <div className="relative aspect-square overflow-hidden bg-gray-100">

        {imageUrls.length > 0 ? (
          <div className="w-full h-full relative"
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              const diff = touchStartX.current - e.changedTouches[0].clientX;
              if (Math.abs(diff) > 50) {
                if (diff > 0 && currentIdx < imageUrls.length - 1) setCurrentIdx(i => i + 1);
                if (diff < 0 && currentIdx > 0) setCurrentIdx(i => i - 1);
              }
            }}
          >
            <img 
              src={imageUrls[currentIdx]}
              alt={pet.name || 'Mascota'}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            {imageUrls.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); setCurrentIdx(i => Math.max(0, i - 1)); }} className={cn("absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-white transition-all", currentIdx === 0 && 'hidden')}>
                  <ChevronLeft className="w-4 h-4 text-gray-700" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setCurrentIdx(i => Math.min(imageUrls.length - 1, i + 1)); }} className={cn("absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-white transition-all", currentIdx === imageUrls.length - 1 && 'hidden')}>
                  <ChevronRight className="w-4 h-4 text-gray-700" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                  {imageUrls.map((_, i) => (
                    <button key={i} onClick={(e) => { e.stopPropagation(); setCurrentIdx(i); }} className={cn("w-1.5 h-1.5 rounded-full transition-all", i === currentIdx ? "bg-white w-3" : "bg-white/50")} />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="w-full h-full bg-brand-bg flex items-center justify-center">
            <img src="/sigotuhuella.jpg" alt="" className="w-2/3 h-2/3 object-contain opacity-15" />
          </div>
        )}
        
        <div className={cn(
          "absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-md",
          statusColors[pet.status]
        )}>
          {statusLabels[pet.status]}
        </div>
      </div>

      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            {pet.name && (
              <h3 className="text-xl font-serif font-bold text-gray-800 leading-tight">
                {pet.name}
              </h3>
            )}
            <p className={cn("text-gray-500 italic lowercase first-letter:uppercase", pet.name ? "text-sm" : "text-xs")}>
              {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otra especie'} • {pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : 'Sexo desconocido'}
            </p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4 text-brand-secondary" />
            <span className="break-words">{pet.location}</span>
          </div>
          {petNeighborhoods.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {petNeighborhoods.slice(0, 3).map(id => {
                const n = NEIGHBORHOODS.find(x => x.id === id);
                return n ? (
                  <span key={n.id} className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: n.color }}>
                    {n.name}
                  </span>
                ) : null;
              })}
              {petNeighborhoods.length > 3 && (
                <span className="text-[10px] text-gray-400 font-bold">+{petNeighborhoods.length - 3}</span>
              )}
            </div>
          )}
          {pet.status === PetStatus.FOR_ADOPTION && (pet.age || pet.size) && (
            <div className="flex flex-wrap gap-2">
              {pet.age && <span className="text-[10px] px-2 py-1 bg-brand-bg rounded-full font-bold text-gray-500">{pet.age}</span>}
              {pet.size && <span className="text-[10px] px-2 py-1 bg-brand-bg rounded-full font-bold text-gray-500">{pet.size === 'small' ? 'Pequeño' : pet.size === 'medium' ? 'Mediano' : 'Grande'}</span>}
            </div>
          )}
          {(pet.status === PetStatus.FOR_ADOPTION || pet.status === PetStatus.ADOPTED) && (pet.is_vaccinated || pet.is_sterilized || pet.is_dewormed) && (
            <div className="flex flex-wrap gap-2">
              {pet.is_dewormed && <span className="text-[10px] px-2 py-1 bg-teal-50 text-teal-600 rounded-full font-bold">🪱 Desparasitado</span>}
              {pet.is_vaccinated && <span className="text-[10px] px-2 py-1 bg-green-50 text-green-600 rounded-full font-bold">💉 Vacunado</span>}
              {pet.is_sterilized && <span className="text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded-full font-bold">✂️ Esterilizado</span>}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4 text-brand-secondary" />
            <span>{dateLabel} {format(formatPetDate(pet.created_at), 'PP', { locale: es })}</span>
          </div>
          {pet.contact_info && (
            <div className="flex items-center gap-2 text-sm text-gray-800 font-medium">
              <Phone className="w-4 h-4 text-brand-primary" />
              <span>{pet.contact_info}</span>
            </div>
          )}
        </div>

        {pet.description && (
          <p className={cn(
            "text-gray-600 leading-relaxed",
            pet.name ? "text-base line-clamp-4 mb-6" : "text-lg line-clamp-6 mb-4"
          )}>
            {pet.description}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-4 border-t border-brand-accent">
          <button
            onClick={(e) => { e.stopPropagation(); setShowShareModal(true); }}
            className="flex-1 min-w-[130px] px-4 py-2.5 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:shadow-lg transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            Imagen para Compartir
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); shareOnWhatsApp(pet); }}
            className="flex-1 min-w-[130px] px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-600 hover:shadow-lg transition-all"
          >
            <Share2 className="w-4 h-4" />
            Difundir por WhatsApp
          </button>
          {showAdminActions && (
            <>
              <button
                onClick={() => onEdit?.(pet)}
                className="flex-1 min-w-[130px] px-4 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl text-xs font-bold hover:bg-brand-primary hover:text-white transition-colors"
              >
                Editar
              </button>
              <button
                onClick={() => onDelete?.(pet.id)}
                className="flex-1 min-w-[130px] px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-600 hover:text-white transition-colors"
              >
                Borrar
              </button>
            </>
          )}
        </div>
        <AnimatePresence>
          {showShareModal && (
            <SocialShareModal pet={pet} onClose={() => setShowShareModal(false)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
