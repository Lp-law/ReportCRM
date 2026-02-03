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
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 text-sm text-gray-500">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500">
        <FileText className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="font-semibold text-gray-700 mb-1">{title}</p>
      <p className="max-w-sm mb-3">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center rounded-full bg-lpBlue px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lpBlue focus-visible:ring-offset-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;


