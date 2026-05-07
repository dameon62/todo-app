const BASE = '/api';
const CT = { 'Content-Type': 'application/json' };

let _uid = null;
export const setUserId   = (id) => { _uid = id; };
export const clearUserId = ()   => { _uid = null; };

const h = () => _uid ? { ...CT, 'X-User-Id': String(_uid) } : CT;

// Throw on non-OK so callers can react instead of silently storing
// `{ error: '...' }` objects in component state.
const j = async (r) => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error || `HTTP ${r.status}`);
    err.status = r.status;
    err.body = data;
    throw err;
  }
  return data;
};

const req = (method, url, data) =>
  fetch(url, { method, headers: h(), body: data !== undefined ? JSON.stringify(data) : undefined }).then(j);

const get = (url) => fetch(url, { headers: h() }).then(j);

// Board & archive
export const getBoard   = () => get(`${BASE}/board`);
export const getArchive = () => get(`${BASE}/archive`);

// Tags
export const getTags    = () => get(`${BASE}/tags`);
export const addTag     = (name)              => req('POST',   `${BASE}/tags`, { name });
export const renameTag  = (name, newName)     => req('PATCH',  `${BASE}/tags/${encodeURIComponent(name)}`, { newName });
export const deleteTag  = (name)              => req('DELETE', `${BASE}/tags/${encodeURIComponent(name)}`);

// Tasks
export const createTask = (task)              => req('POST',   `${BASE}/tasks`, task);
export const patchTask  = (id, data)          => req('PATCH',  `${BASE}/tasks/${encodeURIComponent(id)}`, data);

// Settings
export const getTheme   = () => get(`${BASE}/settings/theme`).then(d => d.value);
export const setTheme   = (value)             => req('PUT',    `${BASE}/settings/theme`, { value });

// Auth (no user header needed)
export const getUsers      = ()                   => fetch(`${BASE}/auth/users`).then(j);
export const login         = (username, password) => req('POST',   `${BASE}/auth/login`,    { username, password });
export const signup        = (username, password) => req('POST',   `${BASE}/auth/signup`,   { username, password });
export const deleteAccount = ()                   => req('DELETE', `${BASE}/auth/account`);
