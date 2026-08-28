import { api, apiUrl } from './api';

export enum PetStatus {
  LOST = 'lost',
  RETAINED = 'retained',
  SIGHTED = 'sighted',
  ACCIDENTED = 'accidented',
  NEEDS_ATTENTION = 'needs_attention',
  FOR_ADOPTION = 'for_adoption',
  FOR_ADOPTION_SIMPLE = 'for_adoption_simple',
  ADOPTED = 'adopted',
  REUNITED = 'reunited',
  ADOPTION_TRIAL = 'adoption_trial',
  TRANSITADA = 'transitada',
}

export interface PetImage {
  id: string;
  image_data?: string;
  mime_type: string;
  external_url?: string;
  has_original?: boolean;
  has_image?: boolean;
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
  is_dewormed: boolean;
  description: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  contact_info: string | null;
  contact_info_2: string | null;
  neighborhoods: string[];
  images: PetImage[];
  source_type?: string;
  facebook_embed_html?: string;
  created_by: string;
  is_admin_verified: boolean;
  created_at: string;
  updated_at: string;
  is_hidden?: boolean;
  contact_visible?: boolean;
  my_pet_id?: string | null;
  has_pending_adoption?: boolean;
  owner_name?: string | null;
  owner_phone?: string | null;
  owner_email?: string | null;
  owner_address?: string | null;
  reunited_at?: string | null;
  group_id?: string | null;
  transit_caregiver_id?: string | null;
  transit_assigned_at?: string | null;
  view_count?: number;
  ig_impact?: { permalink: string; post_url?: string | null; likes: number; comments: number; shares: number } | null;
  fb_impact?: { post_id: string; post_url?: string | null; likes: number; comments: number; shares: number } | null;
  case_number?: string | null;
  case_vigencia?: { status: string | null; expired: boolean; days_left: number | null } | null;
}

export function getPetImageUrl(pet: Pet): string | undefined {
  if (!pet.images?.[0]) return undefined;
  const img = pet.images[0];
  // Priorizar endpoint optimizado (thumb 200x200) para thumbnails
  if (img.has_image) return apiUrl(`/api/images/pet-thumb/${pet.id}/0`);
  // Fallback: external_url
  if (img.external_url) return img.external_url;
  // Último: base64 (solo si es pequeño)
  if (img.image_data && img.image_data.length < 50000)
    return `data:${img.mime_type};base64,${img.image_data}`;
  return undefined;
}

export function getPetImageUrls(pet: Pet): string[] {
  return pet.images?.map((img, idx) => {
    if (img.image_data) return `data:${img.mime_type};base64,${img.image_data}`;
    if (img.external_url) return img.external_url;
    if (img.has_image) return apiUrl(`/api/images/pet-thumb/${pet.id}/${idx}`);
    return '';
  }).filter(Boolean) || [];
}

/**
 * URLs aptas para dibujar en <canvas> (toBlob/toDataURL).
 * Prioriza orígenes same-origin / data: porque los CDN externos (Facebook)
 * no mandan CORS headers y envenenan el canvas.
 */
export function getPetCanvasImageUrls(pet: Pet): string[] {
  return pet.images?.map((img, idx) => {
    if (img.has_image) return apiUrl(`/api/images/pet-thumb/${pet.id}/${idx}`);
    if (img.image_data) return `data:${img.mime_type};base64,${img.image_data}`;
    // Último recurso: external_url (puede fallar por CORS al exportar el canvas)
    if (img.external_url) return img.external_url;
    return '';
  }).filter(Boolean) || [];
}

export function getPetOriginalImageUrl(pet: Pet): string | undefined {
  if (!pet.images?.[0]) return undefined;
  const img = pet.images[0];
  return img.has_original ? apiUrl(`/og-image/${pet.id}/0?full=1`) : undefined;
}

export function getPetCoordinates(pet: Pet): { lat: number; lng: number } | null {
  return pet.latitude && pet.longitude ? { lat: pet.latitude, lng: pet.longitude } : null;
}

export interface PublicContact {
  type: 'phone' | 'email' | null;
  value: string;
}

export function getPublicContact(pet: Pet): PublicContact {
  const visible = pet.contact_visible !== false;
  if (visible && pet.contact_info) {
    const digits = pet.contact_info.replace(/\D/g, '');
    if (/^\d{8,}$/.test(digits)) {
      return { type: 'phone', value: pet.contact_info };
    }
    if (pet.contact_info.includes('@')) {
      return { type: 'email', value: pet.contact_info };
    }
  }
  if (pet.owner_email) {
    return { type: 'email', value: pet.owner_email };
  }
  return { type: null, value: '' };
}

export function formatPetDate(dateStr: string): Date {
  return new Date(dateStr);
}

export const getPets = async (status?: PetStatus, includeHidden?: boolean): Promise<Pet[]> => {
  const data = await api.pets.list(status, includeHidden);
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
