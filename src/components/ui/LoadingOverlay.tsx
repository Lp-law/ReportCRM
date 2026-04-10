import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  subMessage?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, message, subMessage }) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bgDark/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-panel border border-borderDark rounded-2xl p-8 shadow-2xl text-center max-w-sm mx-4">
        <div className="relative mx-auto mb-5 w-14 h-14">
          <div className="absolute inset-0 rounded-full border-2 border-gold/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold animate-spin" />
          <Loader2 className="absolute inset-0 m-auto w-6 h-6 text-gold animate-pulse" />
        </div>
        {message && (
          <p className="text-textLight font-semibold text-sm mb-1">{message}</p>
        )}
        {subMessage && (
          <p className="text-textMuted text-xs">{subMessage}</p>
        )}
        <div className="mt-4 w-full h-1 bg-borderDark rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-gold/60 to-gold rounded-full animate-shimmer" style={{ width: '60%', backgroundSize: '200% 100%' }} />
        </div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
