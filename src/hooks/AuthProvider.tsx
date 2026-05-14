import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  phone?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  login: (token: string, userData: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch { /* ignore */ }
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const isAdmin = user?.role === 'admin';

  const login = useCallback((token: string, userData: AuthUser) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}