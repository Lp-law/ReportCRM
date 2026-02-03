
import React, { useEffect, useState } from 'react';
import type { ReportData } from '../types';

interface DocumentPreviewProps {
  data: ReportData;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ data }) => {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadHtml = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/render-report-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ report: data }),
        });
        if (!response.ok) {
          throw new Error('Failed to load report HTML');
        }
        const text = await response.text();
        if (!cancelled) {
          setHtml(text);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('שגיאה בטעינת התצוגה המקדימה');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadHtml();
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (error) {
    return (
      <div className="w-[210mm] min-h-[297mm] bg-panel border border-borderDark shadow-2xl mx-auto flex items-center justify-center text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (loading && !html) {
    return (
      <div className="w-[210mm] min-h-[297mm] bg-panel shadow-2xl mx-auto flex flex-col items-center justify-center text-sm text-textMuted">
        <span>טוען תצוגה מקדימה...</span>
      </div>
    );
  }

  const shouldShowPolicyNotice =
    !!data.policyFile && (data.attachPolicyAsAppendix ?? true);

  return (
    <div className="space-y-2">
      <iframe
        title="Report Preview"
        className="w-[210mm] min-h-[297mm] bg-panel shadow-2xl mx-auto border-none print:shadow-none print:w-full"
        srcDoc={html}
      />
      {shouldShowPolicyNotice && (
        <p className="w-[210mm] mx-auto text-[11px] text-textMuted text-right">
          The policy file will be attached as Appendix A in the final PDF (not shown in this preview).
        </p>
      )}
    </div>
  );
};