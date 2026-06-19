import { useState } from 'react';
import { cn } from '@/src/lib/utils';
import { PawPrint, Syringe, Heart, Droplet, ExternalLink } from 'lucide-react';
import ImageLightbox from './ImageLightbox';

interface AdminMyPetDetailProps {
  pet: any;
  onClose?: () => void;
  isMobile?: boolean;
}

export default function AdminMyPetDetail({ pet, onClose, isMobile }: AdminMyPetDetailProps) {
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const avatarSrc = pet.avatar_image
    ? `data:${pet.avatar_mime_type || 'image/jpeg'};base64,${pet.avatar_image}`
    : pet.photos?.[0]?.image_data
      ? `data:${pet.photos[0].mime_type || 'image/jpeg'};base64,${pet.photos[0].image_data}`
      : null;

  return (
    <div className={cn("space-y-5", isMobile ? "p-4" : "p-6")}>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-2xl bg-brand-bg overflow-hidden shrink-0">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => {
                const imgs: string[] = [];
                if (pet.avatar_image) imgs.push(`data:${pet.avatar_mime_type || 'image/jpeg'};base64,${pet.avatar_image}`);
                (pet.photos || []).forEach((p: any) => { if (p.image_data) imgs.push(`data:${p.mime_type || 'image/jpeg'};base64,${p.image_data}`); });
                if (imgs.length > 0) { setLightboxImages(imgs); setLightboxIndex(0); }
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300"><PawPrint className="w-8 h-8" /></div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-brand-primary">{pet.name}</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase bg-brand-primary/10 text-brand-primary">
              {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
            {pet.breed && <span>Raza: {pet.breed}</span>}
            {pet.color && <span>Color: {pet.color}</span>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
            {pet.gender && <span>Sexo: {pet.gender}</span>}
            {pet.birth_date && <span>Nac: {new Date(pet.birth_date).toLocaleDateString()}</span>}
            {pet.weight_kg && <span>Peso: {pet.weight_kg} kg</span>}
          </div>
        </div>
      </div>

      {pet.bio && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Biografía</h4>
          <p className="text-sm text-gray-600">{pet.bio}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-brand-bg/50 rounded-xl p-3">
          <Syringe className="w-4 h-4 text-brand-primary" />
          <span>{pet.is_vaccinated ? 'Vacunado' : 'No vacunado'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-brand-bg/50 rounded-xl p-3">
          <Heart className="w-4 h-4 text-brand-primary" />
          <span>{pet.is_sterilized ? 'Esterilizado' : 'No esterilizado'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-brand-bg/50 rounded-xl p-3">
          <Droplet className="w-4 h-4 text-brand-primary" />
          <span>{pet.is_dewormed ? 'Desparasitado' : 'No desparasitado'}</span>
        </div>
        {pet.chip_id && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-brand-bg/50 rounded-xl p-3">
            <span className="text-brand-primary font-bold">🐾</span>
            <span>Chip: {pet.chip_id}</span>
          </div>
        )}
      </div>

      {pet.personality_tags?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Personalidad</h4>
          <div className="flex flex-wrap gap-1">
            {pet.personality_tags.map((tag: string, i: number) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-brand-primary/5 text-brand-primary">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {pet.photos?.filter((p: any) => p.id !== 'avatar').length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Fotos adicionales</h4>
          <div className="grid grid-cols-3 gap-2">
            {pet.photos.filter((p: any) => p.id !== 'avatar').map((photo: any, idx: number) => (
              <div key={photo.id} className="aspect-square rounded-xl overflow-hidden bg-brand-bg cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  const imgs: string[] = [];
                  if (pet.avatar_image) imgs.push(`data:${pet.avatar_mime_type || 'image/jpeg'};base64,${pet.avatar_image}`);
                  (pet.photos || []).forEach((p: any) => { if (p.image_data) imgs.push(`data:${p.mime_type || 'image/jpeg'};base64,${p.image_data}`); });
                  setLightboxImages(imgs); setLightboxIndex(idx + (pet.avatar_image ? 1 : 0));
                }}>
                <img src={`data:${photo.mime_type || 'image/jpeg'};base64,${photo.image_data}`} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {pet.qr_data && (
        <div className="p-3 bg-brand-bg/50 rounded-xl">
          <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Identificación QR</h4>
          <div className="text-xs text-gray-600 space-y-1">
            <p>Código: <span className="font-bold text-brand-primary">{pet.qr_data.code}</span></p>
            <p className="text-[10px] text-gray-400 break-all">Token: {pet.qr_data.share_token}</p>
            <a
              href={`${window.location.origin}/mascota/${pet.qr_data.share_token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-brand-primary hover:underline mt-1"
            >
              <ExternalLink className="w-3 h-3" /> Ver perfil público
            </a>
          </div>
        </div>
      )}

      {onClose && (
        <button onClick={onClose} className="w-full py-2.5 border border-brand-accent rounded-xl text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors">
          Cerrar
        </button>
      )}

      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  );
}
