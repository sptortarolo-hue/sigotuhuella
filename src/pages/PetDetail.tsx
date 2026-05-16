import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPets, Pet, PetStatus, getPetImageUrls, formatPetDate } from '@/src/lib/petService';
import { MapPin, Calendar, Phone, MessageCircle, ArrowLeft, Info } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/src/lib/utils';

export default function PetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);

  useEffect(() => {
    const fetchPet = async () => {
      try {
        const data = await getPets(); // This list all pets, we filter by id
        const found = data.find(p => p.id === id);
        setPet(found || null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        window.scrollTo(0, 0);
      }
    };
    fetchPet();
  }, [id]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-brand-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <span className="font-bold uppercase tracking-widest text-xs">Cargando mascota...</span>
        </div>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="h-screen flex items-center justify-center text-center px-4">
        <div className="max-w-md">
          <div className="w-20 h-20 bg-brand-bg rounded-full flex items-center justify-center mx-auto mb-6 text-gray-400">
            <Info className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-brand-primary mb-4">Mascota no encontrada</h1>
          <p className="text-gray-500 mb-8">Lo sentimos, la publicación que buscas ya no está disponible o el enlace es incorrecto.</p>
          <button onClick={() => navigate('/perdidos')} className="px-8 py-3 bg-brand-primary text-white rounded-2xl font-bold hover:shadow-lg transition-all">
            Volver a reportes
          </button>
        </div>
      </div>
    );
  }

  const images = getPetImageUrls(pet);

  const waMessage = `Hola! Estoy escribiendo por la publicación de ${pet.name || 'la mascota'} en Sigo Tu Huella. 
📍 Ubicación: ${pet.location}
${pet.description ? `\n📝 Descripción: ${pet.description}` : ''}
Me gustaría obtener más información.`;

  const contactWhatsApp = () => {
    const phone = pet.contact_info?.replace(/\D/g, '');
    const url = `https://wa.me/${phone || ''}?text=${encodeURIComponent(waMessage)}`;
    window.open(url, '_blank');
  };

  const statusColors = {
    [PetStatus.LOST]: 'bg-red-100 text-red-700',
    [PetStatus.RETAINED]: 'bg-blue-100 text-blue-700',
    [PetStatus.SIGHTED]: 'bg-amber-100 text-amber-700',
    [PetStatus.ACCIDENTED]: 'bg-purple-100 text-purple-700',
    [PetStatus.NEEDS_ATTENTION]: 'bg-amber-100 text-amber-700',
    [PetStatus.FOR_ADOPTION]: 'bg-brand-primary/20 text-brand-primary',
    [PetStatus.REUNITED]: 'bg-green-100 text-green-700',
  };

  const statusLabels = {
    [PetStatus.LOST]: 'Perdido',
    [PetStatus.RETAINED]: 'Retenido',
    [PetStatus.SIGHTED]: 'Avistado',
    [PetStatus.ACCIDENTED]: 'Accidentado',
    [PetStatus.NEEDS_ATTENTION]: 'Necesita Atención',
    [PetStatus.FOR_ADOPTION]: 'En Adopción',
    [PetStatus.REUNITED]: 'Reencuentro',
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary font-bold mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Galería de Imágenes */}
        <div className="space-y-4">
          <div className="relative aspect-square rounded-[2.5rem] overflow-hidden bg-gray-100 shadow-xl group">
            {images.length > 0 ? (
              <>
                <img 
                  src={images[currentImageIdx]} 
                  alt={pet.name} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                />
                {images.length > 1 && (
                  <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/50 text-white text-xs font-bold rounded-full backdrop-blur-sm">
                    {currentImageIdx + 1} / {images.length}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <Info className="w-12 h-12" />
                <span className="text-xs font-bold uppercase tracking-widest">Sin fotos disponibles</span>
              </div>
            )}
          </div>
          
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {images.map((url, idx) => (
                <button 
                  key={idx} 
                  onClick={() => setCurrentImageIdx(idx)}
                  className={cn(
                    "w-20 h-20 rounded-2xl overflow-hidden border-2 transition-all",
                    currentImageIdx === idx ? "border-brand-primary scale-95 shadow-inner" : "border-transparent opacity-70 hover:opacity-100"
                  )}
                >
                  <img src={url} className="w-full h-full object-cover" alt={`Vista previa ${idx + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Información Detallada */}
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <div className={cn("inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-4", statusColors[pet.status])}>
              {statusLabels[pet.status]}
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-2">
              {pet.name || (pet.status === PetStatus.LOST ? 'Se busca' : 'Mascota')}
            </h1>
            <p className="text-lg text-gray-500 italic flex items-center gap-2">
              {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otra especie'} 
              <span className="text-gray-300">•</span> 
              {pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : 'Sexo desconocido'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            <div className="bg-white p-4 rounded-2xl border border-brand-accent flex items-center gap-4">
              <div className="w-10 h-10 bg-brand-bg rounded-xl flex items-center justify-center text-brand-secondary">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Ubicación</p>
                <p className="text-sm font-bold text-gray-800">{pet.location}</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-brand-accent flex items-center gap-4">
              <div className="w-10 h-10 bg-brand-bg rounded-xl flex items-center justify-center text-brand-secondary">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Reportado el</p>
                <p className="text-sm font-bold text-gray-800">{format(formatPetDate(pet.created_at), 'PP', { locale: es })}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-brand-accent mb-8 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Info className="w-4 h-4" /> Descripción
            </h3>
            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">
              {pet.description || 'No se proporcionó una descripción detallada.'}
            </p>
          </div>

          <div className="mt-auto">
            <button 
              onClick={contactWhatsApp}
              disabled={!pet.contact_info}
              className={cn(
                "w-full py-5 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl",
                pet.contact_info 
                  ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-200" 
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
            >
              <MessageCircle className="w-6 h-6" />
              Contactar por WhatsApp
            </button>
            {!pet.contact_info && (
              <p className="text-center text-xs text-gray-400 mt-3">
                El contacto no está disponible para esta publicación.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
