const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

let key = '';
try { key = sessionStorage.getItem('adminKey') || ''; } catch { /* storage blocked: stay logged out on refresh */ }

export const hasKey = () => !!key;
export function setKey(k) {
  key = k;
  try { k ? sessionStorage.setItem('adminKey', k) : sessionStorage.removeItem('adminKey'); } catch { /* ignore */ }
}

// Set by App so a 401 anywhere sends the organiser back to the login screen
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check your internet and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/session') onUnauthorized();
    const err = new Error(data.error || 'Something went wrong');
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

export const api = {
  session: () => request('/api/session'),
  stats: () => request('/api/stats'),
  search: (q) => request('/api/participants/search?q=' + encodeURIComponent(q)),
  participants: () => request('/api/participants'),
  day: (date) => request('/api/raffles/day?date=' + date),
  addEntry: (payload) => request('/api/entries', { method: 'POST', body: payload }),
  removeEntry: (id) => request('/api/entries/' + id, { method: 'DELETE' }),
  draw: (payload) => request('/api/raffles/draw', { method: 'POST', body: payload }),
  history: () => request('/api/raffles/history'),
};

