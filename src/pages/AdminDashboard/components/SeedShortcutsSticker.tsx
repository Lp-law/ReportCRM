import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'seedShortcutsStickerCollapsed_v1';

const SeedShortcutsSticker: React.FC = () => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [collapsed]);

  return (
    <div
      className="fixed bottom-4 right-4 z-[260] max-w-xs text-[11px] text-slate-800"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="rounded-xl shadow-lg border border-amber-200 bg-amber-50/95 px-3 py-2"
        style={{ pointerEvents: 'auto' }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="font-semibold flex items-center gap-1">
            <span>⌨️</span>
            <span>Shortcuts</span>
          </div>
          <button
            type="button"
            className="text-[10px] text-slate-600 hover:text-slate-900"
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? '+' : '−'}
          </button>
        </div>
        {!collapsed && (
          <div className="space-y-1">
            <div className="font-semibold text-[10px] text-slate-700">Screenshot</div>
            <ul className="space-y-0.5">
              <li>Ctrl / ⌘ + V – Paste screenshot</li>
              <li>Ctrl / ⌘ + Shift + O – Run OCR</li>
            </ul>
            <div className="font-semibold text-[10px] text-slate-700 mt-1">Reports table</div>
            <ul className="space-y-0.5">
              <li>Enter – Next field</li>
              <li>Shift + Enter – New report row (below)</li>
              <li>Ctrl / ⌘ + Enter – New report row</li>
            </ul>
            <div className="font-semibold text-[10px] text-slate-700 mt-1">Apply</div>
            <ul className="space-y-0.5">
              <li>Ctrl / ⌘ + S – Approve & Apply</li>
            </ul>
            <div className="font-semibold text-[10px] text-slate-700 mt-1">Navigation</div>
            <ul className="space-y-0.5">
              <li>Ctrl + Alt + ↑ / ↓ – Previous / Next case</li>
            </ul>
            <div className="text-[9px] text-slate-500 mt-1">
              Shortcuts work only in this screen.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SeedShortcutsSticker;


