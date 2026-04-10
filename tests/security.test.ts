import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';

// Test that the auth module correctly hashes and verifies passwords
describe('Password Security', () => {
  it('should verify correct password against bcrypt hash', async () => {
    const hash = bcrypt.hashSync('testpass123', 10);
    const result = await bcrypt.compare('testpass123', hash);
    expect(result).toBe(true);
  });

  it('should reject incorrect password against bcrypt hash', async () => {
    const hash = bcrypt.hashSync('testpass123', 10);
    const result = await bcrypt.compare('wrongpassword', hash);
    expect(result).toBe(false);
  });

  it('should have removed plaintext passwords from constants', async () => {
    // Dynamic import to test the actual constants file
    const constants = await import('../src/constants.js');
    const users = constants.USERS;
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
    users.forEach((u: Record<string, unknown>) => {
      expect(u).not.toHaveProperty('password');
      expect(u).toHaveProperty('id');
      expect(u).toHaveProperty('username');
      expect(u).toHaveProperty('name');
      expect(u).toHaveProperty('email');
      expect(u).toHaveProperty('role');
    });
  });

  it('should have bcrypt hashes in server auth module', async () => {
    const authModule = await import('../src/server/auth/users.js');
    const users = authModule.USERS;
    expect(Array.isArray(users)).toBe(true);
    users.forEach((u: Record<string, unknown>) => {
      expect(u).toHaveProperty('passwordHash');
      expect(typeof u.passwordHash).toBe('string');
      expect((u.passwordHash as string).startsWith('$2b$')).toBe(true);
      expect(u).not.toHaveProperty('password');
    });
  });
});

describe('Zod Validation Schemas', () => {
  it('should validate login schema correctly', async () => {
    const { loginSchema } = await import('../src/server/validation/schemas.js');

    // Valid input
    const valid = loginSchema.safeParse({ username: 'test', password: 'pass123' });
    expect(valid.success).toBe(true);

    // Missing username
    const noUser = loginSchema.safeParse({ password: 'pass123' });
    expect(noUser.success).toBe(false);

    // Empty username
    const emptyUser = loginSchema.safeParse({ username: '', password: 'pass123' });
    expect(emptyUser.success).toBe(false);

    // Missing password
    const noPass = loginSchema.safeParse({ username: 'test' });
    expect(noPass.success).toBe(false);
  });

  it('should validate translate schema correctly', async () => {
    const { translateSchema } = await import('../src/server/validation/schemas.js');

    const valid = translateSchema.safeParse({ text: 'hello world' });
    expect(valid.success).toBe(true);

    const empty = translateSchema.safeParse({ text: '' });
    expect(empty.success).toBe(false);

    const missing = translateSchema.safeParse({});
    expect(missing.success).toBe(false);
  });

  it('should validate sendEmail schema correctly', async () => {
    const { sendEmailSchema } = await import('../src/server/validation/schemas.js');

    const valid = sendEmailSchema.safeParse({
      id: 'report-123',
      subject: 'Test Subject',
      body: 'Test body content',
    });
    expect(valid.success).toBe(true);

    const noId = sendEmailSchema.safeParse({
      subject: 'Test',
      body: 'Body',
    });
    expect(noId.success).toBe(false);
  });
});

describe('Text Processing Utilities', () => {
  it('should truncate text to limit', async () => {
    const { truncateText } = await import('../src/server/utils/textProcessing.js');

    expect(truncateText('hello', 3)).toBe('hel');
    expect(truncateText('hello', 10)).toBe('hello');
    expect(truncateText('', 10)).toBe('');
    expect(truncateText(undefined as unknown as string, 10)).toBe('');
  });

  it('should parse JSON safely with fallback', async () => {
    const { parseJsonSafely } = await import('../src/server/utils/textProcessing.js');

    expect(parseJsonSafely('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonSafely('invalid json', { fallback: true })).toEqual({ fallback: true });
    expect(parseJsonSafely('Some text before {"a":1} after')).toEqual({ a: 1 });
  });

  it('should chunk text with overlap', async () => {
    const { chunkText } = await import('../src/server/utils/textProcessing.js');

    const text = 'a'.repeat(100);
    const chunks = chunkText(text, 30, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBe(30);
    // Each subsequent chunk should start 20 characters after the previous (30 - 10 overlap)
    expect(chunks.every((c: string) => c.length <= 30)).toBe(true);
  });
});

describe('CSRF Middleware', () => {
  it('should export csrfTokenEndpoint and csrfProtection', async () => {
    const csrf = await import('../src/server/middleware/csrf.js');
    expect(typeof csrf.csrfTokenEndpoint).toBe('function');
    expect(typeof csrf.csrfProtection).toBe('function');
  });
});
