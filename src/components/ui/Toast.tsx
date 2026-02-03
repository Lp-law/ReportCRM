import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';

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

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, type = 'info' }: ToastOptions) => {
      const id = ++toastIdCounter;
      setToasts((prev) => [...prev, { id, message, type }]);

      // Auto-dismiss after ~3 seconds
      window.setTimeout(() => {
        removeToast(id);
      }, 3000);
    },
    [removeToast],
  );

  const getToastClasses = (type: ToastType) => {
    if (type === 'success') {
      return 'border-l-gold text-goldLight';
    }
    if (type === 'error') {
      return 'border-l-danger text-red-300';
    }
    return 'border-l-gold text-textLight';
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed top-4 right-4 z-[260] flex flex-col gap-2 items-end pointer-events-none"
        dir="rtl"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto max-w-xs bg-panel border border-borderDark rounded-lg shadow-lg px-3 py-2 border-l-4 text-xs flex items-center gap-2 text-textLight ${getToastClasses(
              toast.type,
            )}`}
          >
            <span className="whitespace-pre-line">{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="ml-1 p-1 rounded hover:bg-navySecondary text-textMuted"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
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


