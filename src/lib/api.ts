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
  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
register: (email: string, password: string, displayName?: string, phone?: string) =>
       request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName, phone }) }),
    me: () => request('/auth/me'),
  },
  pets: {
    list: (status?: string) => request(`/pets${status ? `?status=${status}` : ''}`),
    get: (id: string) => request(`/pets/${id}`),
    create: (data: any) => request('/pets', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/pets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/pets/${id}`, { method: 'DELETE' }),
    verify: (id: string, verified: boolean) =>
      request(`/pets/${id}/verify`, { method: 'PUT', body: JSON.stringify({ verified }) }),
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
  },
  users: {
    list: () => request('/users'),
    update: (id: string, data: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
    changePassword: (id: string, currentPassword: string, newPassword: string) =>
      request(`/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
    myPets: (id: string) => request(`/users/${id}/pets`),
  },
};
