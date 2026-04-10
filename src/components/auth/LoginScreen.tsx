import React, { useState } from 'react';
import { User as UserIcon, KeyRound, ArrowRight, Loader2 } from 'lucide-react';
import type { User } from '../../types';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const externalDashboardUrl = 'https://ringforge.onrender.com/dashboard';

  const handleLogin = async () => {
    if (!username || !password) {
      setError('\u05e0\u05d0 \u05dc\u05d4\u05d6\u05d9\u05df \u05e9\u05dd \u05de\u05e9\u05ea\u05de\u05e9 \u05d5\u05e1\u05d9\u05e1\u05de\u05d4.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error || 'Invalid username or password');
        return;
      }
      const data = await response.json();
      if (data?.user) {
        onLogin(data.user);
      } else {
        setError('Login response was invalid.');
      }
    } catch {
      setError('\u05d4\u05ea\u05d7\u05d1\u05e8\u05d5\u05ea \u05e0\u05db\u05e9\u05dc\u05d4. \u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) handleLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bgDark relative overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-navy/50 via-bgDark to-bgDark" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold/[0.02] rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-gold/[0.03] rounded-full blur-3xl" />

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="bg-panel border border-borderDark rounded-2xl p-10 text-center shadow-2xl backdrop-blur-sm">
          {/* Logo */}
          <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/40 flex items-center justify-center text-4xl font-bold text-gold shadow-lg shadow-gold/10">
            LP
          </div>

          {/* Title */}
          <div className="text-sm tracking-[0.5em] text-gold/80 uppercase mb-2">
            Lloyd&apos;s
          </div>
          <div className="text-3xl font-serif text-textLight mb-1">REPORT</div>
          <div className="text-xs text-textMuted uppercase tracking-[0.4em] mb-8">
            Builder System
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 px-4 py-2.5 bg-danger/10 border border-red-800/30 rounded-lg text-sm text-red-400 animate-scale-in" dir="auto">
              {error}
            </div>
          )}

          {/* Form */}
          <div className="space-y-4 text-left" onKeyDown={handleKeyDown}>
            <div>
              <label className="block text-xs uppercase text-textMuted tracking-[0.2em] mb-1.5">
                Username
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-gold/60 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full bg-navy border border-borderDark rounded-full py-3 pl-10 pr-4 text-textLight placeholder-textMuted/60 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/30 transition-all duration-200"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase text-textMuted tracking-[0.2em] mb-1.5">
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-gold/60 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  className="w-full bg-navy border border-borderDark rounded-full py-3 pl-10 pr-4 text-textLight placeholder-textMuted/60 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/30 transition-all duration-200"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
          </div>

          {/* Sign In button */}
          <button
            onClick={handleLogin}
            disabled={isSubmitting}
            className="mt-8 w-full bg-gradient-to-r from-navy to-navySecondary text-gold border border-gold/50 py-3 rounded-full font-semibold tracking-wide flex items-center justify-center gap-2 hover:border-gold hover:shadow-gold-md transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign In <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Dashboard link */}
          <a
            href={externalDashboardUrl}
            className="mt-3 w-full inline-flex items-center justify-center rounded-full border border-borderDark bg-panel/50 px-4 py-3 text-sm font-semibold text-textMuted transition-all duration-200 hover:bg-navySecondary hover:text-textLight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            aria-label="\u05de\u05e2\u05d1\u05e8 \u05dc\u05d3\u05e9\u05d1\u05d5\u05e8\u05d3 \u05d4\u05d7\u05d9\u05e6\u05d5\u05e0\u05d9"
            dir="rtl"
          >
            \u05d3\u05e9\u05d1\u05d5\u05e8\u05d3
          </a>

          {/* Footer */}
          <div className="mt-8 text-[11px] text-textMuted/60 tracking-[0.3em] uppercase">
            Lior Perry Law Office &amp; Notary &copy; {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
