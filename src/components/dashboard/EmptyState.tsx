import React from 'react';
import { FileText } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center text-base text-slate-600">
      <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-blue-800">
        <FileText className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mb-1 font-semibold text-slate-900">{title}</p>
      <p className="mb-3 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center rounded-full bg-blue-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;


