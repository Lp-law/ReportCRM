import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

describe('Tone & Risk API role enforcement', () => {
  const sampleContent = { Update: 'טקסט בדיקה לבדיקת Tone & Risk.' };

  it('allows ADMIN to analyze tone & risk', async () => {
    const res = await request(app)
      .post('/api/analyze-tone-risk')
      .set('Content-Type', 'application/json')
      .set('x-user-role', 'ADMIN')
      .send({ content: sampleContent });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('runAt');
    expect(res.body).toHaveProperty('issues');
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('allows LAWYER to analyze tone & risk', async () => {
    const res = await request(app)
      .post('/api/analyze-tone-risk')
      .set('Content-Type', 'application/json')
      .set('x-user-role', 'LAWYER')
      .send({ content: sampleContent });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('runAt');
    expect(res.body).toHaveProperty('issues');
  });

  it('rejects FINANCE without permission', async () => {
    const res = await request(app)
      .post('/api/analyze-tone-risk')
      .set('Content-Type', 'application/json')
      .set('x-user-role', 'FINANCE')
      .send({ content: sampleContent });

    expect(res.status).toBe(403);
  });

  it('rejects missing role header', async () => {
    const res = await request(app)
      .post('/api/analyze-tone-risk')
      .set('Content-Type', 'application/json')
      .send({ content: sampleContent });

    expect(res.status).toBe(403);
  });
});


