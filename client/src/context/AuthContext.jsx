import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from the httpOnly cookie on first load.
  useEffect(() => {
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (values) => {
    const r = await api.post('/auth/login', values);
    setUser(r.data.data.user);
    return r.data.data.user;
  }, []);

  // Sign-up does NOT log anyone in: it creates an unverified account and emails a 6-digit code.
  const register = useCallback(async (values) => {
    const r = await api.post('/auth/register', values);
    return r.data.data; // { needsVerification, email, expiresInMinutes, resendAfterSeconds }
  }, []);

  // Entering the right code verifies the email and starts the session.
  const verifyEmail = useCallback(async ({ email, code }) => {
    const r = await api.post('/auth/verify-email', { email, code });
    setUser(r.data.data.user);
    return r.data.data.user;
  }, []);

  const resendCode = useCallback(async (email) => {
    const r = await api.post('/auth/resend-code', { email });
    return r.data.data; // { message, resendAfterSeconds }
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, verifyEmail, resendCode, logout }),
    [user, loading, login, register, verifyEmail, resendCode, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
