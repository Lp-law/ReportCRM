import React from 'react';
import type { ReportStatus } from '../../types';
import { t } from './i18n';

interface StatusPillProps {
  status: ReportStatus;
  ariaLabel?: string;
}

const STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  DRAFT: {
    label: t('statusDraft'),
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
  },
  TASK_ASSIGNED: {
    label: t('statusActionRequired'),
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-300',
  },
  WAITING_FOR_INVOICES: {
    label: t('statusWaitingInvoices'),
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-300',
  },
  PENDING_REVIEW: {
    label: t('statusPendingReview'),
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-300',
  },
  APPROVED: {
    label: t('statusApproved'),
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
  },
  READY_TO_SEND: {
    label: t('statusReadyToSend'),
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
  },
  SENT: {
    label: t('statusSent'),
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-300',
  },
};

export const StatusPill: React.FC<StatusPillProps> = ({ status, ariaLabel }) => {
  const config = STATUS_CONFIG[status];

  if (!config) return null;

  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide',
        config.bg,
        config.text,
        config.border,
      ].join(' ')}
      aria-label={ariaLabel || `סטטוס: ${config.label}`}
    >
      <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {config.label}
    </span>
  );
};

export default StatusPill;
