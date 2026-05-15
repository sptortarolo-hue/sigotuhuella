import { api } from './api';

export enum PetStatus {
  LOST = 'lost',
  RETAINED = 'retained',
  SIGHTED = 'sighted',
  ACCIDENTED = 'accidented',
  FOR_ADOPTION = 'for_adoption',
  ADOPTED = 'adopted',
  REUNITED = 'reunited',
}

export interface PetImage {
  id: string;
  image_data: string;
  mime_type: string;
}

export interface Pet {
  id: string;
  name: string | null;
  species: string;
  breed: string | null;
  color: string | null;
  status: PetStatus;
  gender: string;
  age: string | null;
  size: string | null;
  is_vaccinated: boolean;
  is_sterilized: boolean;
  description: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  contact_info: string | null;
  images: PetImage[];
  created_by: string;
  is_admin_verified: boolean;
  created_at: string;
  updated_at: string;
}

export function getPetImageUrl(pet: Pet): string | undefined {
  return pet.images?.[0] ? `data:${pet.images[0].mime_type};base64,${pet.images[0].image_data}` : undefined;
}

export function getPetImageUrls(pet: Pet): string[] {
  return pet.images?.map(img => `data:${img.mime_type};base64,${img.image_data}`) || [];
}

export function getPetCoordinates(pet: Pet): { lat: number; lng: number } | null {
  return pet.latitude && pet.longitude ? { lat: pet.latitude, lng: pet.longitude } : null;
}

export function formatPetDate(dateStr: string): Date {
  return new Date(dateStr);
}

export const getPets = async (status?: PetStatus): Promise<Pet[]> => {
  const data = await api.pets.list(status);
  return data.pets || [];
};

export const createPet = async (petData: any): Promise<any> => {
  const data = await api.pets.create(petData);
  return data.pet;
};

export const updatePet = async (id: string, petData: Partial<Pet>): Promise<void> => {
  await api.pets.update(id, petData);
};

export const deletePet = async (id: string): Promise<void> => {
  await api.pets.delete(id);
};
