import React, { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText,
  cancelText,
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    // ניסיון להתרכז בכפתור אישור
    if (confirmRef.current) {
      try {
        confirmRef.current.focus();
      } catch {
        // ignore focus errors
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [open, onCancel]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const confirmClass = destructive
    ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-lpBlue text-white hover:bg-blue-800';

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-5 space-y-3"
        dir="rtl"
      >
        <h2 className="text-sm font-bold text-slate-900 text-right">{title}</h2>
        {message && <p className="text-xs text-slate-600 text-right whitespace-pre-line">{message}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-slate-300 text-xs text-slate-700 bg-white hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${confirmClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;


