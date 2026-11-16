const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
let accessToken = null;

export function setAccessToken(token) { accessToken = token; }

export async function postAuth(path, body) {
  let response;
  try {
    response = await fetch(`${apiBase}/auth/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach PizzaHop. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Something went wrong. Please try again.');
  return data;
}

export async function authRequest(path, { method = 'GET', body, token = accessToken } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method, credentials: 'include',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Something went wrong. Please try again.');
  if (data.accessToken) setAccessToken(data.accessToken);
  return data;
}
