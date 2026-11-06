import { useCallback, useEffect, useState } from 'react';
import { authRequest } from '../lib/api.js';
import { readStoredToken, storeToken, tokenExpiry } from '../lib/session.js';

export function useAuth() {
  const [token, setToken] = useState(readStoredToken);
  const [user, setUser] = useState(null);
  const [restoreError, setRestoreError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);

  const logout = useCallback((message = '') => {
    storeToken(null);
    setToken(null);
    setUser(null);
    setRestoreError('');
    setNotice(message);
  }, []);

  useEffect(() => {
    if (!token || user) return;
    const controller = new AbortController();
    setRestoreError('');

    authRequest('me', { token, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setUser(data.user);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) logout('Your session has expired. Please log in again.');
        else setRestoreError(error.message);
      });

    return () => controller.abort();
  }, [token, user, retry, logout]);

  useEffect(() => {
    if (!token || !user) return;
    // The API verifies identity; decoding here only schedules the expiry notice.
    const timer = setTimeout(() => logout('Your session has expired. Please log in again.'),
      Math.max(0, tokenExpiry(token) - Date.now()));
    return () => clearTimeout(timer);
  }, [token, user, logout]);

  function signIn({ token: nextToken, user: nextUser }) {
    storeToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setRestoreError('');
    setNotice('');
  }

  return { user, checking: Boolean(token && !user), restoreError, notice, signIn, logout,
    retrySession: () => setRetry((value) => value + 1) };
}
