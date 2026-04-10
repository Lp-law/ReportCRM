import { Router } from 'express';
import { ensureAdminRole } from '../auth/session.js';
import { listBestPractices, createBestPractice, updateBestPractice, deleteBestPractice, reorderBestPractice } from '../postgresStore.js';
import { validate } from '../middleware/validate.js';
import { createBestPracticeSchema, updateBestPracticeSchema, reorderBestPracticeSchema, recordUsageSchema } from '../validation/schemas.js';

const router = Router();

const sortPractices = (practices) =>
  practices.sort(
    (a, b) =>
      (a.orderIndex || 0) - (b.orderIndex || 0) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
  );

router.get('/best-practices', async (req, res) => {
  try {
    const { sectionKey } = req.query || {};
    const practices = await listBestPractices(
      sectionKey && typeof sectionKey === 'string' ? sectionKey : undefined,
    );
    res.json(practices);
  } catch (err) {
    console.error('Failed to list best practices:', err);
    res.status(500).json({ error: 'Failed to load best practices' });
  }
});

router.post('/best-practices', validate(createBestPracticeSchema), async (req, res) => {
  if (!(await ensureAdminRole(req, res))) return;
  try {
    const { sectionKey, title, body, label, tags, behavior, isEnabled, createdByUserId } = req.body;
    const all = await listBestPractices();
    const nowIso = new Date().toISOString();
    const maxOrder = all.reduce(
      (max, t) => (typeof t.orderIndex === 'number' && t.orderIndex > max ? t.orderIndex : max),
      -1,
    );
    const nextOrder = maxOrder + 1;
    const id = `bp-${sectionKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snippet = {
      id, sectionKey, title, body,
      label: label || 'BEST_PRACTICE',
      tags: Array.isArray(tags) ? tags : [],
      isEnabled: isEnabled !== false,
      createdByUserId: createdByUserId || 'system',
      createdAt: nowIso, updatedAt: nowIso,
      usageCount: 0, lastUsedAt: null,
      behavior: behavior || 'INSERTABLE',
      sourceReportId: undefined,
      orderIndex: nextOrder,
    };
    await createBestPractice(snippet);
    res.status(201).json(sortPractices(await listBestPractices()));
  } catch (err) {
    console.error('Failed to create best practice:', err);
    res.status(500).json({ error: 'Failed to create best practice' });
  }
});

router.put('/best-practices/:id', validate(updateBestPracticeSchema), async (req, res) => {
  if (!(await ensureAdminRole(req, res))) return;
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const all = await listBestPractices();
    const idx = all.findIndex((t) => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Best practice not found' });
    const nowIso = new Date().toISOString();
    const allowedFields = ['sectionKey', 'title', 'body', 'label', 'tags', 'isEnabled', 'behavior', 'createdByUserId'];
    const dbPatch = {};
    allowedFields.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(updates, key)) return;
      const v = updates[key];
      if (key === 'sectionKey') dbPatch.section_key = v;
      else if (key === 'isEnabled') dbPatch.is_enabled = v !== false;
      else if (key === 'tags') dbPatch.tags = JSON.stringify(Array.isArray(v) ? v : []);
      else if (key === 'createdByUserId') dbPatch.created_by_user_id = v;
      else dbPatch[key] = v;
    });
    dbPatch.updated_at = nowIso;
    await updateBestPractice(id, dbPatch);
    res.json(sortPractices(await listBestPractices()));
  } catch (err) {
    console.error('Failed to update best practice:', err);
    res.status(500).json({ error: 'Failed to update best practice' });
  }
});

router.delete('/best-practices/:id', async (req, res) => {
  if (!(await ensureAdminRole(req, res))) return;
  try {
    await deleteBestPractice(req.params.id);
    res.json(sortPractices(await listBestPractices()));
  } catch (err) {
    console.error('Failed to delete best practice:', err);
    res.status(500).json({ error: 'Failed to delete best practice' });
  }
});

router.post('/best-practices/:id/reorder', validate(reorderBestPracticeSchema), async (req, res) => {
  if (!(await ensureAdminRole(req, res))) return;
  try {
    const { id } = req.params;
    const { direction } = req.body || {};
    if (direction !== 'UP' && direction !== 'DOWN') {
      return res.status(400).json({ error: 'direction must be UP or DOWN' });
    }
    await reorderBestPractice(id, direction);
    res.json(sortPractices(await listBestPractices()));
  } catch (err) {
    console.error('Failed to reorder best practice:', err);
    res.status(500).json({ error: 'Failed to reorder best practice' });
  }
});

router.post('/best-practices/:id/usage', validate(recordUsageSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const nowIso = new Date().toISOString();
    const all = await listBestPractices();
    const existing = all.find((bp) => bp.id === id);
    if (!existing) return res.status(404).json({ error: 'Best practice not found' });
    const newCount = (existing.usageCount || 0) + 1;
    await updateBestPractice(id, { usage_count: newCount, last_used_at: nowIso });
    const next = await listBestPractices();
    const updated = next.find((bp) => bp.id === id);
    res.json(updated || existing);
  } catch (err) {
    console.error('Failed to record best practice usage:', err);
    res.status(500).json({ error: 'Failed to record best practice usage' });
  }
});

export default router;
