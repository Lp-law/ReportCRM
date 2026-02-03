import React from 'react';
import { FolderOpen, AlertTriangle, Clock, Send, FileSpreadsheet } from 'lucide-react';
import { t } from './i18n';

type StatFilterId = 'ACTIVE' | 'ACTION' | 'WAITING' | 'DRAFTS' | 'FINANCE' | null;

interface DashboardStatsProps {
  activeCases: number;
  actionRequired: number;
  waitingOnOthers: number;
  draftsAndReady: number;
  financeTasks: number;
  selectedFilter: StatFilterId;
  onChangeFilter?: (id: StatFilterId) => void;
}

const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  accentClass: string;
  selected?: boolean;
  onClick?: () => void;
}> = ({ label, value, icon, accentClass, selected, onClick }) => {
  const content = (
    <div
      className={[
        'flex items-center justify-between rounded-2xl border px-4 py-3 shadow-sm transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2',
        selected
          ? 'border-gold bg-gold/10'
          : 'border-borderDark bg-panel hover:bg-navySecondary',
      ].join(' ')}
    >
      <div>
        <p
          className={[
            'text-[11px] uppercase tracking-wide',
            selected ? 'font-bold text-textLight' : 'font-semibold text-textMuted',
          ].join(' ')}
        >
          {label}
        </p>
        <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
      </div>
      <div
        className={[
          'inline-flex h-9 w-9 items-center justify-center rounded-full',
          accentClass,
        ].join(' ')}
        aria-hidden="true"
      >
        {icon}
      </div>
    </div>
  );

  if (!onClick) return content;

  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      {content}
    </button>
  );
};

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  activeCases: _activeCases,
  actionRequired: _actionRequired,
  waitingOnOthers,
  draftsAndReady,
  financeTasks,
  selectedFilter,
  onChangeFilter,
}) => {
  const handleClick = (id: StatFilterId) => {
    if (!onChangeFilter) return;
    onChangeFilter(selectedFilter === id ? null : id);
  };

  return (
    <section
      aria-label={t('statsSectionLabel')}
      className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3"
    >
      <StatCard
        label={t('statsFinanceTasks')}
        value={financeTasks}
        icon={<FileSpreadsheet className="h-4 w-4 text-goldLight" />}
        accentClass="bg-gold/20"
        selected={selectedFilter === 'FINANCE'}
        onClick={() => handleClick('FINANCE')}
      />
      <StatCard
        label={t('statsWaitingOnOthers')}
        value={waitingOnOthers}
        icon={<Clock className="h-4 w-4 text-goldLight" />}
        accentClass="bg-gold/20"
        selected={selectedFilter === 'WAITING'}
        onClick={() => handleClick('WAITING')}
      />
      <StatCard
        label={t('statsDraftsReady')}
        value={draftsAndReady}
        icon={<Send className="h-4 w-4 text-goldLight" />}
        accentClass="bg-gold/20"
        selected={selectedFilter === 'DRAFTS'}
        onClick={() => handleClick('DRAFTS')}
      />
    </section>
  );
};

export default DashboardStats;


