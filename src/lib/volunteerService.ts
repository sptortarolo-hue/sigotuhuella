import { apiUrl } from './api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function volRequest(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${apiUrl('/api/volunteers')}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ── Agrupaciones ──────────────────────────────────────────────────

export async function getAgrupaciones() {
  const data = await volRequest('/agrupaciones');
  return data.agrupaciones;
}

export async function getAllAgrupaciones() {
  const data = await volRequest('/agrupaciones/all');
  return data.agrupaciones;
}

export async function createAgrupacion(agrupacion: {
  name: string;
  description?: string;
  neighborhoods?: string[];
  contact_whatsapp?: string;
  contact_email?: string;
  logo_url?: string;
}) {
  const data = await volRequest('/agrupaciones', {
    method: 'POST',
    body: JSON.stringify(agrupacion),
  });
  return data.agrupacion;
}

export async function updateAgrupacion(id: string, updates: Record<string, any>) {
  const data = await volRequest(`/agrupaciones/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.agrupacion;
}

export async function deleteAgrupacion(id: string) {
  return volRequest(`/agrupaciones/${id}`, { method: 'DELETE' });
}

export async function getUsersForAgrupacion() {
  const token = localStorage.getItem('token');
  const res = await fetch(`${apiUrl('/api/users')}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.users;
}

// ── Categorías ───────────────────────────────────────────────────

export async function getCategories() {
  const data = await volRequest('/categories');
  return data.categories;
}

// ── Suscripciones ────────────────────────────────────────────────

export async function getMySubscriptions() {
  const data = await volRequest('/my-subscriptions');
  return data.subscriptions;
}

export async function subscribe(agrupacion_id: string, category: string) {
  const data = await volRequest('/subscribe', {
    method: 'POST',
    body: JSON.stringify({ agrupacion_id, category }),
  });
  return data.subscription;
}

export async function unsubscribe(agrupacion_id: string, category: string) {
  return volRequest('/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ agrupacion_id, category }),
  });
}

// ── Share logs ───────────────────────────────────────────────────

export async function logShare(pet_id: string, platform: string, share_type?: string) {
  return volRequest('/share-log', {
    method: 'POST',
    body: JSON.stringify({ pet_id, platform, share_type }),
  });
}

export async function logShareConfirmation(pet_id: string, platform: string, groups: { name: string; url?: string }[]) {
  return volRequest('/share-log', {
    method: 'POST',
    body: JSON.stringify({ pet_id, platform, share_type: 'group', groups }),
  });
}

export async function getShareStats() {
  const data = await volRequest('/share-stats');
  return data;
}

// ── Notificaciones ──────────────────────────────────────────────

export async function getNotifications() {
  const data = await volRequest('/notifications');
  return data;
}

export async function markAllNotificationsRead() {
  return volRequest('/notifications/read-all', { method: 'PUT' });
}

export async function markNotificationRead(id: string) {
  return volRequest(`/notifications/${id}/read`, { method: 'PUT' });
}

// ── Preferencias de notificación ─────────────────────────────────

export async function getNotificationChannels() {
  const data = await volRequest('/notification-channels');
  return data.channels;
}

export async function updateNotificationChannels(channels: {
  push?: boolean;
  email?: boolean;
  whatsapp?: boolean;
  in_app?: boolean;
}) {
  return volRequest('/notification-channels', {
    method: 'PUT',
    body: JSON.stringify({ channels }),
  });
}

// ── Grupos de FB para búsqueda ──────────────────────────────────

export async function getFbSearchGroups(agrupacion_id?: string, zone?: string) {
  const params = new URLSearchParams();
  if (agrupacion_id) params.set('agrupacion_id', agrupacion_id);
  if (zone) params.set('zone', zone);
  const qs = params.toString();
  const data = await volRequest(`/fb-search-groups${qs ? '?' + qs : ''}`);
  return data.groups;
}

export async function getPendingFbSearchGroups() {
  const data = await volRequest('/fb-search-groups/pending');
  return data.groups;
}

export async function requestFbSearchGroup(group: {
  agrupacion_id?: string;
  group_name: string;
  group_url: string;
  zone?: string;
}) {
  return volRequest('/fb-search-groups', {
    method: 'POST',
    body: JSON.stringify(group),
  });
}

export async function approveFbSearchGroup(id: string) {
  return volRequest(`/fb-search-groups/${id}/approve`, { method: 'PUT' });
}

export async function deleteFbSearchGroup(id: string) {
  return volRequest(`/fb-search-groups/${id}`, { method: 'DELETE' });
}

// ── Share Preview ────────────────────────────────────────────────

export async function getSharePreview(petId: string) {
  const data = await volRequest(`/share-preview/${petId}`);
  return data as { facebook: string; instagram: string; whatsapp: string };
}

// ── Dashboard ───────────────────────────────────────────────────

export async function getVolunteerDashboard() {
  const data = await volRequest('/dashboard');
  return data;
}

// ── Hallazgos del buscador ──────────────────────────────────────

export async function createFinding(pet_id: string, fb_url: string, description?: string, group_name?: string) {
  return volRequest('/findings', {
    method: 'POST',
    body: JSON.stringify({ pet_id, fb_url, description, group_name }),
  });
}

export async function getFindings(pet_id: string) {
  const data = await volRequest(`/findings/${pet_id}`);
  return data.findings;
}

export async function confirmFinding(finding_id: string) {
  return volRequest(`/findings/${finding_id}/confirm`, { method: 'PUT' });
}

export async function reuniteFromFinding(finding_id: string) {
  return volRequest(`/findings/${finding_id}/reunite`, { method: 'PUT' });
}

// ── Volunteer Action Center ───────────────────────────────────────

export interface ActionCenterPet {
  id: string;
  name: string;
  species: string;
  breed?: string;
  gender?: string;
  age?: string;
  color?: string;
  status: string;
  location?: string;
  neighborhoods?: string[];
  description?: string;
  contact_info?: string;
  case_number?: string;
  created_at: string;
  reporter_name?: string;
  reporter_phone?: string;
}

export interface ActionCenterPublications {
  facebook?: {
    pagePostUrl: string;
    groupPosts: { groupId: string; groupName: string; fbGroupId: string; postUrl: string }[];
  };
  instagram?: {
    permalink: string;
    igMediaId: string;
  };
}

export interface SharePreview {
  facebook: string;
  instagram: string;
  whatsapp: string;
}

export interface FbSearchGroup {
  id: string;
  group_name: string;
  group_url: string;
}

export interface ActionCenterData {
  pet: ActionCenterPet;
  volunteerCategories: string[];
  relevantAgrupacionIds: string[];
  publications: ActionCenterPublications;
  sharePreview: SharePreview;
  fbSearchGroups: FbSearchGroup[];
}

export async function getActionCenterData(petId: string): Promise<ActionCenterData> {
  const data = await volRequest(`/pet-action-center/${petId}`);
  return data;
}
