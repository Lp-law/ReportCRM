type BlockedEditEvent = {
  reason: string;
  reportId?: string;
  odakanitNo?: string;
  role?: string;
  status?: string;
  lockType?: string;
};

const blockedEditLastLoggedAt = new Map<string, number>();
const BLOCK_WINDOW_MS = 60 * 1000;

export function logBlockedEdit(event: BlockedEditEvent): void {
  const key = `${event.reason}::${event.reportId ?? 'unknown'}`;
  const now = Date.now();
  const last = blockedEditLastLoggedAt.get(key) ?? 0;
  if (now - last < BLOCK_WINDOW_MS) {
    return;
  }
  blockedEditLastLoggedAt.set(key, now);
  // Minimal, local-only telemetry to help detect UX leaks around locking.
  // Intentionally using console.info (not error/warn) to avoid noisy logs.
  // eslint-disable-next-line no-console
  console.info('[blocked-edit]', event);
}


