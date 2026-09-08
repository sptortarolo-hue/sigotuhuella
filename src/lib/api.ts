import { isNative } from '@/src/lib/platform';
import { IS_PLAY_BUILD } from '@/src/lib/buildConfig';

const API_ORIGIN = isNative()
  ? `${import.meta.env.VITE_API_URL || 'https://sigotuhuella.com.ar'}`
  : '';

const BASE_URL = `${API_ORIGIN}/api`;

export function apiUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//.test(path) || path.startsWith('data:')) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

function getToken(): string | null {
  return localStorage.getItem('token');
}

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 15_000;

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const isRead = !options.method || options.method === 'GET';

  if (isRead) {
    const cached = cache.get(path);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  } else {
    cache.clear();
  }

  // check-token puede vincular adopter_id al usuario logueado: no cachear
  if (isRead && path.includes('/adoption-assignments/check-token/')) {
    const token = getToken();
    const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    const ct = res.headers.get('content-type') || '';
    let data: any;
    if (ct.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error(`El servidor respondió sin JSON (${res.status}): ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
    }
    if (!res.ok) {
      const err: any = new Error(data.error || 'Request failed');
      err.fbtrace_id = data.fbtrace_id;
      throw err;
    }
    return data;
  }

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
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  let data: any;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    const snippet = text.slice(0, 200).replace(/\s+/g, ' ');
    const err: any = new Error(`El servidor respondió sin JSON (${res.status}): ${snippet}`);
    err.isNonJson = true;
    throw err;
  }
  if (!res.ok) {
    const err: any = new Error(data.error || 'Request failed');
    err.fbtrace_id = data.fbtrace_id;
    throw err;
  }

  if (isRead) {
    cache.set(path, { data, timestamp: Date.now() });
  }

  return data;
}

export const api = {
  ...(IS_PLAY_BUILD
    ? {}
    : {
        whatsappRelay: {
          status: () => request('/relay/admin-status'),
          toggle: () => request('/relay/admin-toggle', { method: 'POST' }),
          send: (to: string, text: string, image_url?: string) => request('/relay/send', { method: 'POST', body: JSON.stringify({ to, text, image_url }) }),
          groupsBroadcast: (text: string, image_url?: string) => request('/relay/groups-broadcast', { method: 'POST', body: JSON.stringify({ text, image_url }) }),
          testBroadcast: (petId: string, to: string) => request('/relay/test-broadcast', { method: 'POST', body: JSON.stringify({ petId: petId || undefined, to }) }),
          pets: (category: string, search?: string) => request(`/relay/pets?category=${category}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
          broadcastPet: (petId: string, groupIds: string[]) => request('/relay/broadcast-pet', { method: 'POST', body: JSON.stringify({ petId, groupIds }) }),
          failedMessages: () => request('/relay/relay-failed'),
          broadcastAdoptions: () => request('/relay/broadcast-adoptions', { method: 'POST' }),
          clearQueue: () => request('/relay/clear-queue', { method: 'POST' }),
          pendingMessages: () => request('/relay/pending-list'),
          recentSent: () => request('/relay/recent-sent'),
          deleteMessage: (id: string) => request(`/relay/message/${id}`, { method: 'DELETE' }),
        },
      }),
  get: (path: string) => request(path),
  post: (path: string, body?: any) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: any) => request(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (email: string, password: string, displayName?: string, phone?: string, notification_preference?: string) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName, phone, notification_preference }) }),
    me: () => request('/auth/me'),
    deleteAccount: () => request('/auth/me', { method: 'DELETE' }),
    forgotPassword: (email: string) =>
      request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: (token: string, newPassword: string) =>
      request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
    verifyEmail: (token: string) => request(`/auth/verify-email/${token}`),
    resendVerification: (email: string) =>
      request('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
    googleLogin: (credential: string) =>
      request('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),
    linkGoogle: (credential: string, password: string) =>
      request('/auth/link-google', { method: 'POST', body: JSON.stringify({ credential, password }) }),
  },
  pets: {
    list: (status?: string, includeHidden?: boolean) => request(`/pets${status ? `?status=${status}` : ''}${includeHidden ? `${status ? '&' : '?'}include_hidden=true` : ''}${status || includeHidden ? '&lite=1' : '?lite=1'}`),
    listFull: (status?: string, includeHidden?: boolean) => request(`/pets${status ? `?status=${status}` : ''}${includeHidden ? `${status ? '&' : '?'}include_hidden=true` : ''}${status || includeHidden ? '&lite=0' : '?lite=0'}`),
    adminList: (status?: string, includeHidden?: boolean) => request(`/pets/admin-list${status ? `?status=${status}` : ''}${includeHidden ? `${status ? '&' : '?'}include_hidden=true` : ''}${status || includeHidden ? '&lite=1' : '?lite=1'}`),
    listPublic: () => request('/pets?public=true&lite=1'),
    get: (id: string) => request(`/pets/${id}`),
    create: (data: any) => request('/pets', { method: 'POST', body: JSON.stringify(data) }),
    publicCreate: (data: any) => request('/pets/public', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/pets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/pets/${id}`, { method: 'DELETE' }),
    relations: (id: string) => request(`/pets/${id}/relations`),
    group: (id: string, memberId: string) =>
      request(`/pets/${id}/group`, { method: 'POST', body: JSON.stringify({ memberId }) }),
    ungroup: (id: string, memberId: string) =>
      request(`/pets/${id}/ungroup`, { method: 'POST', body: JSON.stringify({ memberId }) }),
    similar: (id: string) => request(`/pets/${id}/similar`),
    rejectMatch: (id: string, otherId: string) =>
      request(`/pets/${id}/match-reject`, { method: 'POST', body: JSON.stringify({ otherId }) }),
    groupedMembers: (id: string) => request(`/pets/${id}/grouped-members`),
    transit: (id: string, userId?: string | null, caregiver?: { caregiverName?: string; caregiverPhone?: string; caregiverEmail?: string }) =>
      request(`/pets/${id}/transit`, { method: 'POST', body: JSON.stringify({ userId: userId || null, caregiverName: caregiver?.caregiverName || null, caregiverPhone: caregiver?.caregiverPhone || null, caregiverEmail: caregiver?.caregiverEmail || null }) }),
    exitTransit: (id: string) =>
      request(`/pets/${id}/exit-transit`, { method: 'POST' }),
    history: (id: string) => request(`/pets/${id}/history`),
    reorderImages: (id: string, imageIds: string[]) =>
      request(`/pets/${id}/images/reorder`, { method: 'PUT', body: JSON.stringify({ imageIds }) }),
    deleteImage: (petId: string, imageId: string) =>
      request(`/pets/${petId}/images/${imageId}`, { method: 'DELETE' }),
    publish: (id: string, platforms: string[]) => request('/pets/' + id + '/publish', { method: 'POST', body: JSON.stringify({ platforms }) }),
    verify: (id: string, verified: boolean) =>
      request(`/pets/${id}/verify`, { method: 'PUT', body: JSON.stringify({ verified }) }),
    byNeighborhoods: (neighborhoods: string[], status?: string, limit?: number) => {
      const params = new URLSearchParams();
      params.set('neighborhoods', JSON.stringify(neighborhoods));
      if (status) params.set('status', status);
      if (limit) params.set('limit', String(limit));
      return request(`/pets?${params.toString()}`);
    },
    search: (filters: Record<string, string>) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v && v !== 'all') params.set(k, v);
      }
      params.set('lite', '1');
      return request(`/pets?${params.toString()}`);
    },
    taxonomy: () => request('/pets/taxonomy'),
    ownerData: (id: string) => request(`/pets/${id}/owner-data`),
    records: {
      list: (petId: string) => request(`/pets/${petId}/records`),
      summary: (petId: string) => request(`/pets/${petId}/records/summary`),
      create: (petId: string, data: any) => request(`/pets/${petId}/records`, { method: 'POST', body: JSON.stringify(data) }),
      update: (petId: string, recordId: string, data: any) => request(`/pets/${petId}/records/${recordId}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (petId: string, recordId: string) => request(`/pets/${petId}/records/${recordId}`, { method: 'DELETE' }),
      report: async (petId: string) => {
        const token = localStorage.getItem('token');
        try {
          const res = await fetch(apiUrl(`/api/pets/${petId}/records/report`), {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          });
          if (!res.ok) { const err = await res.json(); alert(err.error || 'Error al generar PDF'); return; }
          const disposition = res.headers.get('Content-Disposition');
          const match = disposition?.match(/filename="?(.+?)"?$/);
          const filename = match ? match[1] : 'seguimiento.pdf';
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e) { alert('Error al descargar el PDF'); }
      },
    },
  },
  collaboration: {
    list: () => request('/collaboration'),
    create: (data: any) => request('/collaboration', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/collaboration/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/collaboration/${id}`, { method: 'DELETE' }),
  },
  cases: {
    get: (id: string) => request(`/cases/${id}`),
    mine: () => request('/cases/mine'),
    listAll: (status?: string) => request(`/cases${status ? `?status=${status}` : ''}`),
    updateStatus: (id: string, status: string) =>
      request(`/cases/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    sightings: (id: string) => request(`/cases/${id}/sightings`),
    createSighting: (id: string, data: any) =>
      request(`/cases/${id}/sightings`, { method: 'POST', body: JSON.stringify(data) }),
    hideSighting: (sightingId: string, hidden: boolean) =>
      request(`/cases/sightings/${sightingId}/hide`, { method: 'POST', body: JSON.stringify({ hidden }) }),
    searchAreas: (id: string) => request(`/cases/${id}/search-areas`),
    createSearchArea: (id: string, area_geojson: any, notes?: string) =>
      request(`/cases/${id}/search-areas`, { method: 'POST', body: JSON.stringify({ area_geojson, notes }) }),
    sendNeighborhoodAlert: (id: string, data?: { neighborhoods?: string[]; radius_km?: number }) =>
      request(`/cases/${id}/neighborhood-alert`, { method: 'POST', body: JSON.stringify(data || {}) }),
    shares: (id: string) => request(`/cases/${id}/shares`),
    proposeMeeting: (id: string, data: { lat?: number; lng?: number; time: string; location?: string }) =>
      request(`/cases/${id}/meeting`, { method: 'POST', body: JSON.stringify(data) }),
    reunite: (id: string, data?: { photo_data?: string | null; photo_mime?: string | null; owner_name?: string | null; owner_phone?: string | null; owner_email?: string | null; owner_address?: string | null }) =>
      request(`/cases/${id}/reunite`, { method: 'POST', body: JSON.stringify(data || {}) }),
    close: (id: string, reason: string) =>
      request(`/cases/${id}/close`, { method: 'POST', body: JSON.stringify({ reason }) }),
    follow: (id: string) => request(`/cases/${id}/follow`, { method: 'POST' }),
    unfollow: (id: string) => request(`/cases/${id}/follow`, { method: 'DELETE' }),
    followed: () => request('/cases/followed'),
    renew: (id: string) => request(`/cases/${id}/renew`, { method: 'POST' }),
    replyComment: (id: string, commentId: string, text: string) =>
      request(`/cases/${id}/comments/${commentId}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
  },
  gamification: {
    myStats: () => request('/my-stats'),
  },
  volunteers: {
    list: () => request('/volunteers'),
    create: (data: any) => request('/volunteers', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
      request(`/volunteers/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
    delete: (id: string) => request(`/volunteers/${id}`, { method: 'DELETE' }),
    mySubscriptions: () => request('/volunteers/my-subscriptions'),
    shareStats: () => request('/volunteers/share-stats'),
  },
  users: {
    list: () => request('/users'),
    create: (data: any) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
    search: (q: string) => request(`/users/search?q=${encodeURIComponent(q)}`),
    relations: (id: string) => request(`/users/${id}/relations`),
    update: (id: string, data: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
    changePassword: (id: string, currentPassword: string, newPassword: string) =>
      request(`/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
    myPets: (id: string) => request(`/users/${id}/pets`),
    uploadAvatar: (id: string, data: { imageData: string; mimeType: string }) =>
      request(`/users/${id}/avatar`, { method: 'PUT', body: JSON.stringify(data) }),
    stats: (id: string) => request(`/users/${id}/stats`),
    updateMember: (id: string, data: { memberNumber?: string; displayName?: string }) =>
      request(`/users/${id}/member`, { method: 'PUT', body: JSON.stringify(data) }),
    setPassword: (id: string, password: string) =>
      request(`/users/${id}/set-password`, { method: 'PUT', body: JSON.stringify({ password }) }),
    invites: {
      pending: () => request('/invites/pending'),
      accept: (token: string) => request(`/invites/${token}/accept`, { method: 'POST' }),
      reject: (token: string) => request(`/invites/${token}/reject`, { method: 'POST' }),
    },
  },
  members: {
    me: () => request('/members/me'),
    verify: (memberNumber: string) => request(`/members/verify/${memberNumber}`),
  },
  news: {
    list: () => request('/news?lite=1'),
    listFull: () => request('/news?lite=0'),
    get: (id: string) => request(`/news/${id}`),
    create: (data: any) => request('/news', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/news/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/news/${id}`, { method: 'DELETE' }),
    publications: (id: string) => request(`/news/${id}/publications`),
    publish: (id: string, platforms: string[]) =>
      request(`/news/${id}/publish`, { method: 'POST', body: JSON.stringify({ platforms }) }),
  },
  settings: {
    list: () => request('/settings'),
    get: async (key: string) => {
      const res = await request('/settings/batch', { method: 'POST', body: JSON.stringify({ keys: [key] }) });
      return res[key];
    },
    update: (key: string, value: string) => request(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
    getPublic: () => request('/settings/public'),
  },
  ai: {
    generateNews: (data: { type: string; topic?: string }) =>
      request('/ai/generate-news', { method: 'POST', body: JSON.stringify(data) }),
  },
  whatsapp: {
    messages: (status?: string) => request(`/whatsapp/messages${status ? `?status=${status}` : ''}`),
    getMessage: (id: string) => request(`/whatsapp/messages/${id}`),
    conversations: (status?: string) => request(`/whatsapp/conversations${status ? `?status=${status}` : ''}`),
    getConversation: (id: string) => request(`/whatsapp/conversations/${id}`),
    reply: (convId: string, text: string) => request(`/whatsapp/conversations/${convId}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
    assignBot: (convId: string, botName: string) => request(`/whatsapp/conversations/${convId}/assign-bot`, { method: 'POST', body: JSON.stringify({ bot_name: botName }) }),
    closeConversation: (convId: string) => request(`/whatsapp/conversations/${convId}/close`, { method: 'POST' }),
    stats: () => request('/whatsapp/stats'),
    profile: () => request('/whatsapp/profile'),
    updateProfile: (fields: any) => request('/whatsapp/profile', { method: 'PUT', body: JSON.stringify(fields) }),
    groups: () => request('/whatsapp/groups'),
    addGroup: (data: { name: string; group_id: string; type?: string }) => request('/whatsapp/groups', { method: 'POST', body: JSON.stringify(data) }),
    updateGroup: (id: string, data: { name?: string; group_id?: string; is_active?: boolean; auto_broadcast?: boolean; broadcast_adoptions?: boolean; scrape_enabled?: boolean }) => request(`/whatsapp/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteGroup: (id: string) => request(`/whatsapp/groups/${id}`, { method: 'DELETE' }),
    broadcast: (text: string) => request('/whatsapp/groups/broadcast', { method: 'POST', body: JSON.stringify({ text }) }),
    broadcastPet: (petId: string) => request(`/whatsapp/groups/broadcast-pet/${petId}`, { method: 'POST' }),
    chapitaRequests: (status?: string) => request(`/whatsapp/chapita-requests${status ? `?status=${status}` : ''}`),
    chapitaUpdate: (id: number, data: { status?: string; notes?: string }) => request(`/whatsapp/chapita-requests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    chapitaNotify: (id: number, message: string) => request(`/whatsapp/chapita-requests/${id}/notify`, { method: 'POST', body: JSON.stringify({ message }) }),
  },
  lostReport: (data: any) => request('/pets/lost-report', { method: 'POST', body: JSON.stringify(data) }),
  requestChapita: (data: any) => request('/request-chapita', { method: 'POST', body: JSON.stringify(data) }),
  checkEmail: (email: string) => request('/auth/check-email', { method: 'POST', body: JSON.stringify({ email }) }),
  completeRegistration: (data: { email?: string; token?: string; password: string }) =>
    request('/auth/complete-registration', { method: 'POST', body: JSON.stringify(data) }),
  validateToken: (token: string) => request(`/auth/validate-token/${token}`),

  facebook: {
    groups: {
      list: () => request('/facebook/groups'),
      create: (data: { name: string; url: string }) => request('/facebook/groups', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) => request(`/facebook/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/facebook/groups/${id}`, { method: 'DELETE' }),
    },
    posts: {
      list: (params?: { group_id?: string; classification?: string; species?: string; search?: string; limit?: number; offset?: number; has_images?: boolean; is_spam?: boolean }) => {
        const q = new URLSearchParams();
        if (params?.group_id) q.set('group_id', params.group_id);
        if (params?.classification) q.set('classification', params.classification);
        if (params?.species) q.set('species', params.species);
        if (params?.search) q.set('search', params.search);
        if (params?.limit) q.set('limit', String(params.limit));
        if (params?.offset) q.set('offset', String(params.offset));
        if (params?.has_images) q.set('has_images', 'true');
        if (params?.is_spam) q.set('is_spam', 'true');
        return request(`/facebook/posts?${q.toString()}`);
      },
      get: (id: string) => request(`/facebook/posts/${id}`),
      update: (id: string, data: any) => request(`/facebook/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/facebook/posts/${id}`, { method: 'DELETE' }),
      bulkDelete: (ids: string[]) => request('/facebook/posts/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
      classify: (id: string) => request(`/facebook/classify/${id}`, { method: 'POST' }),
    },
    matches: {
      list: (params?: { status?: string; limit?: number; offset?: number }) => {
        const q = new URLSearchParams();
        if (params?.status) q.set('status', params.status);
        if (params?.limit) q.set('limit', String(params.limit));
        if (params?.offset) q.set('offset', String(params.offset));
        return request(`/facebook/matches?${q.toString()}`);
      },
      confirm: (id: string) => request(`/facebook/matches/${id}/confirm`, { method: 'POST' }),
      reject: (id: string) => request(`/facebook/matches/${id}/reject`, { method: 'POST' }),
    },
    runMatching: (postId?: string) => request('/facebook/run-matching', { method: 'POST', body: JSON.stringify({ post_id: postId }) }),
    search: (params?: { species?: string; color?: string; location?: string; classification?: string }) => {
      const q = new URLSearchParams();
      if (params?.species) q.set('species', params.species);
      if (params?.color) q.set('color', params.color);
      if (params?.location) q.set('location', params.location);
      if (params?.classification) q.set('classification', params.classification);
      return request(`/facebook/search?${q.toString()}`);
    },
    stats: () => request('/facebook/stats'),
    refreshMetrics: () => request('/facebook/refresh-metrics', { method: 'POST' }),
    syncStatus: () => request('/facebook/sync-status'),
    diagnose: () => request('/facebook/engagement-diagnose'),
    publish: (petId: string) => request('/facebook/publish', { method: 'POST', body: JSON.stringify({ petId }) }),
    publishInstagram: (id: string) => request(`/facebook/publish-instagram/${id}`, { method: 'POST' }),
    replicateLatest: (limit = 5) => request(`/facebook/replicate-latest?limit=${limit}`, { method: 'POST' }),
    retryFailed: (limit = 10) => request(`/facebook/retry-failed?limit=${limit}`, { method: 'POST' }),
    pagePosts: (limit = 50, offset = 0) => request(`/facebook/page-posts?limit=${limit}&offset=${offset}`),
    updateGroupMember: (id: string, data: { fb_group_id?: string; page_is_member?: boolean; publish_on_create?: boolean }) =>
      request(`/facebook/groups/${id}/page-member`, { method: 'PUT', body: JSON.stringify(data) }),
    verifyAllMemberships: () => request('/facebook/groups/verify-memberships', { method: 'POST' }),
    verifyGroupMembership: (id: string) => request(`/facebook/groups/${id}/verify-membership`, { method: 'POST' }),
    publishStatus: () => request('/facebook/publish-status'),
    extractGroupIds: () => request('/facebook/extract-group-ids', { method: 'POST' }),
  },

  ...(IS_PLAY_BUILD
    ? {}
    : {
        facebookRelay: {
          status: () => request('/relay/fb/status'),
          toggle: () => request('/relay/fb/toggle', { method: 'POST' }),
          uploadSession: (file: File) => {
            const form = new FormData();
            form.append('session', file);
            return request('/relay/fb/upload-session', { method: 'POST', body: form });
          },
          clearSession: () => request('/relay/fb/clear-session', { method: 'POST' }),
          stats: () => request('/relay/fb/stats'),
          failedTasks: () => request('/relay/fb/failed-tasks'),
          debugView: () => request('/relay/fb-debug-view'),
          groups: () => request('/relay/fb/groups-ui'),
          broadcastAdoptions: () => request('/relay/fb/broadcast-adoptions', { method: 'POST' }),
          clearQueue: () => request('/relay/fb/clear-queue', { method: 'POST' }),
        },
      }),
  phoneRelay: {
    scrapedMessages: {
      get: (id: string) => request(`/relay/scraped-messages/${id}`),
      list: (params?: {
        source?: string; group_id?: string; classification?: string; species?: string;
        color?: string; animal_detected?: string; animal_species?: string; is_matched?: string;
        search?: string; q?: string; limit?: number; offset?: number;
      }) => {
        const q = new URLSearchParams();
        if (params?.source && params.source !== 'all') q.set('source', params.source);
        if (params?.group_id) q.set('group_id', params.group_id);
        if (params?.classification && params.classification !== 'all') q.set('classification', params.classification);
        if (params?.species && params.species !== 'all') q.set('species', params.species);
        if (params?.color && params.color !== 'all') q.set('color', params.color);
        if (params?.animal_detected && params.animal_detected !== 'all') q.set('animal_detected', params.animal_detected);
        if (params?.animal_species && params.animal_species !== 'all') q.set('animal_species', params.animal_species);
        if (params?.is_matched && params.is_matched !== 'all') q.set('is_matched', params.is_matched);
        if (params?.search) q.set('search', params.search);
        if (params?.q) q.set('q', params.q);
        if (params?.limit) q.set('limit', String(params.limit));
        if (params?.offset) q.set('offset', String(params.offset));
        return request(`/relay/scraped-messages?${q.toString()}`);
      },
    },
  },

  myPets: {
    list: () => request('/my-pets'),
    get: (id: string) => request(`/my-pets/${id}`),
    create: (data: any) => request('/my-pets', { method: 'POST', body: JSON.stringify(data) }),
    ...(IS_PLAY_BUILD
      ? {}
      : {
          createForUser: (userId: string, data: any) => request(`/my-pets/admin/for-user/${userId}`, { method: 'POST', body: JSON.stringify(data) }),
        }),
    update: (id: string, data: any) => request(`/my-pets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/my-pets/${id}`, { method: 'DELETE' }),
    requestQr: (id: string) => request(`/my-pets/${id}/request-qr`, { method: 'POST' }),
    vetShare: (id: string, enabled: boolean) => request(`/my-pets/${id}/vet-share`, { method: 'POST', body: JSON.stringify({ enabled }) }),
    featured: () => request('/my-pets/featured'),
    sharedWithMe: () => request('/my-pets/shared/with-me'),
    photos: {
      list: (petId: string) => request(`/my-pets/${petId}/photos`),
      create: (petId: string, data: any) => request(`/my-pets/${petId}/photos`, { method: 'POST', body: JSON.stringify(data) }),
      delete: (petId: string, photoId: string) => request(`/my-pets/${petId}/photos/${photoId}`, { method: 'DELETE' }),
    },
    events: {
      list: (petId: string) => request(`/my-pets/${petId}/events`),
      create: (petId: string, data: any) => request(`/my-pets/${petId}/events`, { method: 'POST', body: JSON.stringify(data) }),
      delete: (petId: string, eventId: string) => request(`/my-pets/${petId}/events/${eventId}`, { method: 'DELETE' }),
    },
    records: {
      list: (petId: string) => request(`/my-pets/${petId}/records`),
      create: (petId: string, data: any) => request(`/my-pets/${petId}/records`, { method: 'POST', body: JSON.stringify(data) }),
      update: (petId: string, recordId: string, data: any) => request(`/my-pets/${petId}/records/${recordId}`, { method: 'PUT', body: JSON.stringify(data) }),
    },
    reminders: (petId: string) => request(`/my-pets/${petId}/reminders`),
    convert: (petId: string, extra?: { bio?: string; birth_date?: string; weight_kg?: number; personality_tags?: string[] }) =>
      request(`/my-pets/convert/${petId}`, { method: 'POST', body: extra ? JSON.stringify(extra) : undefined }),
    generateVideo: (petId: string, options?: any) => request(`/my-pets/${petId}/generate-video`, { method: 'POST', body: options ? JSON.stringify(options) : undefined }),
    healthTips: (petId: string) => request(`/my-pets/${petId}/health-tips`),
    reportLost: (id: string, data: any) => request(`/my-pets/${id}/report-lost`, { method: 'POST', body: JSON.stringify(data) }),
  },
  qr: {
    batch: (count: number) => request('/qr/batch', { method: 'POST', body: JSON.stringify({ count }) }),
    unassigned: () => request('/qr/unassigned'),
    requests: () => request('/qr/requests'),
    assign: (qrId: string, myPetId: string) => request('/qr/assign', { method: 'POST', body: JSON.stringify({ qr_id: qrId, my_pet_id: myPetId }) }),
    reassign: (qrId: string, newMyPetId: string) => request('/qr/reassign', { method: 'POST', body: JSON.stringify({ qr_id: qrId, new_my_pet_id: newMyPetId }) }),
    petsAvailable: () => request('/qr/pets-available'),
    claim: (code: string, myPetId: string) => request('/qr/claim', { method: 'POST', body: JSON.stringify({ code, my_pet_id: myPetId }) }),
    assignByToken: (shareToken: string, myPetId: string) => request('/qr/assign-by-token', { method: 'POST', body: JSON.stringify({ share_token: shareToken, my_pet_id: myPetId }) }),
    public: (token: string) => request(`/qr/public/${token}`),
    scan: (token: string, coords?: { latitude: number; longitude: number }) =>
      request(`/qr/public/${token}/scan`, { method: 'POST', body: JSON.stringify(coords || {}) }),
    found: (token: string, data: any) => request(`/qr/public/${token}/found`, { method: 'POST', body: JSON.stringify(data) }),
    cleanup: () => request('/qr/cleanup', { method: 'DELETE' }),
    reactivate: (shareToken: string, code?: string) => request('/qr/reactivate', { method: 'POST', body: JSON.stringify({ share_token: shareToken, ...(code ? { code } : {}) }) }),
    assigned: (page?: number, limit?: number) => {
      const params = new URLSearchParams();
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return request(`/qr/assigned${qs ? `?${qs}` : ''}`);
    },
    notifyAssigned: (id: string) => request(`/qr/assigned/${id}/notify`, { method: 'POST' }),
    lastCode: () => request('/qr/last-code'),
    layout: (page_w: string, page_h: string) => request(`/qr/layout?page_w=${page_w}&page_h=${page_h}`),
    designSettings: () => request('/qr/design-settings'),
    saveDesignSettings: (data: Record<string, string | number>) => request('/qr/design-settings', { method: 'PUT', body: JSON.stringify(data) }),
    previewLogoUrl: () => {
      const token = getToken();
      return apiUrl(`/api/qr/preview-logo${token ? `?token=${token}` : ''}`);
    },
    batchPdf: (batchId: string, opts?: { from?: string; to?: string; page_w?: string; page_h?: string }) => {
      const token = getToken();
      const params = new URLSearchParams();
      if (opts?.from) params.set('from', opts.from);
      if (opts?.to) params.set('to', opts.to);
      if (opts?.page_w) params.set('page_w', opts.page_w);
      if (opts?.page_h) params.set('page_h', opts.page_h);
      const qs = params.toString();
      return fetch(apiUrl(`/api/qr/batch/${batchId}/pdf${qs ? '?' + qs : ''}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(async res => {
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error al descargar PDF'); }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qr-${batchId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    },
  },
  ...(IS_PLAY_BUILD
    ? {}
    : {
        adminDashboard: {
          get: () => request('/admin/dashboard'),
          updateSettings: (settings: Record<string, string>) =>
            request('/admin/dashboard/settings', { method: 'POST', body: JSON.stringify({ settings }) }),
          analytics: () => request('/admin/dashboard/analytics'),
        },
        moderation: {
          list: (status?: string) => request(`/reports${status ? `?status=${status}` : ''}`),
          setStatus: (id: string, status: string) => request(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
          hide: (id: string) => request(`/reports/${id}/hide`, { method: 'POST' }),
        },
      }),
  feed: {
    list: (page = 1) => request(`/feed?page=${page}`),
    create: (data: any) => request('/feed', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/feed/${id}`, { method: 'DELETE' }),
    like: (id: string) => request(`/feed/${id}/like`, { method: 'POST' }),
    unlike: (id: string) => request(`/feed/${id}/unlike`, { method: 'POST' }),
    report: (targetType: 'post' | 'comment' | 'pet', targetId: string, data: { reason: string; description?: string }) =>
      request('/reports', { method: 'POST', body: JSON.stringify({ targetType, targetId, ...data }) }),
    comments: {
      list: (postId: string) => request(`/feed/${postId}/comments`),
      create: (postId: string, content: string) => request(`/feed/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
      delete: (postId: string, commentId: string) => request(`/feed/${postId}/comments/${commentId}`, { method: 'DELETE' }),
    },
  },
  blocks: {
    list: () => request('/blocks'),
    block: (userId: string) => request(`/blocks/${userId}`, { method: 'POST' }),
    unblock: (userId: string) => request(`/blocks/${userId}`, { method: 'DELETE' }),
  },
  blacklist: {
    report: (data: { phone: string; context_type?: string; context_id?: string; reason?: string }) =>
      request('/blacklist/report', { method: 'POST', body: JSON.stringify(data) }),
    list: (status?: string) => request(`/blacklist${status ? `?status=${status}` : ''}`),
    review: (id: string, status: 'approved' | 'dismissed') =>
      request(`/blacklist/${id}/review`, { method: 'POST', body: JSON.stringify({ status }) }),
  },
  adoptionAssignments: {
    pending: () => request('/adoption-assignments/pending'),
    myPending: () => request('/adoption-assignments/my-pending'),
    claim: (token: string) => request(`/adoption-assignments/claim/${token}`, { method: 'POST' }),
    confirm: (token: string) => request(`/adoption-assignments/confirm/${token}`, { method: 'POST' }),
    return: (token: string, reason?: string) => request(`/adoption-assignments/return/${token}`, { method: 'POST', body: JSON.stringify({ reason }) }),
    checkToken: (token: string) => request(`/adoption-assignments/check-token/${token}`),
  },
  ...(IS_PLAY_BUILD
    ? {}
    : {
        raffles: {
          list: () => request('/raffles'),
          adminList: () => request('/raffles/admin'),
          get: (id: string) => request(`/raffles/${id}`),
          create: (data: any) => request('/raffles', { method: 'POST', body: JSON.stringify(data) }),
          update: (id: string, data: any) => request(`/raffles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
          delete: (id: string) => request(`/raffles/${id}`, { method: 'DELETE' }),
          reserve: (id: string, data: { numbers?: number[]; name: string; email?: string; phone: string; paymentMethod: string; autoConfirm?: boolean }) =>
            request(`/raffles/${id}/reserve`, { method: 'POST', body: JSON.stringify(data) }),
          reserveManual: (id: string, data: { count: number; name: string; phone: string; paymentMethod: string }) =>
            request(`/raffles/${id}/reserve`, { method: 'POST', body: JSON.stringify(data) }),
          ticketStatus: (id: string, ticketGroupId: string) => request(`/raffles/${id}/ticket-status/${ticketGroupId}`),
          draw: (id: string) => request(`/raffles/${id}/draw`, { method: 'POST' }),
          uploadReceipt: (id: string, data: { ticketGroupId: string; buyerName: string; buyerPhone: string; imageData: string; imageMime: string; amountExpected: number; status?: string }) =>
            request(`/raffles/${id}/receipt`, { method: 'POST', body: JSON.stringify(data) }),
          confirmReceipt: (raffleId: string, receiptId: string, note: string) =>
            request(`/raffles/${raffleId}/receipt/${receiptId}/confirm`, { method: 'POST', body: JSON.stringify({ adminNote: note }) }),
          rejectReceipt: (raffleId: string, receiptId: string, note: string) =>
            request(`/raffles/${raffleId}/receipt/${receiptId}/reject`, { method: 'POST', body: JSON.stringify({ adminNote: note }) }),
          cleanup: () => request('/raffles/cleanup', { method: 'POST' }),
          unmatchedReceipts: () => request('/raffles/unmatched-receipts'),
          assignReceipt: (id: string, data: { raffleId: string; ticketGroupId?: string; buyerName?: string; buyerPhone?: string; amountExpected?: number }) =>
            request(`/raffles/receipts/${id}/assign`, { method: 'POST', body: JSON.stringify(data) }),
          releaseTickets: (ticketGroupId: string) => request('/raffles/tickets/release', { method: 'POST', body: JSON.stringify({ ticketGroupId }) }),
          resendBankDetails: (raffleId: string, receiptId: string) => request(`/raffles/${raffleId}/receipt/${receiptId}/resend-bank`, { method: 'POST' }),
          paperPdf: async (raffleId: string) => {
            const token = getToken();
            const res = await fetch(apiUrl(`/api/raffles/${raffleId}/pdf`), {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) {
              const err: any = await res.json().catch(() => ({}));
              throw new Error(err.error || 'Error al generar el PDF');
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `papeletas-${raffleId}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          },
          saveDrawResults: (id: string, winners: any[]) =>
            request(`/raffles/${id}/draw-results`, { method: 'PUT', body: JSON.stringify({ winners }) }),
          uploadVideo: async (id: string, file: File) => {
            const formData = new FormData();
            formData.append('video', file);
            const token = getToken();
            const res = await fetch(`${BASE_URL}/raffles/${id}/video`, {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: formData,
            });
            if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Error al subir video'); }
            return res.json();
          },
          drawFlyer: async (id: string) => {
            const token = getToken();
            const res = await fetch(apiUrl(`/api/raffles/${id}/draw-flyer`), {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Error al descargar flyer'); }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `resultados-${id}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          },
          notifyParticipants: (id: string, data: { text: string }) =>
            request(`/raffles/${id}/notify-participants`, { method: 'POST', body: JSON.stringify(data) }),
        },
        backup: {
          list: () => request('/backup/list'),
          download: async (file: string) => {
            const token = getToken();
            const res = await fetch(`${BASE_URL}/backup/download/${encodeURIComponent(file)}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) {
              const err: any = new Error('Error al descargar backup');
              throw err;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          },
          run: () => request('/backup/run', { method: 'POST' }),
        },
      }),
};
