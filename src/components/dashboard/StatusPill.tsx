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
    bg: 'bg-navySecondary',
    text: 'text-textMuted',
    border: 'border-borderDark',
  },
  TASK_ASSIGNED: {
    label: t('statusActionRequired'),
    bg: 'bg-gold/10',
    text: 'text-goldLight',
    border: 'border-gold',
  },
  WAITING_FOR_INVOICES: {
    label: t('statusWaitingInvoices'),
    bg: 'bg-gold/10',
    text: 'text-goldLight',
    border: 'border-gold',
  },
  PENDING_REVIEW: {
    label: t('statusPendingReview'),
    bg: 'bg-gold/10',
    text: 'text-goldLight',
    border: 'border-gold',
  },
  APPROVED: {
    label: t('statusApproved'),
    bg: 'bg-gold/20',
    text: 'text-goldLight',
    border: 'border-gold',
  },
  READY_TO_SEND: {
    label: t('statusReadyToSend'),
    bg: 'bg-danger/20',
    text: 'text-red-300',
    border: 'border-danger',
  },
  SENT: {
    label: t('statusSent'),
    bg: 'bg-gold/20',
    text: 'text-goldLight',
    border: 'border-gold',
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
