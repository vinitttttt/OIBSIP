const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

export async function postAuth(path, body) {
  let response;
  try {
    response = await fetch(`${apiBase}/auth/${path}`, {
      method: 'POST',
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
