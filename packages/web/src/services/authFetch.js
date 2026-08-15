// packages/web/src/services/authFetch.js
import { useAuthStore } from '../store/authStore.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Authenticated fetch for streamed responses (SSE).
 *
 * The axios `api` client handles auth for JSON calls but cannot consume a
 * ReadableStream in the browser, so the AI chat surfaces stream with raw
 * fetch. This wrapper mirrors the axios request/response interceptors: it
 * attaches the current access token and transparently refreshes + retries
 * once on a 401.
 */
export async function authFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});

  const withToken = (token) => {
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      headers.delete('Authorization');
    }
    return fetch(url, { ...options, headers });
  };

  let response = await withToken(useAuthStore.getState().accessToken);

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await withToken(newToken);
    }
  }

  return response;
}

async function refreshAccessToken() {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) {
      useAuthStore.getState().clearAuth();
      return null;
    }
    const body = await response.json();
    const token = body?.data?.accessToken;
    if (token) {
      useAuthStore.setState({ accessToken: token });
    }
    return token || null;
  } catch {
    return null;
  }
}
