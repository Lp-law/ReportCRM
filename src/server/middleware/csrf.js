import crypto from 'crypto';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generate a CSRF token and set it as a cookie.
 * The client reads the cookie and sends it back as a header.
 */
export const csrfTokenEndpoint = (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Client JS needs to read this
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  });
  res.json({ token });
};

/**
 * Parse cookies from a raw cookie header string.
 */
const parseCookiesForCsrf = (cookieHeader) => {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((part) => {
    const [name, ...rest] = part.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('=') || '');
  });
  return cookies;
};

/**
 * CSRF validation middleware.
 * Skips safe methods (GET, HEAD, OPTIONS).
 * Validates that the X-CSRF-Token header matches the csrf_token cookie.
 */
export const csrfProtection = (req, res, next) => {
  // Safe methods don't need CSRF validation
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookies = parseCookiesForCsrf(req.headers.cookie || '');
  const cookieToken = cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }

  next();
};
