import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';
import { getPortalTitle } from '../utils/portalBranding';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me')
        .then((res) => {
          setUser(res.data.user);
          const campusType = res.data?.user?.campus?.campus_type || res.data?.user?.campus_type;
          if (campusType) localStorage.setItem('crm_portal_type', campusType);
          else localStorage.removeItem('crm_portal_type');
        })
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = getPortalTitle(user);
  }, [user]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    const campusType = res.data?.user?.campus?.campus_type || res.data?.user?.campus_type;
    if (campusType) localStorage.setItem('crm_portal_type', campusType);
    else localStorage.removeItem('crm_portal_type');
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
