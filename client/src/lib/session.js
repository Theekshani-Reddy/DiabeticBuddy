const tokenKey = 'sweety.token';

export function readStoredToken() {
  try {
    return sessionStorage.getItem(tokenKey);
  } catch {
    return null;
  }
}

export function storeToken(token) {
  try {
    if (token) sessionStorage.setItem(tokenKey, token);
    else sessionStorage.removeItem(tokenKey);
  } catch {
    // Login still works in memory when browser storage is unavailable.
  }
}

export function tokenExpiry(token) {
  try {
    const payload = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}
