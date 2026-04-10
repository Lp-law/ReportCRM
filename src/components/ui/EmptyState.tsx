import React from 'react';
import { FileText, Search, FolderOpen, Inbox } from 'lucide-react';

type EmptyStateVariant = 'reports' | 'search' | 'folder' | 'general';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const VARIANT_CONFIG: Record<EmptyStateVariant, { icon: React.ReactNode; defaultTitle: string; defaultDesc: string }> = {
  reports: {
    icon: <FileText className="w-10 h-10 text-gold/40" />,
    defaultTitle: 'No reports yet',
    defaultDesc: 'Create your first report to get started.',
  },
  search: {
    icon: <Search className="w-10 h-10 text-gold/40" />,
    defaultTitle: 'No results found',
    defaultDesc: 'Try adjusting your search terms.',
  },
  folder: {
    icon: <FolderOpen className="w-10 h-10 text-gold/40" />,
    defaultTitle: 'This folder is empty',
    defaultDesc: 'Reports assigned to this case will appear here.',
  },
  general: {
    icon: <Inbox className="w-10 h-10 text-gold/40" />,
    defaultTitle: 'Nothing here',
    defaultDesc: 'There is no content to display.',
  },
};

const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'general',
  title,
  description,
  actionLabel,
  onAction,
}) => {
  const config = VARIANT_CONFIG[variant];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-gold/[0.05] border border-gold/10 flex items-center justify-center mb-5">
        {config.icon}
      </div>
      <h3 className="text-lg font-semibold text-textLight mb-2">
        {title || config.defaultTitle}
      </h3>
      <p className="text-sm text-textMuted max-w-sm mb-5">
        {description || config.defaultDesc}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy border border-gold/40 text-gold text-sm font-semibold hover:bg-navySecondary hover:border-gold/60 transition-all duration-200 shadow-gold-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
