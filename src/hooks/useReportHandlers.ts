import { useState, useCallback } from 'react';
import type { ReportData, User } from '../types';
import { csrfFetch } from '../utils/csrfFetch';

/**
 * Custom hook for report-level operations:
 * PDF generation, translation, English improvement, email sending.
 *
 * Extracts handler functions from AppInner to reduce its size.
 */
export const useReportHandlers = (
  currentReport: ReportData | null,
  currentUser: User | null,
  saveCurrentReport: () => void,
  showToast: (opts: { message: string; type: 'success' | 'error' | 'info' }) => void,
) => {
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isImprovingEnglish, setIsImprovingEnglish] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isResendMode, setIsResendMode] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    if (!currentReport || isPdfGenerating) return;
    setIsPdfGenerating(true);
    try {
      const response = await csrfFetch('/api/render-report-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: currentReport }),
      });
      if (!response.ok) throw new Error(`PDF generation failed: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${currentReport.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ message: 'PDF downloaded successfully', type: 'success' });
    } catch (error) {
      console.error('PDF generation error:', error);
      showToast({ message: 'Failed to generate PDF', type: 'error' });
    } finally {
      setIsPdfGenerating(false);
    }
  }, [currentReport, isPdfGenerating, showToast]);

  return {
    isPdfGenerating,
    setIsPdfGenerating,
    isTranslating,
    setIsTranslating,
    isImprovingEnglish,
    setIsImprovingEnglish,
    isSendingEmail,
    setIsSendingEmail,
    isResendMode,
    setIsResendMode,
    handleDownloadPdf,
  };
};
