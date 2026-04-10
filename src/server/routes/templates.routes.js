import { Router } from 'express';
import { ensureAdminRole } from '../auth/session.js';
import { listSectionTemplates, createSectionTemplate, updateSectionTemplate, deleteSectionTemplate, reorderSectionTemplate } from '../postgresStore.js';
import { validate } from '../middleware/validate.js';
import { createTemplateSchema, updateTemplateSchema, reorderTemplateSchema } from '../validation/schemas.js';

const router = Router();

const sortTemplates = (templates) =>
  templates.sort(
    (a, b) =>
      (a.orderIndex || 0) - (b.orderIndex || 0) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
  );

router.get('/templates', async (req, res) => {
  try {
    const { sectionKey } = req.query || {};
    const templates = await listSectionTemplates(
      sectionKey && typeof sectionKey === 'string' ? sectionKey : undefined,
    );
    res.json(templates);
  } catch (err) {
    console.error('Failed to list templates:', err);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

router.post('/templates', validate(createTemplateSchema), async (req, res) => {
  if (!(await ensureAdminRole(req, res))) return;
  try {
    const { sectionKey, title, body, isEnabled, orderIndex, createdByUserId } = req.body;
    const all = await listSectionTemplates();
    const nowIso = new Date().toISOString();
    const maxOrder = all.reduce(
      (max, t) => (typeof t.orderIndex === 'number' && t.orderIndex > max ? t.orderIndex : max),
      -1,
    );
    const nextOrder = typeof orderIndex === 'number' ? orderIndex : maxOrder + 1;
    const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tpl = {
      id, sectionKey, title, body,
      createdByUserId: createdByUserId || 'system',
      createdAt: nowIso, updatedAt: nowIso,
      isEnabled: isEnabled !== false,
      orderIndex: nextOrder,
    };
    await createSectionTemplate(tpl);
    res.status(201).json(sortTemplates(await listSectionTemplates()));
  } catch (err) {
    console.error('Failed to create template:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/templates/:id', validate(updateTemplateSchema), async (req, res) => {
  if (!(await ensureAdminRole(req, res))) return;
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const all = await listSectionTemplates();
    const idx = all.findIndex((t) => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Template not found' });
    const nowIso = new Date().toISOString();
    const allowedFields = ['sectionKey', 'title', 'body', 'isEnabled', 'orderIndex', 'createdByUserId'];
    const patch = {};
    allowedFields.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(updates, key)) patch[key] = updates[key];
    });
    const dbPatch = {};
    if ('sectionKey' in patch) dbPatch.section_key = patch.sectionKey;
    if ('title' in patch) dbPatch.title = patch.title;
    if ('body' in patch) dbPatch.body = patch.body;
    if ('isEnabled' in patch) dbPatch.is_enabled = patch.isEnabled !== false;
    if ('orderIndex' in patch) dbPatch.order_index = patch.orderIndex;
    if ('createdByUserId' in patch) dbPatch.created_by_user_id = patch.createdByUserId;
    dbPatch.updated_at = nowIso;
    await updateSectionTemplate(id, dbPatch);
    res.json(sortTemplates(await listSectionTemplates()));
  } catch (err) {
    console.error('Failed to update template:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/templates/:id', async (req, res) => {
  if (!(await ensureAdminRole(req, res))) return;
  try {
    await deleteSectionTemplate(req.params.id);
    res.json(sortTemplates(await listSectionTemplates()));
  } catch (err) {
    console.error('Failed to delete template:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

router.post('/templates/:id/reorder', validate(reorderTemplateSchema), async (req, res) => {
  if (!(await ensureAdminRole(req, res))) return;
  try {
    const { id } = req.params;
    const { direction } = req.body || {};
    if (direction !== 'UP' && direction !== 'DOWN') {
      return res.status(400).json({ error: 'direction must be UP or DOWN' });
    }
    await reorderSectionTemplate(id, direction);
    res.json(sortTemplates(await listSectionTemplates()));
  } catch (err) {
    console.error('Failed to reorder template:', err);
    res.status(500).json({ error: 'Failed to reorder template' });
  }
});

export default router;
