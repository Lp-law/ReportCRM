import nodemailer from 'nodemailer';

// Initialize Email Transporter — Office365 SMTP (explicit; do not use service: 'outlook')
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false, // required for port 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Outlook App Password
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
  },
});

function maskForLog(s) {
  if (typeof s !== 'string' || s.length < 4) return '***';
  return s.slice(0, 2) + '***' + s.slice(-2);
}

console.log('[MAIL] Transport created', { host: 'smtp.office365.com', user: maskForLog(process.env.EMAIL_USER || '') });

// --- Mail mode & recipients (ENV-only, single source of truth) ---
const MAIL_MODE = (process.env.MAIL_MODE || 'SANDBOX').trim().toUpperCase();
const VALID_MODES = ['SANDBOX', 'PROD'];

// In-memory soft lock: reportId -> last successful send timestamp (for duplicate-send guard)
const lastSendByReportId = new Map();

function getEmailRecipients() {
  const mode = VALID_MODES.includes(MAIL_MODE) ? MAIL_MODE : 'SANDBOX';
  const parseList = (raw) => (raw ? raw.split(',').map((e) => e.trim()).filter(Boolean) : []);
  if (mode === 'SANDBOX') {
    const toRaw = process.env.MAIL_TO_SANDBOX?.trim();
    const to = parseList(toRaw);
    const cc = parseList(process.env.MAIL_CC_SANDBOX?.trim());
    if (!to.length) {
      throw new Error('MAIL_MODE=SANDBOX requires MAIL_TO_SANDBOX to be set');
    }
    return { to, cc };
  }
  if (mode === 'PROD') {
    const toRaw = process.env.MAIL_TO_PROD?.trim();
    const to = parseList(toRaw);
    const cc = parseList(process.env.MAIL_CC_PROD?.trim());
    if (!to.length) {
      throw new Error('MAIL_MODE=PROD requires MAIL_TO_PROD to be set');
    }
    return { to, cc };
  }
  throw new Error(`Invalid MAIL_MODE: ${MAIL_MODE}. Use SANDBOX or PROD.`);
}

export {
  transporter,
  maskForLog,
  MAIL_MODE,
  lastSendByReportId,
  getEmailRecipients,
};
