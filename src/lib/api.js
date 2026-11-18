const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
export async function requestApi(path, { token, method = 'GET', body, signal } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method, credentials: 'include', signal: signal || AbortSignal.timeout(30000),
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Session-Token': token } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw Object.assign(new Error(data?.error || `Request failed (${response.status}).`), { status: response.status });
  if (!data) throw new Error('The API returned an unexpected response. Check that the backend is running.');
  return data;
}
export function downloadJson(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const evidenceLabel = score => score >= 75 ? 'Strong evidence' : score >= 45 ? 'Related evidence' : 'Needs review';
