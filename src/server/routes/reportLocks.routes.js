import { Router } from 'express';
import { ensureAuthenticated } from '../auth/session.js';

const router = Router();

/**
 * In-memory report edit locks.
 * Maps reportId -> { userId, userName, lockedAt, lastHeartbeat }
 *
 * A lock expires after 60 seconds without a heartbeat.
 */
const editLocks = new Map();
const LOCK_TIMEOUT_MS = 60_000; // 60 seconds

const isLockValid = (lock) => {
  if (!lock) return false;
  return Date.now() - lock.lastHeartbeat < LOCK_TIMEOUT_MS;
};

const cleanExpiredLocks = () => {
  for (const [reportId, lock] of editLocks.entries()) {
    if (!isLockValid(lock)) {
      editLocks.delete(reportId);
    }
  }
};

// Clean expired locks every 30 seconds
setInterval(cleanExpiredLocks, 30_000);

/**
 * GET /api/report-locks/:reportId
 * Check if a report is currently being edited by someone else.
 */
router.get('/report-locks/:reportId', async (req, res) => {
  const user = await ensureAuthenticated(req, res);
  if (!user) return;

  const { reportId } = req.params;
  const lock = editLocks.get(reportId);

  if (!lock || !isLockValid(lock)) {
    editLocks.delete(reportId);
    return res.json({ locked: false });
  }

  // If it's the same user, it's their own lock
  if (lock.userId === user.id) {
    return res.json({ locked: false, ownLock: true });
  }

  return res.json({
    locked: true,
    lockedBy: {
      userId: lock.userId,
      userName: lock.userName,
      lockedAt: lock.lockedAt,
    },
  });
});

/**
 * POST /api/report-locks/:reportId/acquire
 * Try to acquire an edit lock on a report.
 * Returns success:true if acquired, success:false if locked by another user.
 */
router.post('/report-locks/:reportId/acquire', async (req, res) => {
  const user = await ensureAuthenticated(req, res);
  if (!user) return;

  const { reportId } = req.params;
  const existingLock = editLocks.get(reportId);

  // If there's a valid lock by another user, deny
  if (existingLock && isLockValid(existingLock) && existingLock.userId !== user.id) {
    return res.json({
      success: false,
      lockedBy: {
        userId: existingLock.userId,
        userName: existingLock.userName,
        lockedAt: existingLock.lockedAt,
      },
    });
  }

  // Acquire or refresh the lock
  const now = Date.now();
  editLocks.set(reportId, {
    userId: user.id,
    userName: user.name,
    lockedAt: existingLock?.userId === user.id ? existingLock.lockedAt : new Date(now).toISOString(),
    lastHeartbeat: now,
  });

  return res.json({ success: true });
});

/**
 * POST /api/report-locks/:reportId/heartbeat
 * Extend the lock (keep-alive). Should be called every 30 seconds while editing.
 */
router.post('/report-locks/:reportId/heartbeat', async (req, res) => {
  const user = await ensureAuthenticated(req, res);
  if (!user) return;

  const { reportId } = req.params;
  const lock = editLocks.get(reportId);

  if (!lock || lock.userId !== user.id) {
    return res.json({ success: false, message: 'No active lock for this user' });
  }

  lock.lastHeartbeat = Date.now();
  return res.json({ success: true });
});

/**
 * POST /api/report-locks/:reportId/release
 * Release the edit lock when done editing.
 */
router.post('/report-locks/:reportId/release', async (req, res) => {
  const user = await ensureAuthenticated(req, res);
  if (!user) return;

  const { reportId } = req.params;
  const lock = editLocks.get(reportId);

  if (lock && lock.userId === user.id) {
    editLocks.delete(reportId);
  }

  return res.json({ success: true });
});

export default router;
