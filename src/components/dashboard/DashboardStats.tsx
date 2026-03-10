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
        'flex items-center justify-between rounded-2xl border px-5 py-4 shadow-sm transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2',
        selected
          ? 'border-amber-300 bg-amber-50'
          : 'border-slate-200 bg-white hover:bg-slate-50',
      ].join(' ')}
    >
      <div>
        <p
          className={[
            'text-xs uppercase tracking-wide md:text-sm',
            selected ? 'font-bold text-slate-900' : 'font-semibold text-slate-600',
          ].join(' ')}
        >
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">{value}</p>
      </div>
      <div
        className={[
          'inline-flex h-10 w-10 items-center justify-center rounded-full md:h-11 md:w-11',
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
      className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3"
    >
      <p className="col-span-full mb-0 text-sm text-slate-600">
        {t('statsSecondaryHint')}
      </p>
      <StatCard
        label={t('statsFinanceTasks')}
        value={financeTasks}
        icon={<FileSpreadsheet className="h-5 w-5 text-amber-700" />}
        accentClass="bg-amber-100"
        selected={selectedFilter === 'FINANCE'}
        onClick={() => handleClick('FINANCE')}
      />
      <StatCard
        label={t('statsWaitingOnOthers')}
        value={waitingOnOthers}
        icon={<Clock className="h-5 w-5 text-amber-700" />}
        accentClass="bg-amber-100"
        selected={selectedFilter === 'WAITING'}
        onClick={() => handleClick('WAITING')}
      />
      <StatCard
        label={t('statsDraftsReady')}
        value={draftsAndReady}
        icon={<Send className="h-5 w-5 text-amber-700" />}
        accentClass="bg-amber-100"
        selected={selectedFilter === 'DRAFTS'}
        onClick={() => handleClick('DRAFTS')}
      />
    </section>
  );
};

export default DashboardStats;


