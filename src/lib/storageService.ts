import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from './firebase';

export const uploadPetImage = async (file: File): Promise<string> => {
  if (!auth.currentUser) throw new Error('Must be signed in to upload images');
  
  const timestamp = Date.now();
  const fileExtension = file.name.split('.').pop();
  const storagePath = `pets/${auth.currentUser.uid}/${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
  const storageRef = ref(storage, storagePath);
  
  const snapshot = await uploadBytes(storageRef, file);
  return await getDownloadURL(snapshot.ref);
};

export const uploadMultiplePetImages = async (files: File[]): Promise<string[]> => {
  const uploadPromises = files.map(file => uploadPetImage(file));
  return await Promise.all(uploadPromises);
};
