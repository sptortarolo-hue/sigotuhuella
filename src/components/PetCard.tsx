import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pet, PetStatus, getPetImageUrl, getPetImageUrls, formatPetDate } from '@/src/lib/petService';
import { MapPin, Calendar, Info, Phone, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/src/lib/utils';
import SocialShareModal from '@/src/components/SocialShareModal';
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
    const statusColors = {

     [PetStatus.LOST]: 'bg-red-100 text-red-700',
     [PetStatus.RETAINED]: 'bg-blue-100 text-blue-700',
     [PetStatus.SIGHTED]: 'bg-amber-100 text-amber-700',
     [PetStatus.ACCIDENTED]: 'bg-purple-100 text-purple-700',
     [PetStatus.NEEDS_ATTENTION]: 'bg-amber-100 text-amber-700',
     [PetStatus.FOR_ADOPTION]: 'bg-brand-primary/20 text-brand-primary',
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
          <div className="w-full h-full relative">
            <img 
              src={imageUrl}
              alt={pet.name || 'Mascota'} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            {imageUrls.length > 1 && (
              <div className="absolute bottom-4 right-4 px-2 py-1 bg-black/50 text-white text-[10px] font-bold rounded-md backdrop-blur-sm">
                1 / {imageUrls.length}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
            <Info className="w-10 h-10" />
            <span className="text-xs font-medium uppercase tracking-widest">Sin Foto</span>
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
<h3 className="text-xl font-serif font-bold text-gray-800 leading-tight">
               {pet.name || (pet.status === PetStatus.LOST ? 'Se busca' : pet.status === PetStatus.RETAINED ? 'Retenido' : pet.status === PetStatus.SIGHTED ? 'Avistado' : pet.status === PetStatus.ACCIDENTED ? 'Accidentado' : pet.status === PetStatus.NEEDS_ATTENTION ? 'Necesita Atención' : 'En Adopción')}
            </h3>
            <p className="text-sm text-gray-500 italic lowercase first-letter:uppercase">
              {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otra especie'} • {pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : 'Sexo desconocido'}
            </p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4 text-brand-secondary" />
            <span className="break-words">{pet.location}</span>
          </div>
          {pet.status === PetStatus.FOR_ADOPTION && (pet.age || pet.size) && (
            <div className="flex flex-wrap gap-2">
              {pet.age && <span className="text-[10px] px-2 py-1 bg-brand-bg rounded-full font-bold text-gray-500">{pet.age}</span>}
              {pet.size && <span className="text-[10px] px-2 py-1 bg-brand-bg rounded-full font-bold text-gray-500">{pet.size === 'small' ? 'Pequeño' : pet.size === 'medium' ? 'Mediano' : 'Grande'}</span>}
            </div>
          )}
          {(pet.status === PetStatus.FOR_ADOPTION || pet.status === PetStatus.ADOPTED) && (pet.is_vaccinated || pet.is_sterilized) && (
            <div className="flex flex-wrap gap-2">
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

        <p className="text-sm text-gray-600 line-clamp-2 mb-6 leading-relaxed">
          {pet.description}
        </p>

        <div className="flex gap-2 pt-4 border-t border-brand-accent">
          <button
            onClick={(e) => { e.stopPropagation(); setShowShareModal(true); }}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:shadow-lg transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            Compartir
          </button>
          {showAdminActions && (
            <>
              <button
                onClick={() => onEdit?.(pet)}
                className="flex-1 px-4 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl text-xs font-bold hover:bg-brand-primary hover:text-white transition-colors"
              >
                Editar
              </button>
              <button
                onClick={() => onDelete?.(pet.id)}
                className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-600 hover:text-white transition-colors"
              >
                Borrar
              </button>
            </>
          )}
        </div>
      </div>
      </div>
      <AnimatePresence>
        {showShareModal && (
          <SocialShareModal pet={pet} onClose={() => setShowShareModal(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
