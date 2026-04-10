import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

type ToastOptions = {
  message: string;
  type?: ToastType;
};

type ToastContextValue = {
  showToast: (options: ToastOptions) => void;
};

type ToastState = {
  id: number;
  message: string;
  type: ToastType;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let toastIdCounter = 0;

const TOAST_CONFIG: Record<ToastType, { icon: React.ReactNode; borderColor: string; bgColor: string; textColor: string }> = {
  success: {
    icon: <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
    borderColor: 'border-l-emerald-500',
    bgColor: 'bg-emerald-500/5',
    textColor: 'text-emerald-200',
  },
  error: {
    icon: <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />,
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-500/5',
    textColor: 'text-red-200',
  },
  info: {
    icon: <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />,
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-blue-500/5',
    textColor: 'text-blue-200',
  },
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, type = 'info' }: ToastOptions) => {
      const id = ++toastIdCounter;
      setToasts((prev) => [...prev, { id, message, type }]);
      window.setTimeout(() => removeToast(id), 4000);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed top-5 right-5 z-[260] flex flex-col gap-3 items-end pointer-events-none"
        dir="rtl"
      >
        {toasts.map((toast) => {
          const config = TOAST_CONFIG[toast.type];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto max-w-sm bg-panel border border-borderDark ${config.borderColor} border-l-4 rounded-xl shadow-2xl shadow-black/30 px-4 py-3 flex items-start gap-3 animate-slide-in ${config.bgColor}`}
            >
              {config.icon}
              <span className={`text-[14px] leading-relaxed ${config.textColor} whitespace-pre-line flex-1`}>
                {toast.message}
              </span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-lg hover:bg-navySecondary text-textMuted hover:text-textLight transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};
