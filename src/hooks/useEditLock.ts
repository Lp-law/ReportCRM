import { useState, useEffect, useCallback, useRef } from 'react';
import { csrfFetch } from '../utils/csrfFetch';

interface LockInfo {
  locked: boolean;
  lockedBy?: {
    userId: string;
    userName: string;
    lockedAt: string;
  };
}

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Hook that manages edit locks for reports.
 * When a report is opened for editing, it acquires a lock.
 * Sends heartbeats every 30s to keep the lock alive.
 * Shows a warning if another user is editing the same report.
 */
export const useEditLock = (reportId: string | null, userId: string | null) => {
  const [lockInfo, setLockInfo] = useState<LockInfo>({ locked: false });
  const [hasLock, setHasLock] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const acquireLock = useCallback(async () => {
    if (!reportId || !userId) return;
    try {
      const res = await csrfFetch(`/api/report-locks/${reportId}/acquire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setHasLock(true);
        setLockInfo({ locked: false });
      } else {
        setHasLock(false);
        setLockInfo({ locked: true, lockedBy: data.lockedBy });
      }
    } catch {
      // If the server is down, allow editing (offline mode)
      setHasLock(true);
      setLockInfo({ locked: false });
    }
  }, [reportId, userId]);

  const releaseLock = useCallback(async () => {
    if (!reportId) return;
    try {
      await csrfFetch(`/api/report-locks/${reportId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch { /* ignore */ }
    setHasLock(false);
  }, [reportId]);

  const sendHeartbeat = useCallback(async () => {
    if (!reportId || !hasLock) return;
    try {
      await csrfFetch(`/api/report-locks/${reportId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch { /* ignore */ }
  }, [reportId, hasLock]);

  // Acquire lock when reportId changes
  useEffect(() => {
    if (!reportId || !userId) return;
    acquireLock();
    return () => {
      releaseLock();
    };
  }, [reportId, userId, acquireLock, releaseLock]);

  // Heartbeat to keep lock alive
  useEffect(() => {
    if (!hasLock || !reportId) return;
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [hasLock, reportId, sendHeartbeat]);

  // Release lock on page unload
  useEffect(() => {
    if (!hasLock || !reportId) return;
    const handleUnload = () => {
      // Use sendBeacon for reliable delivery during page unload
      navigator.sendBeacon?.(`/api/report-locks/${reportId}/release`);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [hasLock, reportId]);

  return {
    lockInfo,
    hasLock,
    acquireLock,
    releaseLock,
  };
};
