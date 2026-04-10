import { Router } from 'express';
import { ensureAuthenticated } from '../auth/session.js';
import { listReports, getReport, upsertReport, softDeleteReport, bulkImportReports, listCaseFolders, upsertCaseFolder } from '../postgresStore.js';

const router = Router();

router.get('/reports', async (req, res) => {
  const user = await ensureAuthenticated(req, res);
  if (!user) return;
  try {
    const { status, odakanitNo, includeDeleted } = req.query || {};
    const role = String(user.role).toUpperCase();
    const createdBy = (role === 'ADMIN' || role === 'SUB_ADMIN') ? undefined : user.id;
    const reports = await listReports({
      createdBy,
      status: status || undefined,
      odakanitNo: odakanitNo || undefined,
      includeDeleted: includeDeleted === 'true',
    });
    res.json({ reports });
  } catch (err) {
    console.error('Failed to list reports:', err);
    res.status(500).json({ error: 'Failed to load reports' });
  }
});

router.get('/reports/:id', async (req, res) => {
  if (!(await ensureAuthenticated(req, res))) return;
  try {
    const report = await getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ report });
  } catch (err) {
    console.error('Failed to get report:', err);
    res.status(500).json({ error: 'Failed to load report' });
  }
});

router.post('/reports', async (req, res) => {
  const user = await ensureAuthenticated(req, res);
  if (!user) return;
  try {
    const reportData = req.body;
    if (!reportData || !reportData.id) {
      return res.status(400).json({ error: 'Report data with id is required' });
    }
    reportData.updatedAt = new Date().toISOString();
    await upsertReport(reportData);
    res.status(201).json({ success: true, id: reportData.id });
  } catch (err) {
    console.error('Failed to create report:', err);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

router.put('/reports/:id', async (req, res) => {
  const user = await ensureAuthenticated(req, res);
  if (!user) return;
  try {
    const reportData = req.body;
    if (!reportData) {
      return res.status(400).json({ error: 'Report data is required' });
    }
    reportData.id = req.params.id;
    reportData.updatedAt = new Date().toISOString();
    await upsertReport(reportData);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update report:', err);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

router.delete('/reports/:id', async (req, res) => {
  const user = await ensureAuthenticated(req, res);
  if (!user) return;
  try {
    await softDeleteReport(req.params.id, user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete report:', err);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

router.post('/reports/bulk-import', async (req, res) => {
  const user = await ensureAuthenticated(req, res);
  if (!user) return;
  const role = String(user.role).toUpperCase();
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin role required for bulk import' });
  }
  try {
    const { reports } = req.body || {};
    if (!Array.isArray(reports)) {
      return res.status(400).json({ error: 'reports array is required' });
    }
    const count = await bulkImportReports(reports);
    res.json({ success: true, imported: count });
  } catch (err) {
    console.error('Failed to bulk import reports:', err);
    res.status(500).json({ error: 'Failed to import reports' });
  }
});

// --- Case Folders ---

router.get('/case-folders', async (req, res) => {
  if (!(await ensureAuthenticated(req, res))) return;
  try {
    const folders = await listCaseFolders();
    res.json({ folders });
  } catch (err) {
    console.error('Failed to list case folders:', err);
    res.status(500).json({ error: 'Failed to load case folders' });
  }
});

router.put('/case-folders/:odakanitNo', async (req, res) => {
  if (!(await ensureAuthenticated(req, res))) return;
  try {
    const folderData = req.body;
    if (!folderData) {
      return res.status(400).json({ error: 'Folder data is required' });
    }
    await upsertCaseFolder(req.params.odakanitNo, folderData);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to upsert case folder:', err);
    res.status(500).json({ error: 'Failed to save case folder' });
  }
});

export default router;
