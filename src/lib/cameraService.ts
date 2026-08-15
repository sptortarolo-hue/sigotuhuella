import { isNative } from '@/src/lib/platform';

export interface PickedPhoto {
  file: File;
  dataUrl: string;
}

export async function pickPhoto(options?: { source?: 'camera' | 'gallery' | 'prompt' }): Promise<PickedPhoto | null> {
  if (!isNative()) return null;

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

  const source = options?.source === 'camera'
    ? CameraSource.Camera
    : options?.source === 'gallery'
      ? CameraSource.Photos
      : CameraSource.Prompt;

  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source,
    quality: 85,
  });

  if (!photo.webPath) return null;

  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const extension = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const file = new File([blob], `photo-${Date.now()}.${extension}`, { type: blob.type || 'image/jpeg' });
  const dataUrl = `data:${file.type};base64,${await blobToBase64(blob)}`;

  return { file, dataUrl };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
