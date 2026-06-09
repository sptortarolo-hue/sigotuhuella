import React, { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onChange: (index: number) => void;
}

export default function ImageLightbox({ images, currentIndex, onClose, onChange }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onChange(Math.max(0, currentIndex - 1));
      if (e.key === 'ArrowRight') onChange(Math.min(images.length - 1, currentIndex + 1));
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [currentIndex, images.length, onClose, onChange]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white z-10">
        <X className="w-6 h-6" />
      </button>

      <div className="flex items-center gap-2 sm:gap-4 max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {images.length > 1 && currentIndex > 0 && (
          <button onClick={() => onChange(currentIndex - 1)}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <div className="flex flex-col items-center gap-2">
          <img src={images[currentIndex]} alt={`Imagen ${currentIndex + 1}`}
            className="max-w-[80vw] max-h-[80vh] object-contain rounded-2xl" />
          {images.length > 1 && (
            <p className="text-white/60 text-xs">{currentIndex + 1} / {images.length}</p>
          )}
        </div>

        {images.length > 1 && currentIndex < images.length - 1 && (
          <button onClick={() => onChange(currentIndex + 1)}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}
