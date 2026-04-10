import crypto from 'crypto';
import { getSessionUser } from '../postgresStore.js';

const SESSION_COOKIE_NAME = 'lp_session';

const createSessionId = () => crypto.randomBytes(32).toString('hex');

const parseCookies = (cookieHeader) => {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  parts.forEach((part) => {
    const [name, ...rest] = part.trim().split('=');
    if (!name) return;
    const value = rest.join('=');
    cookies[name] = decodeURIComponent(value || '');
  });
  return cookies;
};

const getUserFromRequest = async (req) => {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (!sessionId) return null;
    const user = await getSessionUser(sessionId);
    return user || null;
  } catch (error) {
    console.warn('[Auth] Failed to resolve session from request:', error?.message || error);
    return null;
  }
};

const getUserRoleFromRequest = async (req) => {
  const user = await getUserFromRequest(req);
  return user?.role ? String(user.role).toUpperCase() : '';
};

const ensureAuthenticated = async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user;
};

const ensureAdminRole = async (req, res) => {
  // Use the authenticated session and role derived from cookies.
  // This keeps a single source of truth for role checking.
  const user = await ensureAuthenticated(req, res);
  if (!user) return false;
  const role = await getUserRoleFromRequest(req);
  if (role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin role required' });
    return false;
  }
  return true;
};

export {
  SESSION_COOKIE_NAME,
  createSessionId,
  parseCookies,
  getUserFromRequest,
  getUserRoleFromRequest,
  ensureAuthenticated,
  ensureAdminRole,
};
