import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

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
    window.addEventListener('keydown', handleKeyDown);
    try { confirmRef.current?.focus(); } catch { /* ignore */ }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-panel border border-borderDark rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-scale-in"
        dir="rtl"
      >
        <div className="flex items-start gap-3 mb-3">
          {destructive && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
          )}
          <div>
            <h2 className="text-sm font-bold text-gold">{title}</h2>
            {message && (
              <p className="text-xs text-textMuted mt-1.5 whitespace-pre-line leading-relaxed">{message}</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-borderDark text-xs font-medium text-textLight bg-navySecondary hover:bg-borderDark transition-all duration-200"
          >
            {cancelText}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
              destructive
                ? 'bg-red-600/80 text-white border border-red-500/30 hover:bg-red-600'
                : 'bg-navy text-gold border border-gold/40 hover:bg-navySecondary hover:border-gold/60'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
