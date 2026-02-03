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
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
  },
  TASK_ASSIGNED: {
    label: t('statusActionRequired'),
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
  },
  WAITING_FOR_INVOICES: {
    label: t('statusWaitingInvoices'),
    bg: 'bg-yellow-50',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
  },
  PENDING_REVIEW: {
    label: t('statusPendingReview'),
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
  },
  APPROVED: {
    label: t('statusApproved'),
    bg: 'bg-green-50',
    text: 'text-green-800',
    border: 'border-green-200',
  },
  READY_TO_SEND: {
    label: t('statusReadyToSend'),
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
  },
  SENT: {
    label: t('statusSent'),
    bg: 'bg-slate-50',
    text: 'text-slate-800',
    border: 'border-slate-200',
  },
};

export const StatusPill: React.FC<StatusPillProps> = ({ status, ariaLabel }) => {
  const config = STATUS_CONFIG[status];

  if (!config) return null;

  return (
    <span
      className={[
        'inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-semibold tracking-wide',
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


