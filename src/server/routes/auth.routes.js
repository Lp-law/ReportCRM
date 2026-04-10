import { Router } from 'express';
import { USERS, verifyPassword } from '../auth/users.js';
import { SESSION_COOKIE_NAME, createSessionId, parseCookies, getUserFromRequest } from '../auth/session.js';
import { createSession, deleteSession } from '../postgresStore.js';
import { validate } from '../middleware/validate.js';
import { loginSchema } from '../validation/schemas.js';
import { loginLimiter } from '../middleware/security.js';

const router = Router();

const SESSION_TTL_HOURS = (() => {
  const parsed = Number.parseInt(process.env.SESSION_TTL_HOURS || '12', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
})();

router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = USERS.find((u) => u.username === String(username));
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const passwordValid = await verifyPassword(String(password), user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const sessionId = createSessionId();
    const sessionPayload = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    await createSession(sessionId, sessionPayload, SESSION_TTL_HOURS);
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 1000 * 60 * 60 * SESSION_TTL_HOURS,
    });
    return res.json({ user: sessionPayload });
  } catch (error) {
    console.error('Login error', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
      await deleteSession(sessionId);
    }
    res.cookie(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: new Date(0),
      path: '/',
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('Logout error', error);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

router.get('/me', async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.json({ user });
});

export default router;
