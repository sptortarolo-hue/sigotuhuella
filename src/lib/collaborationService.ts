import { api } from './api';

export interface CollaborationAccount {
  id: string;
  title: string;
  description: string | null;
  bank_name: string;
  alias: string | null;
  cbu: string | null;
  cvu: string | null;
  display_order: number;
  mercadopago_link: string | null;
}

export interface VolunteerRequest {
  id: string;
  full_name: string;
  residence_zone: string;
  whatsapp: string;
  user_id: string;
  status: 'pending' | 'reviewed' | 'accepted';
  created_at: string;
  email?: string;
  display_name?: string;
}

export const getCollaborationAccounts = async (): Promise<CollaborationAccount[]> => {
  const data = await api.collaboration.list();
  return data.accounts || [];
};

export const createCollaborationAccount = async (data: any): Promise<void> => {
  await api.collaboration.create(data);
};

export const updateCollaborationAccount = async (id: string, data: any): Promise<void> => {
  await api.collaboration.update(id, data);
};

export const deleteCollaborationAccount = async (id: string): Promise<void> => {
  await api.collaboration.delete(id);
};

export const createVolunteerRequest = async (data: { fullName: string; residenceZone: string; whatsapp: string }): Promise<void> => {
  await api.volunteers.create(data);
};

export const getVolunteerRequests = async (): Promise<VolunteerRequest[]> => {
  const data = await api.volunteers.list();
  return data.requests || [];
};

export const updateVolunteerRequestStatus = async (id: string, status: string): Promise<void> => {
  await api.volunteers.updateStatus(id, status);
};
