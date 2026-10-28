// Leave empty locally to use Vite's proxy. Set to the backend origin on Vercel.
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${baseUrl}${path}`;
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(apiUrl(path), options);
  if (response.status === 404) {
    throw new Error('Calendar API not found (404). Check that the backend is deployed and VITE_API_BASE_URL points to it.');
  }
  if (response.ok && !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The calendar API returned a webpage instead of JSON. Check VITE_API_BASE_URL.');
  }
  return response;
}
