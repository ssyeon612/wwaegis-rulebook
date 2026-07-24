import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then((r) => setUser(r?.user || null)).catch(() => setUser(null)).finally(() => setLoading(false));
    const onExpire = () => setUser(null);
    window.addEventListener('auth-expired', onExpire);
    return () => window.removeEventListener('auth-expired', onExpire);
  }, []);

  const login = async (username, password) => {
    const r = await api.login(username, password).catch(() => ({ error: 'network', message: '서버에 연결할 수 없습니다.' }));
    if (r.error) return r;
    setToken(r.token); setUser(r.user);
    return r;
  };
  const logout = async () => { await api.logout().catch(() => {}); setToken(null); setUser(null); };

  const role = user?.role || null;
  const value = {
    user, loading, login, logout, role,
    canWrite: role === 'master' || role === 'approver',   // viewer 제외
    isMaster: role === 'master',
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
