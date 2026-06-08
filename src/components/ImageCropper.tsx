import React, { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageCropperProps {
  file: File;
  aspect?: number;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

export default function ImageCropper({ file, aspect = 1, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const imageUrl = URL.createObjectURL(file);

  const onCropChange = useCallback((location: { x: number; y: number }) => {
    setCrop(location);
  }, []);

  const onZoomChange = useCallback((z: number) => {
    setZoom(Math.min(Math.max(z, 1), 3));
  }, []);

  const onCropAreaComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return;
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });

      const cropW = croppedAreaPixels.width;
      const cropH = croppedAreaPixels.height;
      const cropX = croppedAreaPixels.x;
      const cropY = croppedAreaPixels.y;

      const outputSize = 800;
      canvas.width = outputSize;
      canvas.height = outputSize;

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, outputSize, outputSize);
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outputSize, outputSize);

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas toBlob returned null'));
        }, 'image/jpeg', 0.85)
      );

      onCropComplete(blob);
    } catch (e) {
      console.error('Crop error:', e);
    }
  }, [croppedAreaPixels, imageUrl, onCropComplete]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] flex flex-col max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-serif font-bold text-lg text-brand-primary">Ajustar foto</h3>
          <button onClick={onCancel} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative h-[50vh] min-h-[300px] bg-black/10">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropAreaComplete}
          />
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/80 text-xs font-medium drop-shadow-md pointer-events-none z-10">
            Arrastrá la imagen para encuadrarla
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={() => onZoomChange(zoom - 0.2)}
            className="p-2 text-gray-500 hover:text-brand-primary transition-colors">
            <ZoomOut className="w-5 h-5" />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            className="w-40 accent-brand-primary"
          />
          <button onClick={() => onZoomChange(zoom + 0.2)}
            className="p-2 text-gray-500 hover:text-brand-primary transition-colors">
            <ZoomIn className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button onClick={onCancel}
            className="px-5 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">
            Cancelar
          </button>
          <button onClick={handleConfirm}
            className="px-6 py-2 bg-brand-primary text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
