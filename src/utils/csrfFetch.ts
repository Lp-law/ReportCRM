/**
 * CSRF-aware fetch wrapper.
 * Automatically fetches a CSRF token on first use and includes it
 * in the X-CSRF-Token header for all state-changing requests.
 */

let csrfToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

const getCsrfToken = async (): Promise<string> => {
  if (csrfToken) return csrfToken;
  if (tokenPromise) return tokenPromise;

  tokenPromise = fetch('/api/csrf-token', { credentials: 'include' })
    .then((res) => res.json())
    .then((data) => {
      csrfToken = data.token;
      tokenPromise = null;
      return csrfToken!;
    })
    .catch(() => {
      tokenPromise = null;
      return '';
    });

  return tokenPromise;
};

/**
 * Wrapper around fetch that automatically includes CSRF token
 * for POST, PUT, DELETE, and PATCH requests.
 */
export const csrfFetch = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  const method = (options.method || 'GET').toUpperCase();
  const needsCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

  if (needsCsrf) {
    const token = await getCsrfToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('X-CSRF-Token', token);
    options.headers = headers;
  }

  // Always include credentials
  options.credentials = options.credentials || 'include';

  const response = await fetch(url, options);

  // If CSRF validation fails, refresh token and retry once
  if (response.status === 403 && needsCsrf) {
    csrfToken = null;
    const token = await getCsrfToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('X-CSRF-Token', token);
    options.headers = headers;
    return fetch(url, options);
  }

  return response;
};

/** Reset the cached token (e.g., after logout) */
export const resetCsrfToken = () => {
  csrfToken = null;
  tokenPromise = null;
};
