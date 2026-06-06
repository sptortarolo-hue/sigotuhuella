const BASE_URL = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
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
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (email: string, password: string, displayName?: string, phone?: string) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName, phone }) }),
    me: () => request('/auth/me'),
    forgotPassword: (email: string) =>
      request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: (token: string, newPassword: string) =>
      request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
  },
  pets: {
    list: (status?: string) => request(`/pets${status ? `?status=${status}` : ''}`),
    listPublic: () => request('/pets?public=true'),
    get: (id: string) => request(`/pets/${id}`),
    create: (data: any) => request('/pets', { method: 'POST', body: JSON.stringify(data) }),
    publicCreate: (data: any) => request('/pets/public', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/pets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/pets/${id}`, { method: 'DELETE' }),
    verify: (id: string, verified: boolean) =>
      request(`/pets/${id}/verify`, { method: 'PUT', body: JSON.stringify({ verified }) }),
    records: {
      list: (petId: string) => request(`/pets/${petId}/records`),
      summary: (petId: string) => request(`/pets/${petId}/records/summary`),
      create: (petId: string, data: any) => request(`/pets/${petId}/records`, { method: 'POST', body: JSON.stringify(data) }),
      update: (petId: string, recordId: string, data: any) => request(`/pets/${petId}/records/${recordId}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (petId: string, recordId: string) => request(`/pets/${petId}/records/${recordId}`, { method: 'DELETE' }),
      report: async (petId: string) => {
        const token = localStorage.getItem('token');
        try {
          const res = await fetch(`/api/pets/${petId}/records/report`, {
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
  volunteers: {
    list: () => request('/volunteers'),
    create: (data: any) => request('/volunteers', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
      request(`/volunteers/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
    delete: (id: string) => request(`/volunteers/${id}`, { method: 'DELETE' }),
  },
  users: {
    list: () => request('/users'),
    update: (id: string, data: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
    changePassword: (id: string, currentPassword: string, newPassword: string) =>
      request(`/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
    myPets: (id: string) => request(`/users/${id}/pets`),
    uploadAvatar: (id: string, data: { imageData: string; mimeType: string }) =>
      request(`/users/${id}/avatar`, { method: 'PUT', body: JSON.stringify(data) }),
    stats: (id: string) => request(`/users/${id}/stats`),
  },
  members: {
    me: () => request('/members/me'),
    verify: (memberNumber: string) => request(`/members/verify/${memberNumber}`),
  },
  news: {
    list: () => request('/news'),
    get: (id: string) => request(`/news/${id}`),
    create: (data: any) => request('/news', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/news/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/news/${id}`, { method: 'DELETE' }),
  },
  settings: {
    list: () => request('/settings'),
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
  },
  lostReport: (data: any) => request('/pets/lost-report', { method: 'POST', body: JSON.stringify(data) }),
  requestChapita: (data: any) => request('/request-chapita', { method: 'POST', body: JSON.stringify(data) }),
  checkEmail: (email: string) => request('/auth/check-email', { method: 'POST', body: JSON.stringify({ email }) }),
  completeRegistration: (data: { email?: string; token?: string; password: string }) =>
    request('/auth/complete-registration', { method: 'POST', body: JSON.stringify(data) }),
  validateToken: (token: string) => request(`/auth/validate-token/${token}`),

  myPets: {
    list: () => request('/my-pets'),
    get: (id: string) => request(`/my-pets/${id}`),
    create: (data: any) => request('/my-pets', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/my-pets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/my-pets/${id}`, { method: 'DELETE' }),
    requestQr: (id: string) => request(`/my-pets/${id}/request-qr`, { method: 'POST' }),
    vetShare: (id: string, enabled: boolean) => request(`/my-pets/${id}/vet-share`, { method: 'POST', body: JSON.stringify({ enabled }) }),
    featured: () => request('/my-pets/featured'),
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
    },
    reminders: (petId: string) => request(`/my-pets/${petId}/reminders`),
    convert: (petId: string, extra?: { bio?: string; birth_date?: string; weight_kg?: number; personality_tags?: string[] }) =>
      request(`/my-pets/convert/${petId}`, { method: 'POST', body: extra ? JSON.stringify(extra) : undefined }),
    generateVideo: (petId: string, options?: any) => request(`/my-pets/${petId}/generate-video`, { method: 'POST', body: options ? JSON.stringify(options) : undefined }),
    healthTips: (petId: string) => request(`/my-pets/${petId}/health-tips`),
  },
  qr: {
    batch: (count: number) => request('/qr/batch', { method: 'POST', body: JSON.stringify({ count }) }),
    unassigned: () => request('/qr/unassigned'),
    requests: () => request('/qr/requests'),
    assign: (qrId: string, myPetId: string) => request('/qr/assign', { method: 'POST', body: JSON.stringify({ qr_id: qrId, my_pet_id: myPetId }) }),
    claim: (code: string, myPetId: string) => request('/qr/claim', { method: 'POST', body: JSON.stringify({ code, my_pet_id: myPetId }) }),
    public: (token: string) => request(`/qr/public/${token}`),
    found: (token: string, data: any) => request(`/qr/public/${token}/found`, { method: 'POST', body: JSON.stringify(data) }),
    cleanup: () => request('/qr/cleanup', { method: 'DELETE' }),
    assigned: () => request('/qr/assigned'),
    batchPdf: (batchId: string, mirror?: boolean) => {
      const token = getToken();
      const suffix = mirror ? '-sublimar' : '';
      return fetch(`/api/qr/batch/${batchId}/pdf${mirror ? '?mirror=1' : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(async res => {
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error al descargar PDF'); }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qr-${batchId}${suffix}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    },
  },
  feed: {
    list: (page = 1) => request(`/feed?page=${page}`),
    create: (data: any) => request('/feed', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/feed/${id}`, { method: 'DELETE' }),
    like: (id: string) => request(`/feed/${id}/like`, { method: 'POST' }),
    unlike: (id: string) => request(`/feed/${id}/unlike`, { method: 'POST' }),
    comments: {
      list: (postId: string) => request(`/feed/${postId}/comments`),
      create: (postId: string, content: string) => request(`/feed/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
      delete: (postId: string, commentId: string) => request(`/feed/${postId}/comments/${commentId}`, { method: 'DELETE' }),
    },
  },
};
