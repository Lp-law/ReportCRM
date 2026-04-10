import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

export const helmetMiddleware = helmet({ contentSecurityPolicy: false });

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
