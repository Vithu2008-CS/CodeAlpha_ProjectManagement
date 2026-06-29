// ------------------------------------------------------------------
//  Tiny REST client + auth/token helpers (shared by every page).
//  JWT lives in localStorage; a 401 anywhere bounces back to login.
// ------------------------------------------------------------------

const TOKEN_KEY = 'pm_token';
const USER_KEY = 'pm_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function logout() {
  clearSession();
  window.location.href = '/login.html';
}

// Redirect to login if there's no token. Returns true when authenticated.
export function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

// Core fetch wrapper. Adds the Bearer token, parses JSON, throws on !ok,
// and transparently logs the user out on 401.
export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Network error — is the server running?');
  }

  const data = await res.json().catch(() => ({}));

  // A 401 on an *authenticated* request means our token went stale — log out
  // and bounce to login. A 401 while signing in (no token) is just bad
  // credentials, so let the real server message ("Invalid credentials") show.
  if (res.status === 401 && token) {
    clearSession();
    if (!location.pathname.endsWith('/login.html')) {
      location.href = '/login.html';
    }
    throw new Error('Your session expired. Please log in again.');
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// Convenience verbs.
export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });
